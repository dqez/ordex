# Ordex — Event-driven E-Commerce Platform

> NestJS Modular Monolith | PostgreSQL + Redis | BullMQ

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10+ (TypeScript strict) |
| Database | PostgreSQL 16 (Prisma ORM) |
| Cache/Queue | Redis 7 (BullMQ) |
| Auth | JWT + Google OAuth (Passport.js) |
| Payment | Stripe + VNPay (Strategy Pattern) |
| Email | Resend.com |
| Storage | Cloudflare R2 |
| Frontend | Next.js 15 (Admin Dashboard) |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop

### Setup

```bash
# 1. Clone & install
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your values

# 3. Start infrastructure
docker-compose up -d

# 4. Run database migration
npx prisma migrate dev --name init

# 5. Start dev server
npm run start:dev
```

### Verify

```bash
curl http://localhost:3000/api/v1/health
# → { "status": "ok" }

curl http://localhost:3000/api/v1/health/db
# → { "status": "ok", "info": { "database": { "status": "up" } } }
```

## Project Structure

```
src/
├── modules/
│   ├── auth/           # JWT, OAuth, Guards
│   ├── user/           # Profile, Address
│   ├── product/        # Product, Variant, Category
│   ├── inventory/      # Stock management
│   ├── order/          # Order lifecycle, Cart
│   ├── payment/        # Stripe, VNPay
│   ├── notification/   # Email, Telegram
│   ├── analytics/      # Background jobs
│   └── health/         # Health checks
├── common/
│   ├── decorators/     # @Public, @Roles, @CurrentUser
│   ├── exceptions/     # BusinessException
│   ├── filters/        # GlobalExceptionFilter
│   ├── guards/         # AuthGuard, RolesGuard
│   ├── interceptors/   # LoggingInterceptor
│   ├── middleware/     # CorrelationId, RequestLogging
│   ├── pipes/          # ValidationPipe
│   ├── types/          # Express declarations
│   └── utils/          # Helpers
├── config/             # ConfigModule, env validation
└── prisma/             # PrismaService, PrismaModule
prisma/
└── schema.prisma       # Full database schema
```

## API

Base URL: `http://localhost:3000/api/v1`

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/health` | App health check |
| GET | `/health/db` | Database health check |

## Development Roadmap

| Phase | Weeks | Focus | Status |
|-------|-------|-------|--------|
| 0 | 1 | Architecture & Foundation | ✅ **Done** |
| 1 | 2 | Auth Module | ⬜ Pending |
| 2 | 3–4 | Product & Inventory | ⬜ Pending |
| 3 | 5–6 | Order + Payment (CORE) | ⬜ Pending |
| 4 | 7 | Notification + Caching | ⬜ Pending |
| 5 | 8 | Analytics + Admin FE | ⬜ Pending |
| 6 | 9 | Testing + Security | ⬜ Pending |
| 7 | 10 | Deploy + Documentation | ⬜ Pending |

## Documentation

- [Architecture](../docs/architecture.md)
- [Database Design](../docs/database-design.md)
- [API Specification](../docs/api-specification.md)
- [Event Flows](../docs/event-flows.md)
- [Roadmap](../docs/roadmap.md)
