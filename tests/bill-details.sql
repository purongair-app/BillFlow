-- Exercise the production validator on a temporary table; no customer ledger is modified.
begin;
create temporary table bill_details_qa(payload jsonb) on commit drop;
create trigger bill_details_qa_validate before insert or update on bill_details_qa for each row execute function billflow_private.validate_bill_details();
do $$
declare b jsonb:='{"lines":[{"kind":"shipping","description":"EMS","quantity":null,"amount":3700,"code":"541000"},{"kind":"shipping","description":"ค่าบริการขนส่งเพิ่มเติม","quantity":null,"amount":300,"code":"541000"}],"vatMode":"unknown","vat":0,"separateVat":false}'; p jsonb; candidate jsonb; rejected boolean;
begin
 perform billflow_private.check_bill_details(b,4000,'expense','[]');
 p:=jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id','qa','type','expense','amount',4000,'billDetails',b)),'debts','[]'::jsonb);
 insert into bill_details_qa values(p);
 -- An older browser omitting details preserves them, while explicit null removes them.
 update bill_details_qa set payload=jsonb_set(payload,'{entries,0}',(payload#>'{entries,0}')-'billDetails');
 if (select payload#>'{entries,0,billDetails}' from bill_details_qa) is distinct from b then raise exception 'QA_OLD_BROWSER_LOSS';end if;
 update bill_details_qa set payload=jsonb_set(payload,'{entries,0,billDetails}','null');
 if (select payload#>'{entries,0,billDetails}' from bill_details_qa)<>'null'::jsonb then raise exception 'QA_NULL_NOT_REMOVED';end if;
 -- Never store a mismatched total, fractional satang, or a cash-account line.
 rejected:=false;begin perform billflow_private.check_bill_details(b,4001,'expense','[]');exception when others then if sqlerrm='BILL_TOTAL_MISMATCH' then rejected:=true;else raise;end if;end;if not rejected then raise exception 'QA_MISMATCH_ACCEPTED';end if;
 rejected:=false;begin perform billflow_private.check_bill_details(jsonb_set(b,'{lines,0,amount}','3700.1'),4000.1,'expense','[]');exception when others then rejected:=true;end;if not rejected then raise exception 'QA_FRACTION_ACCEPTED';end if;
 rejected:=false;begin perform billflow_private.check_bill_details(jsonb_set(b,'{lines,0,code}','"101001"'),4000,'expense','[{"code":"101001","cashAccountId":"cash"}]');exception when others then if sqlerrm='BILL_CASH_CODE_FORBIDDEN' then rejected:=true;else raise;end if;end;if not rejected then raise exception 'QA_CASH_ACCEPTED';end if;
 rejected:=false;begin perform billflow_private.check_bill_details(b,4000,'transfer','[]');exception when others then if sqlerrm='BILL_INVALID' then rejected:=true;else raise;end if;end;if not rejected then raise exception 'QA_TRANSFER_ACCEPTED';end if;
 candidate:='{"lines":[{"kind":"item","description":"Paper","quantity":100,"amount":1030000,"code":""},{"kind":"discount","description":"Discount","quantity":null,"amount":30000,"code":""}],"vatMode":"included","vat":65421,"separateVat":true}';
 perform billflow_private.check_bill_details(candidate,1000000,'expense','[]');
 -- Debt documents retain the same structure and do not become cash entries.
 delete from bill_details_qa;
 insert into bill_details_qa values(jsonb_build_object('entries','[]'::jsonb,'debts',jsonb_build_array(jsonb_build_object('id','debt-qa','type','payable','amount',4000,'billDetails',b))));
 update bill_details_qa set payload=jsonb_set(payload,'{debts,0}',(payload#>'{debts,0}')-'billDetails');
 if (select payload#>'{debts,0,billDetails}' from bill_details_qa) is distinct from b then raise exception 'QA_DEBT_DETAILS_LOST';end if;
end $$;
select 'bill_details_validation_and_compatibility_passed' as result;
rollback;
