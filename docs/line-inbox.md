# LINE document inbox

The live webhook accepts images only from the bound group, after verifying the LINE signature. It deduplicates message IDs and image hashes, stores images up to 5 MB privately, and replies with a link to the owner review inbox. Work is claimed by the existing scheduled worker with stale-claim recovery. Unsent, unconfirmed images are withdrawn.

The owner can inspect the original, enter or correct fields, reject a draft, or confirm a debt/entry. Confirmation and ledger revision update run in one transaction. Invoice imports create receivables/payables without changing bank balances. Slip imports require choosing direction/accounts and can partially settle an existing debt. Editing a debt preserves its evidence.

## Gemini OCR

The owner explicitly authorized sending group invoice/slip images to Google Gemini in the conversation on 2026-10-29. The live function now includes OCR. It reads a server-side key from encrypted Vault configuration or an existing GEMINI_API_KEY environment variable. The owner can verify and save a key from the document inbox; it is never returned to clients. Model access is verified before saving. Documents waiting for a key are requeued after configuration.

No real extraction success is claimed until a valid key is configured and an actual image test completes. Requests to Google include only the image, extraction instructions, and API credentials needed for that service. OCR never confirms a ledger entry itself.

## Validation

The accounting and OCR unit checks pass. A rolled-back SQL transaction checked atomic confirmation and repeat rejection without retaining financial test data. Signed synthetic webhooks checked ingestion, redelivery deduplication and invalid-signature rejection; dummy LINE message content is expected to fail download. No real OCR success is claimed without a configured key. Browser QA is unavailable because the managed preview daemon cannot access workspace dependencies. Test actual capture by sending a new image after deployment.

A real LINE image completed extraction with gemini-3.5-flash-lite on 2026-10-29. The configured 3.8 model exceeded 45 and 90 second request deadlines; the verified model is now the default. Extraction remains a review draft, not an automatically posted ledger record. No customer details are included in this development note.
