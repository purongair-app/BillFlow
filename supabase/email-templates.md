# อีเมลตอบกลับอัตโนมัติของ BillFlow

ตั้ง Sender Name และ Sender Email ที่ Custom SMTP หลังยืนยันผู้ส่งแล้ว
เทมเพลตใช้ลิงก์ `{{ .ConfirmationURL }}` ของ Supabase ห้ามแทนด้วยลิงก์ที่สร้างเอง

## Confirm signup

Subject: ยืนยันอีเมลเพื่อเริ่มใช้งาน BillFlow

```html
<div style="font-family:Arial,sans-serif;background:#f5f8f5;padding:28px;color:#234438">
  <div style="max-width:520px;margin:auto;background:#fff;padding:30px;border-radius:14px">
    <h1 style="color:#14785b">BillFlow</h1>
    <h2>ยินดีต้อนรับสู่ระบบรายรับรายจ่าย</h2>
    <p>ขอบคุณที่สมัครสมาชิก กรุณากดยืนยันอีเมลเพื่อเริ่มใช้งานบัญชีของคุณ</p>
    <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#14785b;color:white;text-decoration:none;padding:12px 22px;border-radius:8px">ยืนยันอีเมลของฉัน</a></p>
    <p>หากคุณไม่ได้สมัครสมาชิก คุณสามารถละเว้นอีเมลฉบับนี้ได้</p>
    <p>ขอบคุณครับ<br>ทีมงาน BillFlow</p>
  </div>
</div>
```

## Reset password

Subject: ตั้งรหัสผ่านใหม่สำหรับบัญชี BillFlow

```html
<div style="font-family:Arial,sans-serif;background:#f5f8f5;padding:28px;color:#234438">
  <div style="max-width:520px;margin:auto;background:#fff;padding:30px;border-radius:14px">
    <h1 style="color:#14785b">BillFlow</h1>
    <h2>คำขอตั้งรหัสผ่านใหม่</h2>
    <p>เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
    <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#14785b;color:white;text-decoration:none;padding:12px 22px;border-radius:8px">ตั้งรหัสผ่านใหม่</a></p>
    <p>หากคุณไม่ได้ส่งคำขอนี้ คุณสามารถละเว้นอีเมลฉบับนี้ได้</p>
    <p>ขอบคุณครับ<br>ทีมงาน BillFlow</p>
  </div>
</div>
```
