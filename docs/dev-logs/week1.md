# Development Log - Week 1: Architecture & Foundation

> **Mục tiêu:** Setup phần khung xương cho hệ thống Modular Monolith (NestJS), cấu hình Database (Prisma), và chuẩn hóa Response/Logging.
> **Trạng thái:** Hoàn thành (100%)

## 1. Hành động đã thực hiện & Thư viện đã cài đặt

### 1.1 Cơ sở hạ tầng (Database & Caching)
- Viết `docker-compose.yml` để khởi chạy **PostgreSQL 16** (Alpine) và **Redis 7** (Alpine).
- **Lưu ý:** Loại bỏ cờ `version` trong docker-compose vì Composer Specification mới đã đánh dấu deprecated.

### 1.2 Prisma ORM Setup
- Cài đặt: `npm install prisma --save-dev`
- Khởi tạo thư mục prisma: `npx prisma init`
- **Mailing schema:** Hoàn thiện `schema.prisma` với 17 tables, áp dụng các best practices từ `database-design.md`:
  - Quan hệ FK `1-N`, enum, UUID default.
  - Sửa lỗi mapping FK bằng Snapshot Pattern: Chụp nguyên cục JSON để lưu `shipping_address` vào bảng Order (Bảo vệ tính toàn vẹn lịch sử).
  - Tối ưu tạo Index (`@@index`) chuẩn bị cho các câu query phức tạp sau này (đặc biệt là báo cáo hết hạn của IdempotencyKey).
- **Lệnh chạy db:** `npx prisma migrate dev --name init_full_schema`

### 1.3 Môi trường & ConfigModule
- Cài đặt: `npm install @nestjs/config joi`
- **Bài học Fail-fast:** Setup ConfigModule tích hợp **Joi validation**. 
- Hệ thống từ chối khởi động (Exit/Crash) nếu thiếu `DATABASE_URL` trong `.env`.
- Biến môi trường phải đổi dấu `@` trong mật khẩu thành url encoded `%40` để database hiểu.

### 1.4 Lọc lỗi toàn cục (Global Exception Filter)
- **Problem:** Mặc định của Nest ném lỗi lung tung (404/500 message khác nhau).
- **Solution:** Code `AllExceptionFilter` chụp toàn bộ lỗi (`HttpException`, hay lỗi code văng ra), bóp dẹp lại chuẩn một JSON format thống nhất: `{success: false, error: {...}, correlationId, timestamp}`.

### 1.5 Correladiton ID Middleware
- Cài đặt: `npm install uuid` & `npm install @types/uuid --save-dev`
- **Problem:** Rất khó nhặt các dòng log của cùng một Request nếu log xen kẽ nhau.
- **Solution:** Middleware tạo random `uuid_v4` mỗi khi Request đi vào và nhét vào Res header. Cứ có request bay vào là bị "đóng cọc" bằng 1 cái thẻ tên.

### 1.6 Cấu trúc Log (Winston Logger)
- Cài đặt: `npm install nest-winston winston`
- **Problem:** Terminal mặc định khó theo dõi, không có cấu trúc.
- **Solution:** Dùng WinstonModule override Logger của toàn bộ NestFactory. Console console.log bằng thư viện Format `nestLike`. 

---

## 2. Vấn đề (Bugs) đã đối mặt & Cách giải quyết

### 2.1 [Lỗi Môi trường Compiler TS] `error TS5103: Invalid value for '--ignoreDeprecations'`
- **Ngữ cảnh:** Khi cắm lệnh `npm run start:dev` terminal văng ra lỗi lạ hoắc không nằm trong phần mình vừa code.
- **Nguyên nhân:** Lỗi version mismatch giữa Typescript 5.5+ và ts-loader / Nest CLI cũ.
- **Cách fix:** 
  1. Gỡ config `"ignoreDeprecations": "5.0"` (nếu có trong `tsconfig.json`).
  2. Bơm lại máu mới cho toàn bộ pipeline dev dependencies.
  3. Lệnh fix chạy vòng: `npm install @nestjs/cli@latest --save-dev` và update Typescript mới.

### 2.2 [Cú vấp ngã Syntax của Winston] `TypeError: winston.format.nestLike is not a function`
- **Ngữ cảnh:** Ghi code log `nestLike` vào cho Winston nhưng compile nổ báo ko có hàm này.
- **Nguyên nhân:** Nhớ nhầm thư viện. Hàm `nestLike` thực chất là đồ "độ chế" của nest-winston chứ winston sinh ra không làm.
- **Cách fix:** Fact check chính xác. Import từ `utilities` của `nest-winston`:
  ```ts
  import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
  // Dùng: nestWinstonModuleUtilities.format.nestLike(...)
  ```
- **Kinh nghiệm:** Khi Log đổi từ `[Nest]` sang `[Ordex]` thành công thì đó là lúc winston đã nắm quyền sinh sát ứng dụng!
