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

## สถานะ

เชื่อมโครงการ PUROnGAIR เดิม (`maxqjstknhwhymsugutz`) แล้ว โดยแยกตาราง `billflow_ledgers` และ bucket ส่วนตัว `billflow-receipts`
บัญชีสมาชิกใช้ร่วมกับ PUROnGAIR; ข้อมูลการเงินและบิลแยกตามผู้ใช้
อีเมลติดต่อเจ้าของ: airfriendnara@gmail.com
ยังไม่ยืนยันผู้ส่ง SMTP จึงยังปิดการสมัครใหม่/ส่งอีเมล แต่เปิดให้บัญชีเดิมล็อกอินได้
ค่า URL และ publishable key ของโครงการที่อนุญาตอยู่ใน `src/config.ts`; ค่า build environment สามารถ override ได้
ห้ามเปิด `VITE_AUTH_EMAIL_READY` จนทดสอบ SMTP และลิงก์ยืนยันกลับ BillFlow แล้ว
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
   - Sender name: BillFlow
   - Sender email: `airfriendnara@gmail.com` หลังเจ้าของเชื่อม SMTP และยืนยันผู้ส่ง
   - ตั้ง host, port, username และ password ใน Supabase เท่านั้น
   - Gmail ต้องใช้ App Password ของบัญชีที่เจ้าของอนุญาต ไม่ใช้รหัสผ่าน Gmail ปกติ
   - Supabase SMTP เริ่มต้นไม่เหมาะสำหรับเปิดรับผู้ใช้ทั่วไป
6. ตั้งอีเมลยืนยันสมัครและรีเซ็ตรหัสผ่านจาก `supabase/email-templates.md`
7. GitHub repository > Settings > Secrets and variables > Actions > Variables:
   - `VITE_SUPABASE_URL`: Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: publishable key (ห้ามใส่ service_role หรือ secret key)
   - `VITE_OWNER_EMAIL`: `airfriendnara@gmail.com`
   - `VITE_AUTH_EMAIL_READY`: ตั้ง `true` หลังทดสอบ SMTP และ Redirect URL ครบเท่านั้น
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
