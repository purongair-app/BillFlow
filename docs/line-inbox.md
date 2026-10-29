# LINE document inbox

The live webhook accepts images only from the bound group, after verifying the LINE signature. It deduplicates message IDs and image hashes, stores images up to 5 MB privately, and replies with a link to the owner review inbox. Work is claimed by the existing scheduled worker with stale-claim recovery. Unsent, unconfirmed images are withdrawn.

The owner can inspect the original, enter or correct fields, reject a draft, or confirm a debt/entry. Confirmation and ledger revision update run in one transaction. Invoice imports create receivables/payables without changing bank balances. Slip imports require choosing direction/accounts and can partially settle an existing debt. Editing a debt preserves its evidence.

## OCR is not active

Automatic approval review rejected Google Gemini extraction because explicit authorization to disclose invoice/slip images to Google is missing. The live function sends no images or API keys to Google. `inbox.ocr.pending.ts` and `ocr.ts` are prepared code not imported by the live entry point. Enabling requires explicit authorization, securely configured API access and a real extraction test.

## Validation

28 unit checks pass. A rolled-back SQL transaction checked atomic confirmation and repeat rejection without retaining financial test data. Signed synthetic webhooks checked ingestion, redelivery deduplication and invalid-signature rejection; dummy LINE message content is expected to fail download. No real OCR success is claimed. Browser QA is unavailable because the managed preview daemon cannot access workspace dependencies. Test actual capture by sending a new image after deployment.
