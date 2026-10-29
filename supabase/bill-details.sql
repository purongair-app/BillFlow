begin;
create function billflow_private.check_bill_details(b jsonb,gross numeric,entry_type text,chart jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare l jsonb; k text; positive numeric:=0; discount numeric:=0; line_amount numeric; vat numeric; code text;
begin
 if b is null or b='null'::jsonb then return;end if;
 if jsonb_typeof(b) is distinct from 'object' or entry_type='transfer' or jsonb_typeof(b->'lines') is distinct from 'array' then raise exception 'BILL_INVALID';end if;
 if jsonb_array_length(b->'lines') not between 1 and 100 or coalesce(b->>'vatMode','') not in ('unknown','none','included','excluded') or jsonb_typeof(b->'vat') is distinct from 'number' or jsonb_typeof(b->'separateVat') is distinct from 'boolean' then raise exception 'BILL_INVALID';end if;
 vat:=(b->>'vat')::numeric;
 if vat<0 or vat>1e14 or vat<>trunc(vat) or gross is null or gross<=0 or gross>1e14 or gross<>trunc(gross) then raise exception 'BILL_INVALID_AMOUNT';end if;
 if b->>'vatMode' in ('none','unknown') and (vat<>0 or b->>'separateVat'='true') or b->>'vatMode'='included' and vat>gross then raise exception 'BILL_INVALID_VAT';end if;
 for l in select value from jsonb_array_elements(b->'lines') loop
  if jsonb_typeof(l) is distinct from 'object' or coalesce(l->>'kind','') not in ('item','discount','service','shipping','other') or jsonb_typeof(l->'description') is distinct from 'string' or length(trim(l->>'description')) not between 1 and 500 or jsonb_typeof(l->'amount') is distinct from 'number' or jsonb_typeof(l->'code') is distinct from 'string' then raise exception 'BILL_INVALID_LINE';end if;
  line_amount:=(l->>'amount')::numeric;
  if line_amount<0 or line_amount>1e14 or line_amount<>trunc(line_amount) then raise exception 'BILL_INVALID_AMOUNT';end if;
  if l->>'kind'='discount' then discount:=discount+line_amount;else positive:=positive+line_amount;end if;
  if l->'quantity' is null then raise exception 'BILL_INVALID_QUANTITY';end if;
  if l->'quantity'<>'null'::jsonb then
   if jsonb_typeof(l->'quantity') is distinct from 'number' then raise exception 'BILL_INVALID_QUANTITY';end if;
   if (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>1e9 then raise exception 'BILL_INVALID_QUANTITY';end if;
  end if;
  code:=l->>'code';
  if code<>'' then
   if code!~'^\d{4,10}$' then raise exception 'BILL_INVALID_CODE';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(chart,'[]'::jsonb)) a where a->>'code'=code and coalesce(a->>'cashAccountId','')<>'') then raise exception 'BILL_CASH_CODE_FORBIDDEN';end if;
   if not exists(select 1 from jsonb_array_elements(coalesce(chart,'[]'::jsonb)) a where a->>'code'=code and coalesce(a->>'cashAccountId','')='') and code not in ('110000','111000','112000','113000','114000','115000','116000','120000','121000','129000','210000','211000','212000','213000','214000','215000','220000','310000','320000','330000','390000','410000','420000','421000','430000','490000','510000','511000','519000','520000','521000','530000','531000','532000','533000','540000','541000','542000','543000','550000','551000','560000','570000','580000','590000') then raise exception 'BILL_UNKNOWN_CODE';end if;
  end if;
 end loop;
 if positive<=discount or positive>9007199254740991 or discount>9007199254740991 or positive-discount+(case when b->>'vatMode'='excluded' then vat else 0 end)<>gross then raise exception 'BILL_TOTAL_MISMATCH';end if;
end $$;
revoke all on function billflow_private.check_bill_details(jsonb,numeric,text,jsonb) from public,anon,authenticated;
create function billflow_private.validate_bill_details() returns trigger language plpgsql security invoker set search_path='' as $$
declare section text; e jsonb; prior jsonb; result jsonb;
begin
 foreach section in array array['entries','debts'] loop
  result:='[]'::jsonb;
  for e in select value from jsonb_array_elements(new.payload->section) loop
   -- Keep details when an older browser does not send the new field.
   if tg_op='UPDATE' and not(e?'billDetails') then
    select value->'billDetails' into prior from jsonb_array_elements(old.payload->section) where value->>'id'=e->>'id';
    if prior is not null then e:=jsonb_set(e,'{billDetails}',prior);end if;
   end if;
   perform billflow_private.check_bill_details(e->'billDetails',(e->>'amount')::numeric,e->>'type',new.payload#>'{bookkeeping,chart}');
   result:=result||jsonb_build_array(e);
  end loop;
  new.payload:=jsonb_set(new.payload,array[section],result);
 end loop;
 return new;
end $$;
revoke all on function billflow_private.validate_bill_details() from public,anon,authenticated;
create trigger billflow_validate_bill_details before insert or update of payload on public.billflow_ledgers for each row execute function billflow_private.validate_bill_details();
commit;
