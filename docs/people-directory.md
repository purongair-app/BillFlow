# Unified people directory

- One menu: รายชื่อ / ผู้ติดต่อ.
- Add/edit type selector: ลูกค้า, เจ้าหนี้, พนักงาน.
- Combined table with type, status, and text filters; unclassified legacy contacts remain visible.
- Existing IDs and historical transaction names remain intact. Linked records can be disabled instead of deleted.
- Customer/creditor classifications can change. A linked employee cannot be converted to a contact, or vice versa, because the historical reference types differ; unused records can change type.
- Transaction pickers continue to use the applicable type. No ledger migration or sample user data is inserted.
- Validation: 25 automated tests and TypeScript/Vite production build passed.
