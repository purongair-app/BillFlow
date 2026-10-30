-- Existing production projection, used only by the isolated database tests.
CREATE OR REPLACE FUNCTION billflow_private.project_payload(p jsonb, menus text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('business',coalesce(p->'business','""'),'accounts',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then coalesce(p->'accounts','[]') else '[{"id":"restricted","name":"บัญชีที่ไม่เปิดสิทธิ์","opening":0}]'::jsonb end,
 'entries',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then coalesce(p->'entries','[]') else '[]'::jsonb end,
 'debts',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then coalesce(p->'debts','[]') else '[]'::jsonb end,
 'categories',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then coalesce(p->'categories','[]') else '[]'::jsonb end,
 'contacts',case when cardinality(menus)>0 then coalesce(p->'contacts','[]') else '[]'::jsonb end,
 'employees',case when cardinality(menus)>0 then coalesce(p->'employees','[]') else '[]'::jsonb end,
 'recurringExpenseNames',case when 'budgets'=any(menus) then p->'recurringExpenseNames' else null end, 'recurringExpenses',case when 'budgets'=any(menus) then coalesce(p->'recurringExpenses','[]') else '[]'::jsonb end, 'budgets',case when 'budgets'=any(menus) then coalesce(p->'budgets','[]') else '[]'::jsonb end,
 'documentSources',case when 'debts'=any(menus) then coalesce(p->'documentSources','[]') else '[]'::jsonb end,
 'accountHolders',case when 'accounts'=any(menus) then coalesce(p->'accountHolders','[]') else '[]'::jsonb end,'bookkeeping',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then p->'bookkeeping' else null end,'payroll',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] then coalesce(p->'payroll','[]'::jsonb) else '[]'::jsonb end,'numbering',coalesce(p->'numbering','{}'::jsonb),'audit','[]'::jsonb);
$function$
;