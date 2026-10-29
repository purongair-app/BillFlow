# BillFlow

ระบบรายรับรายจ่ายภาษาไทย รองรับมือถือ แท็บเล็ต และคอมพิวเตอร์

เป้าหมายเผยแพร่: https://purongair-app.github.io/BillFlow/

## ความสามารถ

- สมัครด้วยอีเมลและรหัสผ่าน ยืนยันอีเมล ล็อกอิน ออกจากระบบ ส่งอีเมลยืนยันซ้ำ และตั้งรหัสผ่านใหม่
- ป้องกันข้อมูลก่อนล็อกอิน และแยกบัญชีผู้ใช้ด้วย Supabase Auth + Row Level Security
- รายรับ รายจ่าย โอนระหว่างบัญชี แก้ไข ลบ แนบบิล JPG/PNG/WEBP/PDF ไม่เกิน 5 MB
- บัญชีเงินสด/ธนาคาร ยอดยกมา ยอดคงเหลือคำนวณใหม่จากทุกรายการ
- ลูกหนี้เจ้าหนี้ รับ/จ่ายบางส่วนได้ ป้องกันยอดชำระเกินหนี้
- งบประมาณหมวดหมู่ประจำเดือน รายงานย้อนหลัง ส่งออก CSV พิมพ์รายงาน
- สำรองและกู้คืนข้อมูล JSON (ไม่รวมไฟล์แนบ ต้องดาวน์โหลดเก็บแยก)
- ใช้จำนวนเต็มหน่วยสตางค์ ป้องกันทศนิยมคลาดเคลื่อน และตรวจ revision ก่อนบันทึกข้ามอุปกรณ์

## สมุดบัญชีและรายจ่ายรายย่อย

- เข้า **รายการรับ–จ่าย > เพิ่มรายการ / แก้ไข > รายจ่าย** เพื่อเลือกประเภทรายจ่ายย่อย
- ค่าน้ำมัน: ระบุรถ / ทะเบียนและผู้เบิก
- ค่าอาหาร: ระบุผู้เบิกและในนามใคร / ทีมไหน
- ค่าไฟฟ้าและค่าน้ำประปา: ระบุบ้าน อาคาร หรือสาขา พร้อมเลขมิเตอร์และรอบบิลได้
- เลขที่เอกสารสร้างอัตโนมัติเป็น RV / PV / TR ตามปี พ.ศ. เดือน และลำดับ หรือกรอกเลขเองโดยไม่ซ้ำ
- เมนู **สมุดบัญชี** แสดงยอดยกมา รายรับ รายจ่าย ยอดคงเหลือรายแถว และสรุปรายจ่ายแยกตามรถ สถานที่ ผู้เบิก และผู้รับประโยชน์
- กรองตามเดือน บัญชีเงิน ประเภทรายจ่ายย่อย และค้นหาข้อมูลรายละเอียดได้ ส่งออก CSV หรือพิมพ์แนวนอนได้
- ตัวกรองรายละเอียดเปลี่ยนเฉพาะรายการที่แสดง ส่วนยอดคงเหลือยังอ้างอิงรายการทั้งหมดของบัญชีที่เลือก
- ยอดรวมทุกบัญชีไม่นับการโอนภายในเป็นรายรับรายจ่ายซ้ำ ส่วนสมุดรายบัญชีรวมโอนเข้าออกเพื่อกระทบยอด
- รายการเดิมยังใช้ได้โดยไม่ต้องกรอกเพิ่มทันที เมื่อกดแก้ไขสามารถเติมรายละเอียดรายย่อยได้
- ปุ่มเพิ่มรายการรับ–จ่ายอยู่เฉพาะหน้ารายการรับ–จ่าย ตัวเลือกเดือนอยู่เฉพาะภาพรวม รายการรับ–จ่าย สมุดบัญชี งบประมาณ และรายงาน

## สถานะ

เชื่อมโครงการ PUROnGAIR เดิม (`maxqjstknhwhymsugutz`) แล้ว โดยแยกตาราง `billflow_ledgers` และ bucket ส่วนตัว `billflow-receipts`
บัญชีสมาชิกใช้ร่วมกับ PUROnGAIR; ข้อมูลการเงินและบิลแยกตามผู้ใช้
อีเมลติดต่อเจ้าของ: airfriendnara@gmail.com
เปิดฟังก์ชันสมัครใหม่ ส่งอีเมลยืนยัน ลืมรหัสผ่าน และล็อกอินแล้ว
ยืนยันการตั้งค่า Sender email address จากภาพเจ้าของว่าเป็น `airfriendnara@gmail.com` และเปิด custom SMTP อยู่
เพิ่ม callback URL ของ BillFlow แล้ว โดยรักษา Site URL และ Redirect URL เดิมของ PUROnGAIR ครบ
ยังไม่ได้ทดสอบส่งอีเมลถึงกล่องจดหมายจริง หรือทดสอบเข้าสู่ระบบด้วยรหัสผ่านผู้ใช้จริง
ค่า URL และ publishable key ของโครงการที่อนุญาตอยู่ใน `src/config.ts`; ค่า build environment สามารถ override ได้
`src/config.ts` เปิด `authEmailConfigured` แล้ว; ควรทดสอบการส่งถึงจริงก่อนขยายการใช้งาน
ไม่มีข้อมูลการเงินตัวอย่างถูกใส่ให้ผู้ใช้จริง
ไม่มีการใช้หรือเชื่อมต่อ Replit

## ตั้งค่าเปิดใช้งานจริง

1. ใช้โครงการ PUROnGAIR เดิมตามที่เจ้าของอนุญาตแล้ว
2. ใช้ migration `billflow_initialize_private_ledgers_and_receipts` ที่นำขึ้นโครงการแล้ว — ห้ามรัน setup ซ้ำ
3. ตั้ง Authentication > URL Configuration:
   - รักษา Site URL ของ PUROnGAIR เดิม (ใช้โครงการ Auth ร่วมกัน)
   - เพิ่ม Redirect URL: `https://purongair-app.github.io/BillFlow/` โดยเก็บรายการเดิมไว้ครบ
4. เปิด Email provider และ **Confirm email** ไม่ควรปิดการยืนยันอีเมล
5. ตั้ง Authentication > Email > Custom SMTP ด้วยบัญชีผู้ส่งที่เจ้าของอนุญาต
   - Sender name: คงชื่อเดิมที่ใช้ร่วมกับ PUROnGAIR
   - Sender email: `airfriendnara@gmail.com` หลังเจ้าของเชื่อม SMTP และยืนยันผู้ส่ง
   - ตั้ง host, port, username และ password ใน Supabase เท่านั้น
   - Gmail ต้องใช้ App Password ของบัญชีที่เจ้าของอนุญาต ไม่ใช้รหัสผ่าน Gmail ปกติ
   - Supabase SMTP เริ่มต้นไม่เหมาะสำหรับเปิดรับผู้ใช้ทั่วไป
6. ตั้งอีเมลยืนยันสมัครและรีเซ็ตรหัสผ่านจาก `supabase/email-templates.md`
7. GitHub repository > Settings > Secrets and variables > Actions > Variables:
   - `VITE_SUPABASE_URL`: Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: publishable key (ห้ามใส่ service_role หรือ secret key)
   - `VITE_OWNER_EMAIL`: `airfriendnara@gmail.com`
   - `VITE_AUTH_EMAIL_READY`: เปิดผ่านค่า `authEmailConfigured` ใน `src/config.ts` แล้ว
8. Settings > Pages > Build and deployment > Source: **GitHub Actions**
9. รัน workflow `Deploy BillFlow` หรือ push main
10. ทดสอบสมัครด้วยอีเมลจริง ยืนยันอีเมล ล็อกอิน ลืมรหัสผ่าน บันทึกบัญชีจากสองอุปกรณ์ และทดสอบว่าผู้ใช้ B อ่านข้อมูล/ไฟล์ของผู้ใช้ A ไม่ได้

ห้ามใส่ SMTP password, Gmail App Password, service_role หรือ database password ลงใน repository หรือ VITE_* เพราะโค้ดหน้าเว็บเป็นข้อมูลสาธารณะ

## พัฒนา

```bash
npm ci
cp .env.example .env
npm run dev
npm test
npm run build
```

ประวัติการแก้ไขเป็นประวัติในพื้นที่ส่วนตัวของผู้ใช้ ไม่ใช่ audit log ที่ป้องกันเจ้าของบัญชีแก้ไขเอง
อีเมลที่ระบบส่งในเวอร์ชันนี้เป็นการยืนยันสมัครและรีเซ็ตรหัสผ่าน ยังไม่รวมการส่งสรุปหรือแจ้งเตือนลูกหนี้อัตโนมัติ

## พนักงาน

- เมนูพนักงาน: เพิ่ม แก้ไข ค้นหา เปิด/ปิดใช้งาน พร้อมรหัสพนักงานไม่ซ้ำ
- ปุ่มจัดการข้างชื่อในแบบฟอร์มบัญชี เปิดจัดการรายชื่อโดยไม่เสียข้อมูลที่กำลังกรอก
- เลือกชื่อผู้รับเงิน ผู้จ่ายเงิน ผู้เบิก และผู้รับประโยชน์จากพนักงานที่ใช้งาน หรือพิมพ์ชื่อภายนอกเอง
- เก็บชื่อและรหัสอ้างอิงในรายการเดิม การเปลี่ยนชื่อ/ปิดใช้งานไม่เปลี่ยนประวัติ ลบได้เฉพาะพนักงานที่ไม่มีรายการอ้างอิง
- รายชื่อนี้แยกตามบัญชี BillFlow ไม่สร้างบัญชีล็อกอินหรือสิทธิ์ในระบบอื่น
- ประเภทโอนระหว่างบัญชีใช้หมวดโอนภายในอัตโนมัติ เช่น นำเงินสดร้านฝากเข้าธนาคาร

## ลูกค้า / คู่ค้า

- กดจัดการลูกค้า / คู่ค้าในแบบฟอร์มรายการ หรือเข้าเมนูลูกค้า / คู่ค้า เพื่อเพิ่ม แก้ไข ค้นหา และเปิด/ปิดใช้งานรายชื่อ
- เก็บรหัส ชื่อ และรายละเอียดเพิ่มเติมไว้เลือกใช้ภายหลัง หรือพิมพ์ชื่อเองได้
- เปิดจัดการระหว่างกรอกรายการโดยไม่เสียข้อมูลที่กรอกไว้ และคงชื่อในบัญชีเก่าเมื่อแก้ชื่อหรือปิดใช้งาน
- ลบได้เฉพาะรายชื่อที่ยังไม่มีรายการอ้างอิง รายชื่อแยกตามบัญชี BillFlow และรวมอยู่ในไฟล์สำรอง JSON

## LINE group notifications

- Owner-only แจ้งเตือน LINE panel uses @191anfqj (PUROnGBillFlow).
- Group paired: BillFlow | ห้องแอดมิน. Owner authorized automatic disclosure of transaction type, date, document number, description, amount and account names, then requested continuation. Alerts were enabled at 2026-10-29T10:44:06Z.
- New, edited and deleted income/expense/internal-transfer records enqueue a notification after a successful ledger save. Existing history, first-ledger baselines and explicit backup restores are not replayed.
- Each outbox message stores only the fields needed by the notification. It excludes customer/employee details, notes and receipts.
- A cron worker runs each minute, authenticates with a Vault-held worker key and atomically claims up to five due messages. Failed sends retry with backoff, a stable LINE retry key and a bounded retry lifetime.
- Owner can select transaction types or turn alerts off. Turning off cancels pending financial alerts. A group rebind leaves alerts off and cancels older queued messages.
- Backend independently validates owner JWTs; incoming LINE events require raw-body HMAC. No service-role key, LINE token or channel secret is returned to the browser or ledger backup.
- Channel credentials remain encrypted in Supabase Vault. Empty credential inputs after saving are intentional; the UI confirms that values are saved.
- Applied SQL files: `supabase/line-notifications.sql` (original manual-test schema), then `supabase/line-automation.sql` (approved automatic notification extension). Do not rerun applied migrations.
- Verification: 15 automated tests and production build pass; rollback tests cover add/edit/delete, minimal payloads, type selection, pause, restored-history suppression, exclusive queue claims and worker privileges. The cron + Edge worker sent a fixed sample message successfully to LINE. No test financial record persisted.
- LINE API acceptance does not prove that every group member received or read a message. Delivery depends on LINE quota and group membership.
- This GitHub application does not use Replit.

## Bank accounts and slip evidence

- บัญชีเงิน supports account kind, bank, holder and account/PromptPay number. Owner-provided holder suggestions are stored inside the private ledger payload, not in public client code. Real account numbers and starting balances were not invented or changed.
- Account cards show all-time inflows/outflows and current balance. Account statements include internal transfers and preserve the full running balance when filtered.
- Transactions support time, transfer reference and both sender/receiver bank details. Selecting the shop account fills its side while keeping the counterparty. Duplicate references per originating bank are rejected.
- Receipt upload supports private original files, image preview and JPEG derivatives. The app opens signed receipt URLs only after owner authentication. Detail views and monthly cashbooks can open attached evidence.
- Slip review status is a manual bookkeeping status; it is not automated bank verification. No OCR service was added. Old records/backups remain compatible.
- Tests: 18 automated checks and production build; isolated UI tests exercised account selection/defaults, time edits, upload/preview/reopening. Server JSON metadata round-trip was verified in a rolled-back transaction. No example financial entries or bank accounts were persisted in the user's ledger.
- Expanded LINE bank/party/slip templates are prepared in *.bank.pending.ts and bank-slip-notifications.pending.sql ONLY. Automatic approval review rejected the expanded disclosure scope, so these files are not deployed/applied. Existing LINE alerts retain their previously approved fields. Obtain explicit consent for names, banks, masked account tails, transfer time/reference and slip images to BillFlow | ห้องแอดมิน before deploying the pending extension.

## สมุดบัญชีแบบบัญชีคู่

เมนู **สมุดบัญชี** มีสมุดเงินสด/ธนาคารเดิม พร้อมผังบัญชี สมุดรายวัน บัญชีแยกประเภท งบทดลอง กำไรขาดทุน ฐานะการเงิน กระแสเงินสด ลูกหนี้/เจ้าหนี้ ค่าใช้จ่ายแยกทีม/งาน และทะเบียนยอดบัญชีภาษี ส่งออก CSV และพิมพ์ได้ ผังรหัสเริ่มต้นเป็นแบบสำหรับกิจการที่ปรับเพิ่มได้ ไม่ใช่รหัสที่กฎหมายบังคับให้ทุกกิจการใช้เหมือนกัน

- ผังเริ่มต้นแบ่ง 5 หมวด: สินทรัพย์ หนี้สิน ส่วนของเจ้าของ รายได้ ค่าใช้จ่าย มีบัญชีต้นทุน ภาษีซื้อ/ขาย ภาษีหัก ณ ที่จ่าย สินค้าคงเหลือ ค่าเสื่อมราคา และถอนใช้ส่วนตัวแยกกัน
- รายการเงินเดิมถูกแสดงเป็นบัญชีคู่ตามเงินรับจ่ายจริง ระบบเสนอประเภทและแสดงสถานะรอตรวจ เมื่อจัดประเภทให้ระบุรหัสบัญชี แผนก/ทีม โครงการ/งาน ระบบต้นทาง เลขอ้างอิง และรายละเอียดเพิ่มได้ พร้อมเปิดหลักฐานต้นทาง
- เริ่มจากแท็บ **จัดประเภท / ที่มารายการ** ตรวจรหัสที่เสนอและวันที่ยอดยกมา ตรวจยอดเริ่มต้นกับเอกสารแล้วจึงติ๊กยืนยัน ยอดยกมาคู่กับ 390000 เพื่อรอตรวจและปรับทุน/หนี้ตามเอกสารจริง
- ลงรายการขายเชื่อ ซื้อเชื่อ ภาษี ค่าเสื่อม และปรับปรุงในสมุดรายวันได้หลายบรรทัด ระบบบังคับเดบิตเท่ากับเครดิต รายการที่ลงแล้วกลับบัญชีด้วยเอกสารใหม่ เก็บต้นฉบับไว้
- เงินสดและธนาคารลงผ่านรายการรับ–จ่ายเดิม ส่วนสมุดรายวันเพิ่มเติมใช้กับรายการที่ไม่เคลื่อนไหวเงิน เพื่อป้องกันยอดบัญชีเงินจริงคลาดเคลื่อน รับชำระลูกหนี้/เจ้าหนี้ให้จัดรหัส 110000/210000 และลงตั้งหนี้ตามวันที่เอกสารจริงก่อน เมนูหนี้เดิมไม่ตั้งหนี้ทางบัญชีให้อัตโนมัติ
- รายจ่ายส่วนตัวเจ้าของเสนอรหัส 330000 ถอนใช้ส่วนตัว จึงไม่รวมเป็นค่าใช้จ่ายกิจการจนกว่าจะจัดประเภทใหม่ตามข้อเท็จจริง
- ผู้มีสิทธิ์ดูเมนูสมุดบัญชีอ่านรายงานได้ ผู้ที่มีสิทธิ์แก้ไขบัญชีเงินจัดการผังบัญชีและสมุดรายวันได้ ข้อมูลยังแยกตามบัญชีผู้ใช้เช่นเดิม
- รายงานเป็นรายงานบริหารภายในจากข้อมูลที่บันทึก ทะเบียนภาษีแสดงยอดบัญชีเพื่อกระทบยอด ไม่ใช่การคำนวณภาษีอัตโนมัติหรือแบบยื่นภาษี
- ลำดับ SQL: `bookkeeping.sql` แล้ว `bookkeeping-reset-block.sql` การล้างข้อมูลเดิมถูกระงับเมื่อมีข้อมูลสมุดบัญชีใหม่ เพื่อป้องกันการลบหลักฐานขณะที่สมุดรายวันยังถูกเก็บไว้ การเชื่อม reset เข้ากับการล้างสมุดบัญชีต้องได้รับอนุญาตเฉพาะเพิ่มเติม

ตรวจสอบด้วยชุดทดสอบ `tests/bookkeeping.test.ts` และการทดสอบฐานข้อมูลแบบ rollback ครอบคลุมบัญชีคู่ เงินโอน ภาษี การตั้งหนี้และรับชำระ การกลับบัญชี งบทดลอง งบการเงิน กระแสเงินสด และการป้องกันแก้ทับสมุดรายวันที่ลงแล้ว

## ภาษีหัก ณ ที่จ่ายในรายการรับ–จ่าย

เปิดฟอร์มเพิ่ม/แก้ไขรายการ แล้วกรอก **ยอดตามเอกสารก่อนหักภาษี** ในช่องจำนวนเงิน จากนั้นเปิดส่วน **ภาษีหัก ณ ที่จ่าย** เลือกอัตรา ระบุฐานคำนวณ และเลข/วันที่หนังสือรับรองได้ รองรับเลขผู้เสียภาษีผู้จ่าย/ผู้รับและแบบ ภ.ง.ด.3/53 หากยอดตามหนังสือรับรองต่างจากยอดคำนวณ เลือกใช้ยอดตามเอกสารและระบุเหตุผล อัตราที่แสดงเป็นตัวเลือกตัวเลข ผู้บันทึกต้องเลือกตามเงื่อนไขจริง ไม่ได้ตัดสินสิทธิ์หรืออัตราตามกฎหมายให้โดยอัตโนมัติ

`Entry.amount` ยังคงเป็นยอดเอกสาร/ยอดชำระหนี้เต็ม ส่วน `netAmount(entry)` เป็นยอดเงินจริงหลังหักภาษี บัญชีเงิน สมุดเงินสด และแดชบอร์ดใช้ยอดสุทธิ ลูกหนี้/เจ้าหนี้ตัดชำระด้วยยอดเต็ม ค่าใช้จ่ายรายย่อยและ CSV แสดงยอดเอกสาร ภาษี และสุทธิแยกกัน

สมุดบัญชีคู่สร้างบรรทัดภาษีอัตโนมัติ: รายรับถูกหัก เดบิต 114000 ภาษีถูกหัก ณ ที่จ่าย; รายจ่ายที่ร้านหักไว้ เครดิต 213000 ภาษีหัก ณ ที่จ่ายค้างจ่าย การรับชำระ/ชำระหนี้ที่จัดรหัส 110000/210000 ลดหนี้ด้วยยอดเต็ม การนำส่งภาษีภายหลังบันทึกจ่ายเงินจริงและจัดรหัส 213000 เพื่อลดหนี้สิน ไม่ลงเป็นค่าใช้จ่ายซ้ำ

ฐานภาษีแยกจากยอดรวมเอกสารได้ เช่น ยอดรวม VAT 1,070 บาท ฐาน 1,000 บาท หากระบุอัตรา 3% ระบบหัก 30 บาทและเคลื่อนไหวเงินจริง 1,040 บาท ส่วนการลง VAT ยังคงใช้สมุดรายวัน/การจัดประเภทตามเอกสารจริง การคำนวณใช้จำนวนเต็มสตางค์และการปัดเศษครึ่งขึ้น

SQL เพิ่มเติม: `supabase/withholding.sql` ป้องกันยอดภาษีผิดสูตร/เกินยอด และรักษาข้อมูลภาษีเมื่อเบราว์เซอร์รุ่นเก่าส่งรายการโดยไม่รู้จักฟิลด์นี้ ปิดภาษีโดยส่ง `withholding:null` อย่างชัดเจน การแจ้ง LINE แสดงยอดเอกสาร ภาษี และยอดรับ/จ่ายจริง ชุดทดสอบ `tests/withholding.test.ts` ครอบคลุมยอดเงินจริง การลงบัญชี การชำระหนี้ ภาษีแยกฐาน การนำส่งภาษี และข้อความแจ้งเตือน
