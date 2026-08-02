# Development Log - Week 6: Synchronous Checkout, Stripe Webhook & Async Order Pipeline

> **Mục tiêu:** Tái cấu trúc luồng Checkout từ Bất đồng bộ (BullMQ) sang Đồng bộ (Synchronous Orchestration), tích hợp cổng thanh toán Stripe thực tế xử lý chính xác tiền tệ, và triển khai cơ chế Idempotency chống Race Condition hoàn hảo.
> **Trạng thái:** ✅ HOÀN THÀNH

## 1. Hành động đã thực hiện

### 1.1 Tái cấu trúc Kiến trúc Checkout (Synchronous Orchestration)

- Cập nhật tài liệu `event-flows.md` và `ADR-007`: Chuyển đổi thiết kế Checkout từ mô hình Message-driven (dùng `order-queue`) sang API đồng bộ (Synchronous).
- Xóa bỏ job `process-order` trong BullMQ worker.
- Chuyển toàn bộ chuỗi thao tác: Tạo Order (pending) $\rightarrow$ Reserve Stock (Inventory) $\rightarrow$ Create Payment (Stripe) $\rightarrow$ Cập nhật Order (stock_reserved) vào chung trong API `POST /orders/checkout`.
- Dời lệnh xóa `CartItem` xuống cuối cùng (sau khi đã reserve stock và tạo payment intent thành công) để đảm bảo UX: giỏ hàng của khách không bị mất nếu có lỗi xảy ra giữa chừng (xem **ADR-008**).
- Xử lý **Saga / Compensating Transaction** cơ bản: rollback stock (bằng cách gọi `releaseStock`) khi luồng tạo Payment bị crash. Dùng flag `stockReserved` để tránh gọi release vô nghĩa khi hàng chưa được reserve.

### 1.2 Tích hợp Stripe Payment (Zero-decimal & DIP)

- Implement `StripePaymentProvider` tuân thủ nguyên tắc DIP (Dependency Inversion Principle) thông qua `PaymentProviderInterface`.
- Sử dụng Custom Provider Token `PAYMENT_PROVIDER` trong NestJS để dễ dàng hoán đổi (swap) từ Mock sang Stripe.
- Xử lý hoàn hảo bẫy "Zero-decimal currencies": Tách riêng tập `vnd`, `jpy`, `krw` để gọi `Math.round(amount)`, các ngoại tệ khác áp dụng `Math.round(amount.mul(100))`. Tránh lỗi chí mạng như tính 100,000 VND thành 10,000,000 VND trên Stripe.
- Đổi kiểu dữ liệu tiền tệ từ `number` (float 64) sang `Prisma.Decimal` ở mọi layer (Service, DTO, Provider) để bảo toàn tính toàn vẹn dữ liệu.

### 1.3 Triển khai Idempotency Lock tại Checkout & Safe Failure Mode

- Thêm trường `idempotencyKey` bắt buộc (UUID) vào `CheckoutDto`.
- Cập nhật `schema.prisma`: Đổi `response_code` và `response_body` của bảng `idempotency_keys` thành Nullable để hỗ trợ trạng thái "Đang xử lý".
- Áp dụng cơ chế **Atomic Check-Then-Act**:
  - **Step 1 (Claim Lock)**: Thực hiện lệnh `create` idempotency record ngay đầu hàm (`response_body: null`). Tách biệt vào `try/catch` độc lập để bắt đúng lỗi `P2002` (Unique Constraint). Xóa sạch key cũ đã hết hạn (`deleteMany`) trước khi tạo.
  - **Step 2 (Business Logic)**: Chạy nghiệp vụ Checkout. Nếu thất bại ở bất cứ khâu nào, gọi `delete` Idempotency Key để nhả Lock.
  - **Step 3 (Best-effort update)**: Sau khi thành công, `update` kết quả vào Idempotency Key. Nếu update lỗi, **tuyệt đối không xóa key** — chỉ log lỗi và vẫn trả `201 Created` (Safe Failure Mode).

### 1.4 Stripe Webhook Handler (WebhookModule)

- Bật `rawBody: true` trong `main.ts` để Stripe có thể verify chữ ký HMAC — bắt buộc, không có rawBody thì `constructEvent` luôn ném lỗi.
- Tạo `WebhookModule` riêng biệt (tách khỏi `PaymentModule`) để tuân thủ SRP: `PaymentModule` phục vụ user-facing, `WebhookModule` phục vụ provider-facing (Stripe gọi vào).
- `WebhookController.handleStripe()`:
  - `@Public()` để bypass JwtAuthGuard.
  - `@HttpCode(200)` — webhook endpoint bắt buộc trả 200, không trả 201 mặc định của `@Post`.
  - Guard `rawBody` và `signature` trước khi gọi xuống service, ném `BadRequestException` nếu thiếu.
  - Import `Request` từ `express` (không phải DOM `Request`) để `RawBodyRequest<Request>` có type đúng.
- Cập nhật `PaymentProviderInterface.verifyWebhookSignature()` trả về `Record<string, unknown> | null` thay vì type Stripe cứng, tránh leak concrete type vào abstraction layer.
- `StripePaymentProvider.verifyWebhookSignature()`: Cast `Stripe.Event` sang `Record<string, unknown>` thông qua double-assertion (`as unknown as Record<string, unknown>`) để satisfy TS compiler.

### 1.5 Idempotency Key cho Webhook

- Trong `PaymentService.handleStripeWebhook()`, áp dụng Idempotency Check cho webhook events:
  - Check `idempotencyKey.findFirst({ key: stripeEvent.id, resource_type: 'stripe_webhook' })` trước khi xử lý.
  - Nếu đã tồn tại → `return` ngay (Stripe đang gửi lại event cũ, ignore an toàn).
  - Nếu chưa → `create` lock với `stripeEvent.id` làm key, sau đó xử lý và `update` kết quả.
- Cast type chính xác cho `stripeEvent.data.object` thay vì để `any`: `{ id: string; metadata?: { orderId?: string } }`.

### 1.6 Async Order Pipeline (BullMQ)

- Thêm `BullModule.registerQueue({ name: 'order-queue' })` vào `PaymentModule` để dispatch job mà không tạo circular dependency với `OrderModule`.
- `PaymentService.handleStripeWebhook()` dispatch 2 loại job:
  - `'ConfirmOrder'`: khi nhận `payment_intent.succeeded`.
  - `'HandlePaymentFailure'`: khi nhận `payment_intent.payment_failed` (lưu ý: `payment_intent.failed` là sai, event đúng có chữ `payment_` ở giữa).
  - Mỗi job được config: `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnComplete: true`, `removeOnFail: false`.
- `InventoryService` bổ sung method `deductStock()`: trừ vĩnh viễn `quantity` và `reserved` bằng raw SQL với guard `AND reserved >= qty AND quantity >= qty` để ngăn số âm. Log `warn` nếu `affected === 0`.
- Cũng bổ sung affected-row check + `logger.warn` tương tự vào `releaseStock()` hiện có.
- `OrderProcessor.process()` implement đầy đủ 2 case:
  - `'ConfirmOrder'`: `deductStock` → `transitionOrderStatus(paid)`.
  - `'HandlePaymentFailure'`: `releaseStock` → `transitionOrderStatus(payment_failed)`.
  - Tách logic "lấy danh sách items từ orderId" ra private method `getItemsFromOrder()` để tránh duplicate code.
  - Inject thêm `PrismaService` vào constructor để query `OrderItem`.

### 1.7 Dead Letter Queue (DLQ) Setup

- Thêm `@OnWorkerEvent('failed') onFailed()` vào `OrderProcessor`: chỉ log `[DLQ ALERT]` khi `job.attemptsMade >= job.opts.attempts` (đã kiệt số retry), kèm `jobData` và `errorMessage`.
- Generic type của `onFailed` phải được chỉ định rõ: `Job<{ orderId: string; paymentId: string }>` để tránh lỗi `Unsafe assignment of any value`.
- Lưu ý kiến trúc: BullMQ không tự tạo queue riêng với suffix `__dlq`. Job thất bại hết retry sẽ nằm trong trạng thái `failed` của chính queue gốc (`order-queue`). File `event-flows.md` mô tả conceptual model hơi sai về `__dlq`.

---

## 2. Kiến thức kỹ thuật cốt lõi (Deep Dive)

### 2.1 Cạm bẫy Race Condition trong Idempotency

Pattern phổ biến `findUnique` $\rightarrow$ `if null` $\rightarrow$ `run logic` $\rightarrow$ `create` lưu kết quả là một mô hình chứa lỗ hổng Race Condition kinh điển.
Nếu 2 request trùng `idempotencyKey` tới cùng một mili-giây, cả 2 đều vượt qua bước `findUnique` và tiếp tục trừ hàng, trừ tiền 2 lần.
**Giải pháp chuẩn Production:** Dựa vào Database Unique Constraint. Bắt buộc gọi lệnh `create` ngay lập tức để lấy Lock (Placeholder). Thread nào sinh ra lỗi `P2002` nghĩa là đến sau, lập tức bị văng ra ngoài với mã `409 Conflict: The request is being processed`.

### 2.2 Tách biệt Try/Catch theo Scope of Risk (Phạm vi rủi ro)

Nếu dùng 1 khối `try/catch` khổng lồ bọc toàn bộ code, thì khi có lỗi `P2002` (Unique Constraint Violation) văng ra, ta không thể biết chắc đó là do trùng Idempotency Key, trùng Order Number, hay trùng Payment Provider ID.
Bằng cách cô lập lệnh `create` Idempotency Key vào một khối `try/catch` riêng biệt ở Step 1, ta đã thu hẹp chính xác **vùng ảnh hưởng (Blast Radius)** của lỗi `P2002`, tránh việc bẫy nhầm lỗi hệ thống (như generator ID sinh trùng lặp) thành lỗi duplicate request của người dùng.

### 2.3 Safe Failure Mode & Nguyên lý "Lock Ownership"

Trong một Distributed Transaction (như Checkout), nếu toàn bộ API bên ngoài đã gọi thành công (Tiền đã trừ, Hàng đã chốt) nhưng thao tác cuối cùng ở Local DB (Update Idempotency response) lại thất bại do rớt mạng, ta phải đứng giữa 2 lựa chọn: Xóa key (để client gọi lại) hay Giữ key?
Câu trả lời là **Giữ Key (Không xóa)**. Nếu xóa key, client tự động retry sẽ kích hoạt lại toàn bộ pipeline, dẫn đến **Trừ tiền lần 2 (Double Charge)**. Thà để Client kẹt ở thông báo "Vui lòng thử lại sau" khi cố Retry, còn hơn gây thiệt hại tài chính. Đây là thiết kế "Safe Failure Mode" đắt giá trong hệ thống phân tán.
Ngoài ra, nguyên lý **Lock Ownership** cũng được áp dụng triệt để: Chỉ thread nào thành công tạo ra Lock thì mới có quyền xóa (Clean up) nó ở khối catch của Step 2, tránh việc Request tới sau tiện tay xóa nhầm Lock của Request tới trước.

### 2.4 rawBody & Stripe Webhook Signature Verification

`express` mặc định parse body thành JSON object, làm mất raw buffer. Để `stripe.webhooks.constructEvent()` có thể verify chữ ký HMAC-SHA256, cần giữ nguyên buffer gốc. NestJS hỗ trợ qua `rawBody: true` trong `NestFactory.create()`. Thiếu config này thì mọi webhook đều fail signature check dù secret đúng.

### 2.5 SRP cho Webhook Module

`WebhookModule` tách biệt khỏi `PaymentModule` vì 2 module có concern khác nhau: `PaymentModule` là user-facing (tạo payment intent cho khách), còn `WebhookModule` là provider-facing (Stripe gọi vào). Khi thêm VNPay sau, chỉ cần thêm endpoint vào `WebhookModule` mà không đụng `PaymentModule` — đây là **Open/Closed Principle** đúng nghĩa.

### 2.6 DLQ trong BullMQ — Thực tế vs Conceptual Model

BullMQ không tạo queue riêng cho DLQ. Job fail hết số retry sẽ chuyển sang trạng thái `failed` trong queue gốc, có thể inspect và retry thông qua Bull Board UI (tab "Failed"). `removeOnFail: false` là bắt buộc để giữ lại job này, không để BullMQ xóa sau khi fail.

---

## 3. Bài học xương máu (Bugs & Cạm bẫy)

### 3.1 Giao phó tiền tệ cho Floating-point của Javascript

- **Bối cảnh:** Trước đây dùng `number` và hàm `.toNumber()` để cộng dồn tiền (`item.quantity * item.price`).
- **Hệ quả:** Dẫn tới lỗi sai số kinh điển của JS (ví dụ `0.1 + 0.2 = 0.30000000000000004`). Với tiền tệ, chênh lệch dù chỉ 1 đồng cũng phá hỏng đối soát (Reconciliation).
- **Bài học:** Các bài toán liên quan đến tiền bạc (Financial) bắt buộc phải dùng thư viện xử lý số lớn (như `decimal.js`) hoặc `Prisma.Decimal`. Các phép tính phải chuyển qua dạng method `.add()`, `.mul()`.

### 3.2 Bẫy xóa dữ liệu trước khi Ngoại lệ (Exception) xảy ra

- **Bối cảnh:** Lệnh xóa giỏ hàng `deleteMany` `CartItem` được gọi ngay lập tức trong Transaction DB đầu tiên, trước khi gọi API `reserveStock` và `createPayment`.
- **Hệ quả:** Nếu API `reserveStock` ném ra ngoại lệ `InsufficientStockException` (Hết hàng), đơn hàng bị hủy, nhưng giỏ hàng của User đã bị bốc hơi trắng án trong DB do transaction DB đã commit xong xuôi. User phải đi tìm và nhặt lại từng món hàng rất ức chế.
- **Bài học:** Mọi thao tác dọn dẹp dữ liệu (cleanup/delete) đều phải được đặt SAU KHI các external I/O call (Stripe, Inventory) có rủi ro cao nhất đã hoàn tất thành công.

### 3.3 Type Compatibility giữa `interface` và `type` trong TypeScript

- **Bối cảnh:** Gặp lỗi khi ép kiểu `CheckoutResult` sang `JsonObject` của Prisma (`neither type sufficiently overlaps`). TypeScript compiler liên tục báo lỗi đỏ.
- **Hệ quả:** Gây nhầm lẫn vì tưởng cấu trúc field bị sai.
- **Bài học:** Trong TS, `interface` không tự động sinh ra "index signature" (`[key: string]: any`), trong khi `type` thì có. Khi map các DTO/Interface với kiểu generic JSON của Prisma, chuyển từ `interface` sang `type` sẽ giải quyết bài toán ép kiểu.

### 3.4 Nhầm tên Stripe Event Type

- **Bối cảnh:** Khi implement switch case trong `handleStripeWebhook`, gõ `'payment_intent.failed'` cho case thanh toán thất bại.
- **Hệ quả:** Switch case không bao giờ match với event thật từ Stripe. Job `HandlePaymentFailure` không bao giờ được dispatch. Đơn hàng thất bại mãi nằm trạng thái `stock_reserved` không bao giờ được release tồn kho.
- **Bài học:** Stripe event type cho thanh toán thất bại là `payment_intent.payment_failed` (có chữ `payment_` ở giữa), còn thanh toán thành công là `payment_intent.succeeded` (không có). Phải tra Stripe Docs, không được viết theo cảm tính.

### 3.5 Logic if/else bị đảo ngược (Inverted Guard)

- **Bối cảnh:** Khi viết guard check xem Payment record có tồn tại không: `if (payment) { console.log('Payment not found'); return; }`.
- **Hệ quả:** Code return (thoát sớm) khi **tìm thấy** payment — tức là mọi đơn hàng hợp lệ đều bị bỏ qua, không bao giờ được xử lý.
- **Bài học:** Logic điều kiện đảo ngược là bug rất khó phát hiện bằng mắt thường. Câu hỏi kiểm tra: "Điều kiện này có tương ứng với message lỗi không? `if (payment)` mà lại log 'Payment not found' — mâu thuẫn."

### 3.6 `provider_payment_id` không phải Unique Key đơn lẻ

- **Bối cảnh:** Dùng `prisma.payment.update({ where: { provider_payment_id: paymentIntent.id } })` để cập nhật trạng thái payment.
- **Hệ quả:** Prisma báo lỗi compile-time vì `PaymentWhereUniqueInput` yêu cầu compound unique `(provider, provider_payment_id)`, không cho phép query chỉ bằng `provider_payment_id` một mình.
- **Bài học:** Khi schema DB có compound unique constraint, Prisma generate một input type compound, không phải từng field riêng lẻ. Giải pháp đơn giản: dùng `where: { id: payment.id }` vì đã có `payment` object từ `findFirst` trước đó rồi.

### 3.7 Import thừa và thiếu trong Controller

- **Bối cảnh:** Sau khi refactor `WebhookController`, còn sót `Get`, `Body`, `Patch`, `Param`, `Delete` (thừa từ boilerplate `nest g res`) nhưng thiếu `@Req` và `BadRequestException`.
- **Hệ quả:** TypeScript báo lỗi `@Req is not defined` tại runtime, đồng thời import thừa gây noise code.
- **Bài học:** Sau mỗi lần refactor, luôn đọc lại toàn bộ import block và xóa những gì không được dùng.

### 3.8 `import { Request }` từ sai nguồn

- **Bối cảnh:** `RawBodyRequest<Request>` dùng kiểu `Request` nhưng không import rõ ràng, TypeScript tự resolve sang DOM `Request` (Web API).
- **Hệ quả:** IDE báo lỗi "Unsafe assignment of an error typed value" vì DOM `Request` và Express `Request` incompatible.
- **Bài học:** Trong NestJS (Express-based), phải `import { Request } from 'express'` tường minh. Không bao giờ giả định TypeScript tự resolve đúng khi có nhiều `Request` type khác nhau trong global scope.
