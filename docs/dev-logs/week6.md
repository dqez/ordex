# Development Log - Week 6: Synchronous Checkout, Stripe Integration & Idempotency Lock

> **Mục tiêu:** Tái cấu trúc luồng Checkout từ Bất đồng bộ (BullMQ) sang Đồng bộ (Synchronous Orchestration), tích hợp cổng thanh toán Stripe thực tế xử lý chính xác tiền tệ, và triển khai cơ chế Idempotency chống Race Condition hoàn hảo.
> **Trạng thái:** ✅ HOÀN THÀNH

## 1. Hành động đã thực hiện

### 1.1 Tái cấu trúc Kiến trúc Checkout (Synchronous Orchestration)
- Cập nhật tài liệu `event-flows.md` và `ADR-007`: Chuyển đổi thiết kế Checkout từ mô hình Message-driven (dùng `order-queue`) sang API đồng bộ (Synchronous).
- Xóa bỏ job `process-order` trong BullMQ worker.
- Chuyển toàn bộ chuỗi thao tác: Tạo Order (pending) $\rightarrow$ Reserve Stock (Inventory) $\rightarrow$ Create Payment (Stripe) $\rightarrow$ Cập nhật Order (stock_reserved) vào chung trong API `POST /orders/checkout`.
- Dời lệnh xóa `CartItem` xuống cuối cùng (sau khi đã reserve stock và tạo payment intent thành công) để đảm bảo UX: giỏ hàng của khách không bị mất nếu có lỗi xảy ra giữa chừng.
- Xử lý **Saga / Compensating Transaction** cơ bản: rollback stock (bằng cách gọi `releaseStock`) khi luồng tạo Payment bị crash.

### 1.2 Tích hợp Stripe Payment (Zero-decimal & DIP)
- Implement `StripePaymentProvider` tuân thủ nguyên tắc DIP (Dependency Inversion Principle) thông qua `PaymentProviderInterface`.
- Sử dụng Custom Provider Token `PAYMENT_PROVIDER` trong NestJS để dễ dàng hoán đổi (swap) từ Mock sang Stripe.
- Xử lý hoàn hảo bẫy "Zero-decimal currencies": Tách riêng tập `vnd`, `jpy`, `krw` để gọi `Math.round(amount)`, các ngoại tệ khác áp dụng `Math.round(amount.mul(100))`. Tránh lỗi chí mạng như tính 100,000 VND thành 10,000,000 VND trên Stripe.
- Đổi kiểu dữ liệu tiền tệ từ `number` (float 64) sang `Prisma.Decimal` ở mọi layer (Service, DTO, Provider) để bảo toàn tính toàn vẹn dữ liệu.

### 1.3 Triển khai Idempotency Lock & Safe Failure Mode
- Thêm trường `idempotencyKey` bắt buộc (UUID) vào `CheckoutDto`.
- Cập nhật `schema.prisma`: Đổi `response_code` và `response_body` của bảng `idempotency_keys` thành Nullable để hỗ trợ trạng thái "Đang xử lý".
- Áp dụng cơ chế **Atomic Check-Then-Act**:
  - **Step 1 (Claim Lock)**: Thực hiện lệnh `create` idempotency record ngay đầu hàm (`response_body: null`). Tách biệt vào `try/catch` độc lập để bắt đúng lỗi `P2002` (Unique Constraint) của riêng khoá này. Xóa sạch key cũ đã hết hạn (`deleteMany`) trước khi tạo.
  - **Step 2 (Business Logic)**: Chạy nghiệp vụ Checkout. Nếu thất bại ở bất cứ khâu nào (Hết hàng, Lỗi DB, Stripe sập), đảm bảo gọi lệnh `delete` Idempotency Key để nhả Lock, cho phép Client tự do Retry.
  - **Step 3 (Best-effort update)**: Sau khi thanh toán thành công, gọi lệnh `update` kết quả vào Idempotency Key. Nếu update lỗi DB, **tuyệt đối không xóa key**, chỉ log lỗi và vẫn trả về kết quả `201 Created` cho Client. (Thiết kế ngăn chặn thảm họa Double-charge).

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
- **Bài học:** Trong TS, `interface` không tự động sinh ra "index signature" (`[key: string]: any`), trong khi `type` thì có. Khi map các DTO/Interface với kiểu generic JSON của Prisma (hoặc các thư viện tương tự), việc chuyển cấu trúc từ `interface` sang `type` sẽ giải quyết bài toán ép kiểu (Type Casting) cực kỳ mượt mà.
