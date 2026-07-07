# Development Log - Week 2: Auth Module & Prisma v7 Migration

> **Mục tiêu:** Xây dựng hoàn chỉnh Auth Module (Register, Login, JWT, OAuth, RBAC, Rate Limiting) và Address CRUD.
> **Trạng thái:** Hoàn thành (100%)

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

### 1.7 Login + JWT Token
- Cài đặt: `npm install @nestjs/jwt`
- Tạo `login.dto.ts` với `@IsEmail()` + `@IsString()` + `@MinLength(8)`.
- Cấu hình `JwtModule.registerAsync()` trong `auth.module.ts`:
  - Dùng `ConfigService.getOrThrow()` để đọc `JWT_SECRET` (fail-fast nếu thiếu).
  - Cast `expiresIn` sang `StringValue` (type từ thư viện `ms`).
- Luồng `login()`:
  1. `findUnique` email → không có → `UnauthorizedException`.
  2. Check `password_hash` nullable (OAuth user không có password) → throw nếu null.
  3. `bcrypt.compare()` → sai → `UnauthorizedException`.
  4. `jwt.sign({ sub, email, role })` → `accessToken` (15 phút).
  5. Sinh `refreshToken` (UUID) → hash SHA-256 → lưu vào bảng `refresh_tokens` với `family_id` + `expires_at` (7 ngày).
  6. Sanitize response → trả `{ user, accessToken, refreshToken }`.
- **Bài học:** Dùng **SHA-256** (deterministic) cho refresh token, không dùng bcrypt. Lý do: cần lookup token trong DB bằng hash. bcrypt dành cho password (cần chậm). Refresh token là UUID entropy cao, SHA-256 đủ an toàn.

### 1.8 Refresh Token Rotation
- Tạo `refresh.dto.ts` với `@IsString()` + `@IsNotEmpty()`.
- Luồng `refresh()` — Token Rotation with Family Tracking:
  1. SHA-256 hash token gửi lên → lookup trong DB.
  2. Không tìm thấy → `401`.
  3. **Token reuse detected** (đã revoke rồi mà vẫn dùng) → `updateMany` revoke TOÀN BỘ tokens cùng `family_id` → `401`. Đây là cơ chế bảo vệ: nếu hacker đánh cắp token cũ, cả hệ thống token của user bị khóa.
  4. Check hết hạn → `401` nếu expired.
  5. Revoke token cũ → tạo token mới **cùng `family_id`** (kế thừa dòng họ).
  6. Sign access token mới → trả về `{ accessToken, refreshToken }`.

### 1.9 Logout
- Luồng `logout()`: Hash token → tìm trong DB → revoke (`is_revoked = true`).
- Dùng lại `RefreshDto` vì body giống nhau.
- Route yêu cầu auth (không có `@Public()`).

### 1.10 Google OAuth 2.0 (Passport.js)
- Cài đặt: `npm install passport-google-oauth20 @nestjs/passport passport passport-jwt`
- Cài dev: `npm install --save-dev @types/passport-google-oauth20 @types/passport-jwt`
- Tạo `google.strategy.ts` extends `PassportStrategy(Strategy, 'google')`:
  - Config: `clientID`, `clientSecret`, `callbackURL` từ env.
  - `scope: ['email', 'profile']`.
  - `validate()` — không dùng `done` callback (kiểu cũ), dùng `return` trực tiếp (`@nestjs/passport` tự xử lý).
- Tạo `findOrCreateGoogleUser()` — handle 5 edge cases:
  1. Google không trả email → throw.
  2. Account bị ban (`is_active = false`) → throw.
  3. User đã login Google trước (có `oauth_id`) → trả về.
  4. Email đã tồn tại (đăng ký email/password) → **Account Merging**: link OAuth vào account cũ, cập nhật `avatar_url`, set `is_verified = true`.
  5. User mới hoàn toàn → tạo account với `password_hash: null`, `is_verified: true`.
- Tạo `googleSignIn()` — sign JWT + tạo refresh token (giống login flow).
- Thêm Authorized redirect URI trên Google Cloud Console: `http://localhost:3000/api/v1/auth/google/callback`.

### 1.11 JWT Guard + @Public() + @CurrentUser() + @Roles() Decorators
- **JwtStrategy** (`jwt.strategy.ts`): verify token, decode payload → gắn `req.user = { id, email, role }`.
- **JwtAuthGuard** (`common/guards/jwt-auth.guard.ts`): extends `AuthGuard('jwt')`, check metadata `@Public()` → nếu public thì skip auth.
- **RolesGuard** (`common/guards/roles.guard.ts`): đọc metadata `@Roles()`, check `user.role` có nằm trong danh sách không.
- **Global guards** đăng ký trong `app.module.ts` theo thứ tự:
  1. `JwtAuthGuard` — mọi route mặc định cần JWT (trừ `@Public()`).
  2. `RolesGuard` — kiểm tra role.
  3. `ThrottlerGuard` — rate limiting.
- **3 Custom Decorators:**
  - `@Public()` — đánh dấu endpoint không cần auth.
  - `@Roles('seller', 'admin')` — chỉ role nhất định mới truy cập.
  - `@CurrentUser()` — type-safe thay cho `req.user`, dùng `getRequest<AuthenticatedRequest>()` generic.
- **Type-safe pattern:** Tạo `AuthenticatedUser` + `AuthenticatedRequest` interfaces, export từ `current-user.decorator.ts` → dùng chung ở `roles.guard.ts`, controller → xóa sạch `// eslint-disable`.

### 1.12 Rate Limiting (Redis Sliding Window)
- Cài đặt: `npm install @nestjs/throttler @nest-lab/throttler-storage-redis ioredis`
- Cấu hình `ThrottlerModule.forRootAsync()` trong `app.module.ts`:
  - 2 throttlers: `short` (3 req/giây) + `medium` (60 req/phút).
  - Storage: `ThrottlerStorageRedisService` kết nối Redis qua `REDIS_URL` env.
  - Dùng `forRootAsync` + `ConfigService` thay vì hardcode URL.
- Custom rate limit trên login: `@Throttle({ medium: { ttl: 60000, limit: 5 } })` — chỉ 5 lần login/phút (chống brute-force).
- Skip rate limit cho logout: `@SkipThrottle()`.

### 1.13 Address CRUD
- Đặt trong User module vì address thuộc về user.
- Controller: `@Controller('users/me/addresses')` — RESTful nested resource.
- DTO: `CreateAddressDto` (class-validator) + `UpdateAddressDto` (extends `PartialType`).
- Service:
  - `create()` — Nếu `isDefault = true` → bỏ default cũ trước (chỉ 1 address default).
  - `findAll()` — Sort: default trước, mới nhất trước.
  - `update()` — Check ownership (`user_id: userId`) → `NotFoundException` nếu không thuộc về user.
  - `remove()` — Check ownership → delete.
- Dùng `ParseUUIDPipe` cho `:id` param → validate UUID format tự động.
- Dùng `@CurrentUser()` decorator → user chỉ truy cập address **của chính mình**.

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

### 2.5 [Nullable password_hash] `Type 'string | null' is not assignable to type 'string'`
- **Ngữ cảnh:** `bcrypt.compare(dto.password, userExist.password_hash)` báo lỗi type.
- **Nguyên nhân:** Schema định nghĩa `password_hash String?` (nullable) vì OAuth user không có password. Prisma type nó là `string | null`, nhưng `bcrypt.compare()` yêu cầu `string`.
- **Cách fix:** Thêm check `if (!userExist.password_hash)` TRƯỚC `bcrypt.compare()`. Vừa bảo vệ logic (OAuth user không login bằng password), vừa thu hẹp type cho TypeScript.

### 2.6 [Google OAuth Typo] `GOOOGLE_CALLBACK_URL`
- **Ngữ cảnh:** App crash khi start vì `getOrThrow` không tìm thấy env key.
- **Nguyên nhân:** Typo 3 chữ O thay vì 2: `GOOOGLE_CALLBACK_URL` → `GOOGLE_CALLBACK_URL`.
- **Kinh nghiệm:** `getOrThrow` giúp phát hiện lỗi typo ngay khi start (fail-fast), thay vì runtime undefined.

### 2.7 [ESLint unsafe warnings] `@typescript-eslint/no-unsafe-*` trên `req.user`
- **Ngữ cảnh:** `context.switchToHttp().getRequest()` trả về `any`, gây hàng loạt eslint warnings.
- **Cách fix ban đầu:** Dùng `// eslint-disable` — nhìn dirty.
- **Cách fix đúng:** Tạo `AuthenticatedUser` + `AuthenticatedRequest` interfaces, dùng generic `getRequest<AuthenticatedRequest>()` → type-safe hoàn toàn, xóa sạch mọi eslint-disable.

### 2.8 [Package name sai] `@nestjs/throttler-storage-redis` → 404
- **Ngữ cảnh:** `npm install @nestjs/throttler-storage-redis` trả 404 Not Found.
- **Nguyên nhân:** Package không thuộc `@nestjs` scope. Tên đúng là `@nest-lab/throttler-storage-redis`.
- **Kinh nghiệm:** Luôn verify package name trên npmjs.com trước khi install.

### 2.9 [Throttle decorator API sai] `'name' does not exist in type ThrottlerMethodOrControllerOptions`
- **Ngữ cảnh:** `@Throttle([{ name: 'medium', ttl: 60000, limit: 5 }])` báo lỗi type.
- **Nguyên nhân:** API `@nestjs/throttler` v5+ dùng object keyed by name, không phải array.
- **Cách fix:** `@Throttle({ medium: { ttl: 60000, limit: 5 } })` — key là tên throttler.

---

## 3. Trạng thái file đã sửa / tạo mới

| File | Hành động | Ghi chú |
|------|-----------|---------|
| `prisma/schema.prisma` | Sửa | Generator → `prisma-client` + `moduleFormat = "cjs"` |
| `prisma.config.ts` | Giữ nguyên | Đã có từ Week 1 |
| `src/generated/prisma/` | Tự sinh | `npx prisma generate` → output CJS |
| `src/prisma/prisma.service.ts` | Sửa lớn | Import từ generated, dùng `PrismaPg` adapter |
| `src/main.ts` | Sửa | `setGlobalPrefix('api/v1')` |
| `tsconfig.json` | Sửa | `commonjs` + `node` + `ignoreDeprecations: "6.0"` |
| `.env` | Sửa | Thêm `JWT_SECRET`, `JWT_EXPIRES_IN`, `GOOGLE_*`, `REDIS_URL` |
| `src/modules/auth/dto/register.dto.ts` | Tạo mới | class-validator decorators |
| `src/modules/auth/dto/login.dto.ts` | Tạo mới | email + password validation |
| `src/modules/auth/dto/refresh.dto.ts` | Tạo mới | refreshToken validation |
| `src/modules/auth/auth.service.ts` | Sửa lớn | register, login, refresh, logout, findOrCreateGoogleUser, googleSignIn |
| `src/modules/auth/auth.controller.ts` | Sửa lớn | 7 routes: register, login, refresh, logout, me, google, google/callback |
| `src/modules/auth/auth.module.ts` | Sửa | JwtModule, JwtStrategy, GoogleStrategy |
| `src/modules/auth/jwt.strategy.ts` | Tạo mới | JWT token verification |
| `src/modules/auth/google.strategy.ts` | Tạo mới | Google OAuth passport strategy |
| `src/common/decorators/public.decorator.ts` | Tạo mới | `@Public()` skip auth |
| `src/common/decorators/roles.decorator.ts` | Tạo mới | `@Roles('seller')` |
| `src/common/decorators/current-user.decorator.ts` | Tạo mới | `@CurrentUser()` + interfaces |
| `src/common/guards/jwt-auth.guard.ts` | Tạo mới | Global JWT guard with @Public() support |
| `src/common/guards/roles.guard.ts` | Tạo mới | Role-based access control |
| `src/app.module.ts` | Sửa | Global guards (JWT → Roles → Throttler), ThrottlerModule |
| `src/modules/user/dto/create-address.dto.ts` | Tạo mới | Address validation |
| `src/modules/user/dto/update-address.dto.ts` | Tạo mới | PartialType extends CreateAddress |
| `src/modules/user/address.controller.ts` | Tạo mới | CRUD `/users/me/addresses` |
| `src/modules/user/address.service.ts` | Tạo mới | Address business logic + ownership check |
| `src/modules/user/user.module.ts` | Sửa | Thêm AddressController + AddressService |

---

## 4. Packages đã cài đặt trong Week 2

```bash
# Production
npm install bcrypt class-validator class-transformer @prisma/adapter-pg pg
npm install @nestjs/jwt
npm install @nestjs/passport passport passport-jwt passport-google-oauth20
npm install @nestjs/throttler @nest-lab/throttler-storage-redis ioredis

# Development
npm install --save-dev @types/bcrypt @types/pg @types/passport-jwt @types/passport-google-oauth20
```

---

## 5. Definition of Done (từ Roadmap)

| Tiêu chí | Trạng thái |
|----------|-----------|
| ✅ Register/Login/Refresh/Logout flow hoàn chỉnh | ✅ Đã test Postman |
| ✅ Google OAuth login works | ✅ Đã test qua browser |
| ✅ Protected routes return 401 without token | ✅ Global JwtAuthGuard |
| ✅ Role-based access works (buyer vs seller vs admin) | ✅ RolesGuard + @Roles() |
| ✅ Rate limiting blocks after threshold | ✅ Throttler + Redis storage |
