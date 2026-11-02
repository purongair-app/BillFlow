-- AFS-YYTNNN: Buddhist employment year, personnel category, 001–999.
CREATE TABLE private.af_personnel_sequences(head text PRIMARY KEY,last_value int NOT NULL DEFAULT 0 CHECK(last_value BETWEEN 0 AND 999));
CREATE TABLE private.af_personnel_allocations(record_key text PRIMARY KEY,head text NOT NULL,code text NOT NULL UNIQUE);
CREATE TABLE private.af_personnel_aliases(record_key text NOT NULL,code text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(record_key,code));
ALTER TABLE private.af_personnel_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.af_personnel_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.af_personnel_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.af_personnel_sequences,private.af_personnel_allocations,private.af_personnel_aliases FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_personnel_head(d jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE yr int;typ text;grp text;
BEGIN
 IF coalesce(d->>'employmentYear','') ~ '^[0-9]{4}$' THEN yr=(d->>'employmentYear')::int;
 ELSIF coalesce(d->>'startDate','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN yr=extract(year from (d->>'startDate')::date)::int+543;
 ELSE RAISE EXCEPTION 'กรุณาระบุปีเริ่มงาน พ.ศ. หรือวันที่เริ่มงานก่อนออกรหัสพนักงาน';END IF;
 IF yr NOT BETWEEN 2400 AND 2999 THEN RAISE EXCEPTION 'ปีเริ่มงานต้องเป็น พ.ศ. 4 หลัก';END IF;
 typ=coalesce(nullif(d->>'personnelType',''),CASE WHEN d->>'accessRole'='owner' OR d->>'position' IN ('เจ้าของ','ผู้บริหาร','เจ้าของ/ผู้บริหาร') THEN 'เจ้าของ/ผู้บริหาร' WHEN d->>'employmentType'='นักศึกษาฝึกงาน' OR d->>'accessRole'='intern' THEN 'นักศึกษาฝึกงาน' ELSE 'พนักงาน' END);
 grp=CASE typ WHEN 'เจ้าของ/ผู้บริหาร' THEN '1' WHEN 'พนักงาน' THEN '2' WHEN 'นักศึกษาฝึกงาน' THEN '3' ELSE NULL END;
 IF grp IS NULL THEN RAISE EXCEPTION 'ประเภทบุคลากรไม่ถูกต้อง';END IF;
 RETURN 'AFS-'||right(yr::text,2)||grp;
END$$;
REVOKE ALL ON FUNCTION private.af_personnel_head(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_assign_personnel_code(k text,h text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.af_personnel_allocations;n int;c text;
BEGIN
 IF auth.uid() IS NULL AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 IF coalesce(k,'')='' OR length(k)>300 OR h !~ '^AFS-[0-9]{2}[123]$' THEN RAISE EXCEPTION 'PERSONNEL_CODE_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('af-personnel-code',0));
 SELECT * INTO a FROM private.af_personnel_allocations WHERE record_key=k FOR UPDATE;
 IF FOUND AND a.head=h THEN RETURN a.code;END IF;
 IF a.code IS NOT NULL THEN INSERT INTO private.af_personnel_aliases(record_key,code) VALUES(k,a.code) ON CONFLICT DO NOTHING;END IF;
 INSERT INTO private.af_personnel_sequences(head,last_value) VALUES(h,1) ON CONFLICT(head) DO UPDATE SET last_value=af_personnel_sequences.last_value+1 RETURNING last_value INTO n;
 c=h||lpad(n::text,3,'0');
 INSERT INTO private.af_personnel_allocations(record_key,head,code) VALUES(k,h,c) ON CONFLICT(record_key) DO UPDATE SET head=excluded.head,code=excluded.code;
 RETURN c;
END$$;
REVOKE ALL ON FUNCTION private.af_assign_personnel_code(text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_afs_records() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d jsonb;k text;c text;oldcode text;
BEGIN
 IF NEW.kind<>'tech' THEN RETURN NEW;END IF;d=NEW.payload::jsonb;
 IF d->>'accountOnly'='true' THEN RETURN NEW;END IF;
 k='pga:'||NEW.id;c=private.af_assign_personnel_code(k,private.af_personnel_head(d));
 IF TG_OP='UPDATE' THEN oldcode=OLD.payload::jsonb->>'employeeCode';IF oldcode IS NOT NULL AND oldcode<>c THEN INSERT INTO private.af_personnel_aliases(record_key,code) VALUES(k,oldcode) ON CONFLICT DO NOTHING;END IF;END IF;
 NEW.payload=jsonb_set(d,'{employeeCode}',to_jsonb(c))::text;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.af_afs_records() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_af_afs_records BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW EXECUTE FUNCTION private.af_afs_records();
CREATE FUNCTION private.af_afs_billflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee jsonb;prior jsonb;out_employees jsonb='[]';base jsonb='[]';d jsonb;k text;c text;h text;oldcode text;aliases jsonb;
BEGIN
 IF jsonb_typeof(NEW.payload->'employees') IS DISTINCT FROM 'array' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND jsonb_typeof(OLD.payload->'employees')='array' THEN base=OLD.payload->'employees';END IF;
 FOR employee IN SELECT value FROM jsonb_array_elements(NEW.payload->'employees') LOOP
  IF coalesce(employee->>'id','')='' THEN RAISE EXCEPTION 'EMPLOYEE_ID_REQUIRED';END IF;
  SELECT value INTO prior FROM jsonb_array_elements(base) WHERE value->>'id'=employee->>'id';
  d=coalesce(prior,'{}'::jsonb)||employee;
  -- Preserve existing classification if an older browser does not know the fields.
  IF NOT employee?'personnelType' AND prior?'personnelType' THEN employee=jsonb_set(employee,'{personnelType}',prior->'personnelType');END IF;
  IF NOT employee?'employmentYear' AND prior?'employmentYear' THEN employee=jsonb_set(employee,'{employmentYear}',prior->'employmentYear');END IF;
  h=private.af_personnel_head(d);k='billflow:'||NEW.owner::text||':'||(employee->>'id');c=private.af_assign_personnel_code(k,h);
  oldcode=coalesce(prior->>'code',employee->>'code');
  IF oldcode IS NOT NULL AND oldcode<>c THEN INSERT INTO private.af_personnel_aliases(record_key,code) VALUES(k,oldcode) ON CONFLICT DO NOTHING;END IF;
  SELECT coalesce(jsonb_agg(code ORDER BY changed_at),'[]'::jsonb) INTO aliases FROM private.af_personnel_aliases WHERE record_key=k;
  employee=employee||jsonb_build_object('code',c,'previousCodes',aliases);out_employees=out_employees||jsonb_build_array(employee);
 END LOOP;
 NEW.payload=jsonb_set(NEW.payload,'{employees}',out_employees);RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.af_afs_billflow() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_af_afs_billflow BEFORE INSERT OR UPDATE OF payload ON public.billflow_ledgers FOR EACH ROW EXECUTE FUNCTION private.af_afs_billflow();
-- Never bypass locked employee profiles; only update existing staff with known dates.
UPDATE public.records SET payload=jsonb_set(payload::jsonb,'{version}',to_jsonb(version+1))::text,version=version+1,updated_at=now()::text WHERE kind='tech' AND coalesce(payload::jsonb->>'accountOnly','false')<>'true' AND NOT private.employee_profile_is_locked(id);
UPDATE public.billflow_ledgers SET payload=payload,revision=revision+1,updated_at=now() WHERE jsonb_array_length(coalesce(payload->'employees','[]'::jsonb))>0;
