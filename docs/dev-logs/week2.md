# Development Log - Week 2: Auth Module & Prisma v7 Migration

> **Mục tiêu:** Xây dựng chức năng Đăng ký (Register) với Validation, Password Hashing, và kết nối Database thật qua Prisma.
> **Trạng thái:** Đang tiến hành (~40% Auth Module — Register xong, Login chưa bắt đầu)

## 1. Hành động đã thực hiện & Thư viện đã cài đặt

### 1.1 ValidationPipe (Global)
- Cấu hình `ValidationPipe` trong `main.ts` với 2 options quan trọng:
  - `whitelist: true` — Tự động strip các field không có trong DTO (chống hacker nhét field lạ).
  - `forbidNonWhitelisted: true` — Ném lỗi 400 luôn nếu client gửi field lạ (strict mode).

### 1.2 PrismaModule (Global)
- Cài đặt: `npm install @prisma/client` & `npm install prisma --save-dev`
- Tạo `PrismaService` extends `PrismaClient` + implements `OnModuleInit`.
- Đánh dấu `PrismaModule` là `@Global()` để mọi module đều inject được mà không cần import lại.

### 1.3 RegisterDto (class-validator)
- Cài đặt: `npm install class-validator class-transformer`
- Tạo `register.dto.ts` với các decorator:
  - `@IsEmail()` — Validate email hợp lệ.
  - `@IsString()` + `@MinLength(8)` — Password tối thiểu 8 ký tự.
  - `@IsString()` + `@MaxLength(100)` — Full name không quá 100 ký tự (khớp với DB `@db.VarChar(100)`).
- **Lưu ý:** Phải thêm `!` (definite assignment assertion) cho các property trong DTO vì TypeScript strict mode.

### 1.4 AuthService — Logic Đăng ký
- Cài đặt: `npm install bcrypt` & `npm install @types/bcrypt --save-dev`
- Luồng xử lý `register()`:
  1. **Check email trùng:** `prisma.user.findUnique({ where: { email } })` → nếu có → ném `ConflictException`.
  2. **Hash password:** `bcrypt.hash(password, 10)` — saltRound = 10.
  3. **Tạo user:** `prisma.user.create()` — mapping đúng tên field DB: `password_hash`, `full_name`.
  4. **Sanitize response:** Destructuring loại bỏ `password_hash` trước khi trả về client.
- **Bài học quan trọng:** Phải đọc kỹ `schema.prisma` để biết tên field chính xác. DB dùng `password_hash` (snake_case) chứ không phải `password`.

### 1.5 AuthController — Thin Controller Pattern
- Dọn sạch CRUD boilerplate từ `nest g resource`.
- Controller chỉ làm đúng 1 việc: nhận `@Body() dto: RegisterDto` → gọi `authService.register(dto)` → trả về.
- Route: `@Post('register')` → endpoint cuối: `POST /api/v1/auth/register`.

### 1.6 Global Prefix
- Thêm `app.setGlobalPrefix('api/v1')` trong `main.ts` theo đúng API Specification.

---

## 2. Vấn đề (Bugs) đã đối mặt & Cách giải quyết

### 2.1 [Đại chiến Prisma v7] `ReferenceError: exports is not defined in ES module scope`
- **Ngữ cảnh:** Chạy `npm run start:dev` thì server nổ ngay khi import Prisma Client.
- **Nguyên nhân gốc:** Prisma v7 (7.8.0) đã thay đổi kiến trúc hoàn toàn so với v6:
  - Generator mặc định giờ là `prisma-client` (không phải `prisma-client-js` cũ).
  - Bắt buộc phải có **Driver Adapter** (không còn Rust Query Engine).
  - Bắt buộc phải khai báo `output` path trong generator block.
  - Mặc định sinh ra ESM, nhưng NestJS dùng CommonJS → xung đột module system.
- **Quá trình fix (sai → đúng):**
  1. ❌ Thử đổi `tsconfig.json` sang `module: "commonjs"` → vẫn lỗi vì file generated là ESM.
  2. ❌ Thử đổi generator về `prisma-client-js` cũ + `engineType: "library"` → lỗi `PrismaClientInitializationError` vì v7 bắt buộc adapter.
  3. ❌ Thử import từ `@prisma/client` (node_modules) → lỗi `datasources` không tồn tại trong type mới.
  4. ✅ **Cách fix đúng chuẩn 2026:**
     ```prisma
     generator client {
       provider     = "prisma-client"
       output       = "../src/generated/prisma"
       moduleFormat = "cjs"
     }
     ```
     - `provider = "prisma-client"` — dùng generator mới của v7.
     - `output = "../src/generated/prisma"` — sinh code vào trong `src/` để TypeScript compile cùng.
     - `moduleFormat = "cjs"` — ép sinh ra CommonJS cho NestJS.
- **Kinh nghiệm:** Khi dùng thư viện breaking-change lớn (v6 → v7), phải đọc migration guide chính thức TRƯỚC khi debug mò mẫm. Mất gần 1 tiếng vì cố "vá tạm" thay vì hiểu đúng kiến trúc mới.

### 2.2 [Driver Adapter bắt buộc] `Using engine type "client" requires either "adapter" or "accelerateUrl"`
- **Ngữ cảnh:** Sau khi fix generator, `new PrismaClient()` không chịu chạy nếu không truyền gì.
- **Nguyên nhân:** Prisma v7 xóa Rust binary engine, bắt buộc app tự cung cấp database driver.
- **Cách fix:**
  - Cài đặt: `npm install @prisma/adapter-pg pg @types/pg`
  - Sửa `PrismaService`:
    ```typescript
    import { PrismaPg } from '@prisma/adapter-pg';
    
    constructor() {
      const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      });
      super({ adapter });
    }
    ```
- **Kinh nghiệm:** Prisma v7 dùng `PrismaPg({ connectionString })` (API đơn giản) hoặc truyền `Pool` instance nếu cần custom pool size.

### 2.3 [Import path sai sau compile] `Cannot find module '../../generated/prisma/client'`
- **Ngữ cảnh:** TypeScript compile 0 errors nhưng runtime Node.js không tìm thấy module.
- **Nguyên nhân:** Relative path bị lệch sau khi compile. File `src/prisma/prisma.service.ts` compile ra `dist/src/prisma/prisma.service.js`. Import `../../generated/prisma/client` từ `dist/src/prisma/` resolve ra `dist/generated/` — nhưng file thực tế nằm ở `dist/src/generated/`.
- **Cách fix:** Sửa import từ `../../generated/prisma/client` → `../generated/prisma/client` (lên 1 cấp, không phải 2).
- **Kinh nghiệm:** Khi dùng custom output path cho generated code, phải tính toán relative path dựa trên vị trí file **trong thư mục `src/`**, không phải từ project root.

### 2.4 [TypeScript Deprecation] `Option 'moduleResolution=node10' is deprecated`
- **Ngữ cảnh:** TypeScript 6.x cảnh báo `moduleResolution: "node"` sẽ bị xóa ở TS 7.0.
- **Cách fix:** Thêm `"ignoreDeprecations": "6.0"` vào `tsconfig.json`. NestJS vẫn cần `commonjs` + `node` nên chấp nhận suppress warning này.

---

## 3. Trạng thái file đã sửa / tạo mới

| File | Hành động | Ghi chú |
|------|-----------|---------|
| `prisma/schema.prisma` | Sửa | Generator → `prisma-client` + `moduleFormat = "cjs"` |
| `prisma.config.ts` | Giữ nguyên | Đã có từ Week 1 |
| `src/generated/prisma/` | Tự sinh | `npx prisma generate` → output CJS |
| `src/prisma/prisma.service.ts` | Sửa lớn | Import từ generated, dùng `PrismaPg` adapter |
| `src/modules/auth/dto/register.dto.ts` | Tạo mới | class-validator decorators |
| `src/modules/auth/auth.service.ts` | Sửa | Logic register: check email, hash, create, sanitize |
| `src/modules/auth/auth.controller.ts` | Sửa | Dọn CRUD → chỉ giữ `@Post('register')` |
| `src/modules/auth/auth.module.ts` | Sửa nhẹ | Dọn imports thừa |
| `src/main.ts` | Sửa | Thêm `setGlobalPrefix('api/v1')` |
| `tsconfig.json` | Sửa | `commonjs` + `node` + `ignoreDeprecations: "6.0"` |
| `package.json` | Sửa | Thêm dependencies: bcrypt, class-validator, pg, adapter-pg |

---

## 4. Packages đã cài đặt trong Week 2

```bash
# Production
npm install bcrypt class-validator class-transformer @prisma/adapter-pg pg

# Development
npm install --save-dev @types/bcrypt @types/pg
```
