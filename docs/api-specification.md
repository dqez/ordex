# Ordex — API Specification

> RESTful API | Module-based | JWT Auth

## 1. Conventions

### Base URL
```
Development: http://localhost:3000/api/v1
Production:  https://api.ordex.dev/v1
```

### Authentication
```
Authorization: Bearer <access_token>
```

### Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Product variant SKU-001 has only 2 items in stock",
    "details": [ ... ]
  },
  "correlationId": "abc-123-def",
  "timestamp": "2026-04-15T10:30:00Z"
}
```

### Pagination Query
```
?page=1&limit=20&sortBy=createdAt&sortOrder=desc
```

### Rate Limiting Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1713178200
```

---

## 2. Auth Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | 🔓 Public | Register new user |
| `POST` | `/auth/login` | 🔓 Public | Login with email/password |
| `POST` | `/auth/google` | 🔓 Public | Google OAuth login |
| `POST` | `/auth/refresh` | 🔓 Public | Refresh access token |
| `POST` | `/auth/logout` | 🔒 User | Revoke refresh token |
| `GET` | `/auth/me` | 🔒 User | Get current user profile |

### `POST /auth/register`
```typescript
// Request
{
  email: string;        // required, valid email
  password: string;     // required, min 8 chars
  fullName: string;     // required
  role?: 'buyer' | 'seller';  // default: 'buyer'
}

// Response 201
{
  success: true,
  data: {
    user: { id, email, fullName, role },
    accessToken: string,
    refreshToken: string
  }
}
```

### `POST /auth/login`
```typescript
// Request
{
  email: string;
  password: string;
}

// Response 200
{
  success: true,
  data: {
    user: { id, email, fullName, role },
    accessToken: string,   // expires: 15min
    refreshToken: string   // expires: 7 days
  }
}

// Error 401
{ error: { code: "INVALID_CREDENTIALS" } }
```

### `POST /auth/refresh`
```typescript
// Request
{
  refreshToken: string;
}

// Response 200 — Token Rotation
{
  success: true,
  data: {
    accessToken: string,    // new access token
    refreshToken: string    // new refresh token (old one revoked)
  }
}

// Error 401 — Token reuse detected → revoke ALL family tokens
{ error: { code: "TOKEN_REUSE_DETECTED" } }
```

---

## 3. Product Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/products` | 🔓 Public | List products (with filters) |
| `GET` | `/products/:id` | 🔓 Public | Get product detail |
| `POST` | `/products` | 🔒 Seller | Create product |
| `PATCH` | `/products/:id` | 🔒 Seller (owner) | Update product |
| `DELETE` | `/products/:id` | 🔒 Seller (owner) | Soft delete product |
| `POST` | `/products/:id/images` | 🔒 Seller | Upload product image |
| `DELETE` | `/products/:id/images/:imageId` | 🔒 Seller | Remove image |
| `GET` | `/products/:id/variants` | 🔓 Public | List variants |
| `POST` | `/products/:id/variants` | 🔒 Seller | Create variant |
| `PATCH` | `/products/:id/variants/:variantId` | 🔒 Seller | Update variant |

### `GET /products`
```typescript
// Query Parameters
{
  page?: number;          // default: 1
  limit?: number;         // default: 20, max: 100
  categoryId?: string;    // filter by category
  sellerId?: string;      // filter by seller
  status?: 'active';      // public always sees active
  minPrice?: number;
  maxPrice?: number;
  search?: string;        // full-text search on name
  sortBy?: 'price' | 'createdAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

// Response 200
{
  success: true,
  data: [
    {
      id: string,
      name: string,
      slug: string,
      basePrice: number,
      primaryImage: string,
      category: { id, name },
      seller: { id, fullName },
      variantCount: number,
      inStock: boolean
    }
  ],
  meta: { total, page, limit, totalPages }
}
```

### `POST /products`
```typescript
// Request (multipart/form-data or JSON)
{
  name: string;           // required
  categoryId: string;     // required
  description?: string;
  basePrice: number;      // required, > 0
  currency?: string;      // default: 'VND'
  variants: [
    {
      name: string;       // 'Red / XL'
      sku: string;        // unique
      price: number;
      attributes: { color?: string, size?: string }
      initialStock: number;
    }
  ]
}

// Response 201
{
  success: true,
  data: { id, name, slug, variants: [...], status: 'draft' }
}
```

---

## 4. Category Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/categories` | 🔓 Public | List categories (tree) |
| `GET` | `/categories/:id` | 🔓 Public | Get category detail |
| `POST` | `/categories` | 🔒 Admin | Create category |
| `PATCH` | `/categories/:id` | 🔒 Admin | Update category |
| `DELETE` | `/categories/:id` | 🔒 Admin | Delete category |

---

## 5. Cart Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/cart` | 🔒 User | Get current user's cart |
| `POST` | `/cart/items` | 🔒 User | Add item to cart |
| `PATCH` | `/cart/items/:itemId` | 🔒 User | Update quantity |
| `DELETE` | `/cart/items/:itemId` | 🔒 User | Remove item |
| `DELETE` | `/cart` | 🔒 User | Clear cart |

### `POST /cart/items`
```typescript
// Request
{
  variantId: string;   // required
  quantity: number;    // required, > 0
}

// Response 200
{
  success: true,
  data: {
    cart: {
      items: [
        {
          id: string,
          variant: { id, sku, name, price, product: { name, primaryImage } },
          quantity: number,
          subtotal: number
        }
      ],
      totalItems: number,
      totalAmount: number
    }
  }
}

// Error 400
{ error: { code: "INSUFFICIENT_STOCK", message: "Only 3 items available" } }
```

---

## 6. Order Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/orders` | 🔒 Buyer | Create order (checkout) |
| `GET` | `/orders` | 🔒 User | List user's orders |
| `GET` | `/orders/:id` | 🔒 User | Get order detail |
| `POST` | `/orders/:id/cancel` | 🔒 Buyer | Cancel order |
| `GET` | `/orders/:id/status-history` | 🔒 User | Order status timeline |
| `PATCH` | `/orders/:id/ship` | 🔒 Seller | Mark as shipped |
| `PATCH` | `/orders/:id/deliver` | 🔒 Admin | Mark as delivered |

### `POST /orders`
```typescript
// Request
{
  addressId: string;       // required — shipping address
  couponCode?: string;     // optional
  note?: string;
  paymentProvider: 'stripe' | 'vnpay';  // required
  idempotencyKey: string;  // required — client-generated UUID
}

// Response 201 — Order created, async processing starts
{
  success: true,
  data: {
    order: {
      id: string,
      orderNumber: 'ORD-20260415-A1B2',
      status: 'pending',
      items: [...],
      subtotal: number,
      discountAmount: number,
      shippingFee: number,
      total: number,
      shippingAddress: { ... }
    },
    payment: {
      id: string,
      provider: 'stripe',
      status: 'pending',
      checkoutUrl: string   // Redirect user here
    }
  }
}
```

### `GET /orders`
```typescript
// Query
{
  page?: number;
  limit?: number;
  status?: OrderStatus;
  sortBy?: 'createdAt';
  sortOrder?: 'desc';
}

// Response 200
{
  success: true,
  data: [
    {
      id, orderNumber, status, total, itemCount,
      createdAt, updatedAt
    }
  ],
  meta: { total, page, limit, totalPages }
}
```

---

## 7. Payment Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/payments/:orderId/retry` | 🔒 Buyer | Retry failed payment |
| `GET` | `/payments/:orderId` | 🔒 User | Get payment status |
| `POST` | `/webhooks/stripe` | 🔓 Webhook | Stripe webhook endpoint |
| `POST` | `/webhooks/vnpay` | 🔓 Webhook | VNPay callback endpoint |

### `POST /webhooks/stripe`
```typescript
// Stripe sends this automatically
// Headers: stripe-signature: t=...,v1=...

// Server-side:
// 1. Verify signature
// 2. Check idempotency (event.id)
// 3. Process event type
// 4. Return 200

// Always returns 200 to Stripe (even on internal error, to prevent retries)
// Internal failures are handled via DLQ
```

---

## 8. Admin Module

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/dashboard` | 🔒 Admin | Dashboard metrics |
| `GET` | `/admin/orders` | 🔒 Admin | All orders (with filters) |
| `GET` | `/admin/users` | 🔒 Admin | User management |
| `PATCH` | `/admin/users/:id/role` | 🔒 Admin | Change user role |
| `GET` | `/admin/analytics/revenue` | 🔒 Admin | Revenue charts data |
| `GET` | `/admin/analytics/products` | 🔒 Admin | Best sellers |
| `GET` | `/admin/dlq` | 🔒 Admin | Dead Letter Queue jobs |
| `POST` | `/admin/dlq/:jobId/retry` | 🔒 Admin | Retry DLQ job |
| `DELETE` | `/admin/dlq/:jobId` | 🔒 Admin | Discard DLQ job |

### `GET /admin/dashboard`
```typescript
// Response 200
{
  success: true,
  data: {
    today: {
      orders: number,
      revenue: number,
      newUsers: number
    },
    thisMonth: {
      orders: number,
      revenue: number,
      conversionRate: number
    },
    recentOrders: [...],
    dlqCount: number,       // Alert if > 0
    lowStockProducts: [...]
  }
}
```

---

## 9. Notification Preferences (Optional)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | 🔒 User | List user notifications |
| `PATCH` | `/notifications/:id/read` | 🔒 User | Mark as read |
| `GET` | `/notifications/preferences` | 🔒 User | Get notification settings |
| `PATCH` | `/notifications/preferences` | 🔒 User | Update preferences |

---

## 10. Health Check

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | 🔓 Public | Application health |
| `GET` | `/health/ready` | 🔓 Public | Readiness (DB + Redis connected) |

```json
// GET /health
{
  "status": "ok",
  "uptime": 86400,
  "version": "1.0.0",
  "timestamp": "2026-04-15T10:30:00Z"
}

// GET /health/ready
{
  "status": "ok",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "bullmq": "running"
  }
}
```
