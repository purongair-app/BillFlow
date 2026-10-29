begin;
create function billflow_private.validate_withholding() returns trigger language plpgsql security invoker set search_path='' as $$
declare e jsonb; w jsonb; prior jsonb; result jsonb:='[]'::jsonb; gross numeric; base numeric; rate numeric; amount numeric; k text;
begin
 for e in select value from jsonb_array_elements(new.payload->'entries') loop
  if tg_op='UPDATE' and not(e?'withholding') then
   select value->'withholding' into prior from jsonb_array_elements(old.payload->'entries') where value->>'id'=e->>'id';
   if prior is not null then e:=jsonb_set(e,'{withholding}',prior);end if;
  end if;
  w:=e->'withholding';
  if w is not null and w<>'null'::jsonb then
   if jsonb_typeof(w) is distinct from 'object' or e->>'type' not in ('income','expense') then raise exception 'WHT_INVALID_TYPE';end if;
   if jsonb_typeof(w->'rate') is distinct from 'number' or jsonb_typeof(w->'base') is distinct from 'number' or jsonb_typeof(w->'amount') is distinct from 'number' or jsonb_typeof(w->'manual') is distinct from 'boolean' then raise exception 'WHT_INVALID_AMOUNT';end if;
   gross:=(e->>'amount')::numeric;rate:=(w->>'rate')::numeric;base:=(w->>'base')::numeric;amount:=(w->>'amount')::numeric;
   if rate<=0 or rate>100 or rate*100<>round(rate*100) or base<=0 or base>gross or base<>trunc(base) or amount<0 or amount>gross or amount<>trunc(amount) then raise exception 'WHT_INVALID_AMOUNT';end if;
   if w->>'manual'='false' and amount<>round(base*rate/100) then raise exception 'WHT_CALCULATION_MISMATCH';end if;
   foreach k in array array['certificateNo','certificateDate','payerTaxId','payeeTaxId','form','note'] loop
    if jsonb_typeof(w->k) is distinct from 'string' or length(w->>k)>(case when k='note' then 500 else 100 end) then raise exception 'WHT_INVALID_DETAIL';end if;
   end loop;
   if w->>'manual'='true' and length(trim(w->>'note'))=0 then raise exception 'WHT_REASON_REQUIRED';end if;
   if w->>'form' not in ('','pnd3','pnd53','other') or (w->>'payerTaxId'<>'' and w->>'payerTaxId'!~'^\d{13}$') or (w->>'payeeTaxId'<>'' and w->>'payeeTaxId'!~'^\d{13}$') then raise exception 'WHT_INVALID_DETAIL';end if;
   if w->>'certificateDate'<>'' and (w->>'certificateDate'!~'^\d{4}-\d{2}-\d{2}$' or to_char((w->>'certificateDate')::date,'YYYY-MM-DD')<>w->>'certificateDate') then raise exception 'WHT_INVALID_DATE';end if;
  end if;
  result:=result||jsonb_build_array(e);
 end loop;
 new.payload:=jsonb_set(new.payload,'{entries}',result);
 return new;
end $$;
revoke all on function billflow_private.validate_withholding() from public,anon,authenticated;
create trigger billflow_validate_withholding before insert or update of payload on public.billflow_ledgers for each row execute function billflow_private.validate_withholding();
commit;
