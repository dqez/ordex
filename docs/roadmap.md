# Ordex — Roadmap

> 10-12 Week Implementation Plan

## Overview

| Phase | Weeks | Focus                     | Deliverable                        |
| ----- | ----- | ------------------------- | ---------------------------------- |
| 0     | 1     | Architecture & Foundation | Docker, scaffold, base config      |
| 1     | 2     | Auth Module               | JWT, OAuth, RBAC, rate limiting    |
| 2     | 3–4   | Product & Inventory       | CRUD, variants, stock, upload      |
| 3     | 5–6   | Order + Payment (CORE)    | BullMQ pipeline, Stripe, VNPay     |
| 4     | 7     | Notification + Caching    | Async notify, Redis cache          |
| 5     | 8     | Analytics + Admin FE      | Dashboard, charts, DLQ UI          |
| 6     | 9     | Testing + Security        | Unit test, integration test, OWASP |
| 7     | 10    | Deploy + Document         | Docker, CI/CD, README, demo video  |
| Bonus | 11–12 | Microservice + AI Search  | Tách service, pgvector             |

---

## Week 1 — Architecture & Foundation

### Tasks

- [x] Design ERD (finalize `database-design.md`)
- [x] Setup monorepo hoặc single repo structure
- [x] Initialize NestJS project với TypeScript strict mode
- [x] Setup Docker Compose: PostgreSQL 16 + Redis 7
- [x] Configure Prisma ORM + initial migration
- [x] Setup project structure:
  ```
  src/
  ├── modules/
  │   ├── auth/
  │   ├── user/
  │   ├── product/
  │   ├── inventory/
  │   ├── order/
  │   ├── payment/
  │   ├── notification/
  │   └── analytics/
  ├── common/
  │   ├── decorators/
  │   ├── filters/
  │   ├── guards/
  │   ├── interceptors/
  │   ├── pipes/
  │   └── utils/
  ├── config/
  └── prisma/
  ```
- [x] Setup global exception filter
- [x] Setup Winston structured logging + correlation ID mid dleware
- [x] Setup environment configuration (ConfigModule)
- [x] Write ADR documents

### Definition of Done

✅ `docker-compose up` khởi động PG + Redis  
✅ NestJS app chạy, `/health` endpoint trả OK  
✅ Prisma schema compile, migration chạy  
✅ Logging middleware hoạt động với correlation ID

---

## Week 2 — Auth Module

### Tasks

- [x] Implement User entity + Prisma schema
- [x] Register endpoint (email + password, bcrypt hash)
- [x] Login endpoint (return JWT access + refresh token)
- [x] JWT access token (15min expiry)
- [x] Refresh token rotation:
  - Issue new refresh + access token
  - Revoke old refresh token
  - Detect token reuse → revoke all family tokens
- [x] Google OAuth 2.0 (Passport.js strategy)
- [x] AuthGuard (JWT verification)
- [x] RolesGuard + `@Roles()` decorator
- [x] `@Public()` decorator for open endpoints
- [x] `@CurrentUser()` parameter decorator
- [x] Rate limiting middleware (Redis sliding window)
- [x] Address CRUD for user

### Definition of Done

✅ Register/Login/Refresh/Logout flow hoàn chỉnh  
✅ Google OAuth login works  
✅ Protected routes return 401 without token  
✅ Role-based access works (buyer vs seller vs admin)  
✅ Rate limiting blocks after threshold

---

## Week 3–4 — Product & Inventory

### Week 3 Tasks

- [x] Category CRUD (admin only) + nested tree
- [x] Product CRUD (seller) + soft delete
- [x] Product Variant CRUD + SKU generation
- [x] Image upload to Cloudflare R2
- [x] Product listing API with filters/pagination/sort
- [x] Full-text search on product name

### Week 4 Tasks

- [x] Inventory table + 1:1 with variant
- [x] Stock reservation logic (reserve on order)
- [x] Stock release logic (release on payment fail)
- [x] **Optimistic locking** implementation:
  - `version` column check on UPDATE
  - Retry on conflict (max 3)
- [ ] Low stock alert (threshold-based)
- [x] Seed data script (categories + sample products)

### Definition of Done

✅ Seller can create/edit/delete products + variants
✅ Image upload works
✅ Search/filter/pagination works
✅ Concurrent stock reservation test passes:

- 2 concurrent requests for 1 remaining item → only 1 succeeds
  ✅ Stock reserve/release flow works

---

## Week 5–6 — Order + Payment (THE CORE)

### Week 5 Tasks

- [x] Cart module (add/update/remove/clear)
- [x] Checkout flow: cart → validate → create order
- [x] Order number generation (`ORD-YYYYMMDD-XXXX`)
- [x] Order status state machine
- [x] OrderStatusHistory tracking
- [x] BullMQ setup + queue definitions
- [x] Order pipeline: `OrderCreated → ValidateStock → ReserveStock → ProcessPayment`

### Week 6 Tasks

- [ ] **Payment Strategy Pattern:**
  - `PaymentProviderInterface`
  - `StripeProvider` implementation
  - `VNPayProvider` implementation
- [ ] Stripe PaymentIntent creation + checkout URL
- [ ] VNPay payment URL generation
- [ ] **Webhook handlers:**
  - Stripe: `payment_intent.succeeded` / `failed`
  - VNPay: return URL + IPN callback
- [ ] **Idempotency key** for all webhooks
- [ ] Payment success flow: `ConfirmOrder → DeductStock → Notify`
- [ ] Payment failure flow: `ReleaseStock → CancelOrder → Notify`
- [ ] **Saga compensation** on pipeline failure
- [ ] Dead Letter Queue setup

### Definition of Done

✅ End-to-end order flow: cart → checkout → payment → confirmed  
✅ Stripe test mode payment works  
✅ VNPay sandbox payment works  
✅ Payment failure → stock release → order cancelled  
✅ Webhook idempotency: same event processed once only  
✅ DLQ captures failed jobs  
✅ Order status history records all transitions

---

## Week 7 — Notification + Caching

### Tasks

- [ ] BullMQ notification queue
- [ ] Email notification (Resend.com API)
- [ ] Telegram Bot notification (webhook)
- [ ] Notification templates:
  - Order confirmed
  - Payment received
  - Payment failed
  - Order shipped
- [ ] **Redis cache layer:**
  - Product catalog cache (TTL: 5min)
  - Category tree cache (TTL: 30min)
  - Cache invalidation on product/category update
- [ ] Session store in Redis (if needed)
- [ ] Scheduled jobs:
  - `cleanup-expired-carts` (every 6h)
  - `cleanup-idempotency-keys` (daily)
  - `release-stale-reservations` (every 30min)

### Definition of Done

✅ Order confirmation email sent  
✅ Telegram notification works  
✅ Cache hit/miss observable in logs  
✅ Cache invalidation works (update product → cache cleared)  
✅ Scheduled jobs running on time

---

## Week 8 — Analytics + Admin Frontend

### Backend Tasks

- [ ] Analytics aggregation background job (BullMQ cron, daily)
- [ ] Revenue by day/month API
- [ ] Best-selling products API
- [ ] Order conversion rate API
- [ ] Admin dashboard metrics API
- [ ] DLQ management API (list, retry, discard)

### Frontend Tasks (Next.js Admin Dashboard)

- [ ] Setup Next.js project (App Router)
- [ ] Auth flow (login, token storage)
- [ ] Dashboard page: metrics cards + charts (Recharts)
- [ ] Orders management page: list, filter, detail view
- [ ] Products management: list, create/edit, variants
- [ ] DLQ viewer: list failed jobs, retry/discard actions
- [ ] Basic responsive layout

### Definition of Done

✅ Admin can login and see dashboard metrics  
✅ Charts render revenue/orders data  
✅ Admin can manage orders (view, filter)  
✅ Admin can manage DLQ jobs

---

## Week 9 — Testing + Security

### Testing Tasks

- [ ] Unit tests for business logic:
  - Order state machine transitions
  - Price calculation + coupon application
  - Stock reservation + optimistic locking
  - Idempotency key validation
  - JWT token rotation logic
- [ ] Integration tests for critical APIs:
  - Auth flow (register → login → refresh → logout)
  - Order flow (cart → checkout → webhook → confirm)
  - Payment webhook idempotency
- [ ] Test coverage report (target: >70% on business logic)

### Security Tasks

- [ ] Input validation on ALL endpoints (class-validator)
- [ ] SQL injection prevention (Prisma parameterized queries)
- [ ] XSS prevention (sanitize user input)
- [ ] CORS configuration
- [ ] Helmet.js (security headers)
- [ ] Rate limiting verification
- [ ] Webhook signature verification (Stripe, VNPay)
- [ ] Environment variables: no secrets in code

### Definition of Done

✅ All unit tests pass  
✅ Integration tests for auth + order flow pass  
✅ No critical security vulnerabilities  
✅ Rate limiting tested under load

---

## Week 10 — Deploy + Document

### Deploy Tasks

- [ ] Dockerize NestJS app (multi-stage build)
- [ ] Docker Compose for production (PG + Redis + App)
- [ ] GitHub Actions CI: lint → test → build → deploy
- [ ] Deploy backend to Railway or VPS (Hetzner)
- [ ] Deploy admin frontend to Vercel
- [ ] Setup domain + SSL
- [ ] Environment variables on production
- [ ] Sentry error tracking setup

### Documentation Tasks

- [ ] README.md:
  - Project overview + motivation
  - Architecture diagram
  - Tech stack + rationale
  - Setup guide (local dev)
  - API documentation link
  - Demo account credentials
  - Screenshots
- [ ] Architecture diagram (export as image)
- [ ] Record demo video (3-5 min): key flows
- [ ] API docs: Swagger/OpenAPI auto-generated

### Definition of Done

✅ Production deployment accessible via URL  
✅ CI/CD pipeline green  
✅ README complete with architecture diagram  
✅ Demo video recorded  
✅ Sentry capturing errors

---

## Week 11–12 (Bonus) — Advanced Features

### Option 1: Microservice Extraction

- [ ] Tách Notification Module → standalone NestJS microservice
- [ ] Communication via Redis (NestJS microservice transport)
- [ ] Service discovery / health check
- [ ] Update architecture diagram

### Option 2: AI-Powered Search

- [ ] Setup pgvector extension
- [ ] Embed product descriptions via OpenAI API
- [ ] Semantic search endpoint: natural language → results
- [ ] Example: "tai nghe gaming dưới 1 triệu" → relevant products

### Option 3: Storefront Frontend (Phase 2)

- [ ] Next.js storefront: product listing, detail, cart, checkout
- [ ] Responsive design
- [ ] SEO optimization

---

## Risk Assessment

| Risk                             | Impact    | Mitigation                                        |
| -------------------------------- | --------- | ------------------------------------------------- |
| Payment integration complexity   | 🔴 High   | Start with Stripe (better docs), add VNPay after  |
| BullMQ pipeline debugging        | 🟠 Medium | Add extensive logging, use BullMQ dashboard UI    |
| Scope creep                      | 🟠 Medium | Stick to "depth over breadth" principle           |
| AI-generated code not understood | 🔴 High   | Write ADR for every pattern, explain in interview |
| Frontend taking too much time    | 🟠 Medium | Admin only in Phase 1, minimal UI                 |
