-- Shared CTM numbering for app.airfriendservice.com and BillFlow.
-- Internal stable IDs, accounting entries, permissions and authentication are preserved.
CREATE TABLE private.af_customer_code_sequences(group_id int PRIMARY KEY CHECK(group_id IN (1,2,3)),last_value bigint NOT NULL DEFAULT 0 CHECK(last_value>=0));
CREATE TABLE private.af_customer_code_allocations(record_key text PRIMARY KEY,group_id int NOT NULL CHECK(group_id IN (1,2,3)),code text NOT NULL UNIQUE);
CREATE TABLE private.af_customer_code_aliases(record_key text NOT NULL,code text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(record_key,code));
ALTER TABLE private.af_customer_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.af_customer_code_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.af_customer_code_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.af_customer_code_sequences,private.af_customer_code_allocations,private.af_customer_code_aliases FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_customer_group(t text) RETURNS int LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN t IN ('บริษัท','company') THEN 2 WHEN t IN ('หน่วยงาน','หน่วยงานราชการ','agency') THEN 3 ELSE 1 END$$;
REVOKE ALL ON FUNCTION private.af_customer_group(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_assign_customer_code(k text,g int) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.af_customer_code_allocations;n bigint;c text;
BEGIN
 IF auth.uid() IS NULL AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 IF g NOT IN (1,2,3) OR k IS NULL OR length(k)>300 THEN RAISE EXCEPTION 'CUSTOMER_CODE_INPUT_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('af-customer-code',0));
 SELECT * INTO a FROM private.af_customer_code_allocations WHERE record_key=k FOR UPDATE;
 IF FOUND AND a.group_id=g THEN RETURN a.code;END IF;
 IF a.code IS NOT NULL THEN INSERT INTO private.af_customer_code_aliases(record_key,code) VALUES(k,a.code) ON CONFLICT DO NOTHING;END IF;
 INSERT INTO private.af_customer_code_sequences(group_id,last_value) VALUES(g,1) ON CONFLICT(group_id) DO UPDATE SET last_value=af_customer_code_sequences.last_value+1 RETURNING last_value INTO n;
 c='CTM-'||g::text||lpad(n::text,greatest(4,length(n::text)),'0');
 INSERT INTO private.af_customer_code_allocations(record_key,group_id,code) VALUES(k,g,c) ON CONFLICT(record_key) DO UPDATE SET group_id=excluded.group_id,code=excluded.code;
 RETURN c;
END$$;
REVOKE ALL ON FUNCTION private.af_assign_customer_code(text,int) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.af_ctm_pga() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text='pga:'||NEW.id::text;c text;
BEGIN
 c=private.af_assign_customer_code(k,private.af_customer_group(NEW.profile->>'type'));
 IF TG_OP='UPDATE' AND OLD.customer_code IS NOT NULL AND OLD.customer_code<>c THEN INSERT INTO private.af_customer_code_aliases(record_key,code) VALUES(k,OLD.customer_code) ON CONFLICT DO NOTHING;END IF;
 NEW.customer_code=c;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.af_ctm_pga() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_af_ctm_pga BEFORE INSERT OR UPDATE ON public.pga_customers FOR EACH ROW EXECUTE FUNCTION private.af_ctm_pga();
CREATE FUNCTION private.af_ctm_billflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE contact jsonb;prior jsonb;out_contacts jsonb='[]';base jsonb='[]';t text;k text;c text;oldcode text;aliases jsonb;
BEGIN
 IF jsonb_typeof(NEW.payload->'contacts') IS DISTINCT FROM 'array' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND jsonb_typeof(OLD.payload->'contacts')='array' THEN base=OLD.payload->'contacts';END IF;
 FOR contact IN SELECT value FROM jsonb_array_elements(NEW.payload->'contacts') LOOP
  IF contact->>'kind'='customer' THEN
   IF coalesce(contact->>'id','')='' THEN RAISE EXCEPTION 'CUSTOMER_ID_REQUIRED';END IF;
   SELECT value INTO prior FROM jsonb_array_elements(base) WHERE value->>'id'=contact->>'id';
   t=coalesce(contact->>'customerType',prior->>'customerType','ทั่วไป');
   IF t NOT IN ('ทั่วไป','ร้านค้า','บริษัท','หน่วยงาน','บุคคลทั่วไป','หน่วยงานราชการ') THEN RAISE EXCEPTION 'CUSTOMER_TYPE_INVALID';END IF;
   k='billflow:'||NEW.owner::text||':'||(contact->>'id');c=private.af_assign_customer_code(k,private.af_customer_group(t));
   oldcode=coalesce(prior->>'code',contact->>'code');
   IF oldcode IS NOT NULL AND oldcode<>c THEN INSERT INTO private.af_customer_code_aliases(record_key,code) VALUES(k,oldcode) ON CONFLICT DO NOTHING;END IF;
   SELECT coalesce(jsonb_agg(code ORDER BY changed_at),'[]'::jsonb) INTO aliases FROM private.af_customer_code_aliases WHERE record_key=k;
   contact=contact||jsonb_build_object('code',c,'customerType',t,'previousCodes',aliases);
  END IF;
  out_contacts=out_contacts||jsonb_build_array(contact);
 END LOOP;
 NEW.payload=jsonb_set(NEW.payload,'{contacts}',out_contacts);RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.af_ctm_billflow() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_af_ctm_billflow BEFORE INSERT OR UPDATE OF payload ON public.billflow_ledgers FOR EACH ROW EXECUTE FUNCTION private.af_ctm_billflow();
-- Exclusive table lock lasts only for this transactional migration. Restore the
-- existing customer guard before commit; no runtime permission bypass is added.
ALTER TABLE public.pga_customers DISABLE TRIGGER pga_customer_security;
UPDATE public.pga_customers SET customer_code=customer_code;
ALTER TABLE public.pga_customers ENABLE TRIGGER pga_customer_security;
UPDATE public.billflow_ledgers SET payload=payload,revision=revision+1,updated_at=now()
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(payload->'contacts','[]'::jsonb)) c WHERE c->>'kind'='customer');
