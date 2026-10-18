# ศึกแก่งกระจาน — เกมสู้รบจัดทัพ 4 ทีม สำหรับ Outing BSG 2569

เว็บเกมเล่นจากมือถือ ทีมละ 8 ฮีโร่ (1 คน = 1 ตัวละคร) เลือกอาชีพ วางตำแหน่ง แล้วให้สนามจำลองสู้กัน 3 ระลอก
ไอเทมพิเศษมาจากอันดับกิจกรรม outing 4 กิจกรรม

- ผู้เล่น: `https://boaomho.github.io/kkwar/`
- จอใหญ่: `.../#screen` (กด host ใส่ PIN เพื่อให้เครื่องนี้เดินเวลาอัตโนมัติ)
- Admin: `.../#admin` (PIN ตั้งใน `game/settings/pin` ค่าเริ่มต้น 1234)
- ทดสอบในเครื่องโดยไม่ใช้ Firebase: เปิด `index.html?mock`

## โครงสร้าง
| ไฟล์ | หน้าที่ |
|---|---|
| `js/data.js` | ทีม รายชื่อ อาชีพ ไอเทม กิจกรรม ค่าสมดุลเริ่มต้น |
| `js/sim.js` | ตัวจำลองการรบ deterministic (seed เดียว ผลเดียวทุกเครื่อง) |
| `js/render.js` | วาดสนามรบบน canvas + คอมเมนต์ |
| `js/store.js` | ชั้นเก็บข้อมูล (Firebase Realtime DB / mock ในเครื่อง) |
| `js/app.js` | หน้าจอผู้เล่น / จอใหญ่ / Admin และตัวเดินช่วงศึก |
| `tools/balance2.js` | `node tools/balance2.js 20` จำลองอัตราชนะของสูตรจัดทัพ |
| `tools/e2e.js` | ทดสอบ flow ทั้งศึกด้วย Playwright (ต้องรัน `python3 -m http.server 8123` ก่อน) |

## ข้อมูลใน Firebase (`kkwar/`)
`game` (phase, settings, rankings, roster, captains) · `players/{pid}` · `teams/{team}` (plan, item, itemsUsed) · `bracket` · `match`

## ไอเดียเฟส 4 (ยังไม่ทำ)
- มินิเกมเรียลไทม์ทีละทีม (งูกินหาง/เก็บของ) เพื่อชิงไอเทมเพิ่ม
- เสียงเอฟเฟกต์ / เพลงประกอบ
- ตัวละคร SVG แทนอิโมจิ
- MVP รายศึก (รัวกดเก่งสุด / ดาเมจสูงสุด)
- เพิ่มอาชีพจากหน้า Admin
