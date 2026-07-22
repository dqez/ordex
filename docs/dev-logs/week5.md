# Development Log - Week 5: Cart, Order & BullMQ Pipeline

> **Mục tiêu:** Xây dựng module Cart tối ưu về query, triển khai luồng Order Checkout phức tạp bằng Prisma Interactive Transaction và Snapshot Pattern, tích hợp BullMQ để xử lý bất đồng bộ (background jobs), và thiết kế kiến trúc Strategy Pattern chuẩn SOLID cho Payment.
> **Trạng thái:** ✅ HOÀN THÀNH

## 1. Hành động đã thực hiện

### 1.1 Cart Module (Giỏ hàng)
- Cập nhật Prisma schema: Chuyển quan hệ `Cart` và `User` về đúng chuẩn `1-1` (sử dụng `@unique` trên `user_id`).
- Triển khai `CartService` với các hàm `getCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `clearCart`.
- Sử dụng hiệu quả lệnh `upsert` của Prisma để giảm thiểu số lượng query khi thêm mới sản phẩm vào giỏ hàng.
- Xử lý mượt mà ngoại lệ `P2025` (RecordNotFound) bằng `try...catch` và ánh xạ sang HTTP `404 Not Found`.

### 1.2 Order Domain & State Machine
- Mã hóa cứng (hard-code) các quy tắc chuyển đổi trạng thái đơn hàng thông qua hằng số `VALID_ORDER_TRANSITIONS` (sử dụng Prisma `OrderStatus` Enum). Đảm bảo tính Readonly và Type Safety tuyệt đối.
- Triển khai `transitionOrderStatus` sử dụng Array Transaction của Prisma để cập nhật trạng thái đơn hàng và ghi log vào `OrderStatusHistory` cùng lúc (Atomic).
- Xây dựng tiện ích `generateOrderNumber` để tạo mã đơn hàng dạng `ORD-YYYYMMDD-XXXX`.

### 1.3 Checkout Flow (Trái tim của hệ thống)
- Triển khai luồng thanh toán sử dụng **Prisma Interactive Transaction** (`$transaction(async (tx) => {...})`):
  - Khóa toàn bộ quá trình tính toán và tạo đơn.
  - Snapshot trực tiếp `shipping_address` sang dạng JSON lưu thẳng vào bảng `orders` (Áp dụng **ADR-001**).
  - Snapshot tên, SKU, giá của `ProductVariant` vào bảng `order_items`.
  - Tối ưu hiệu năng bằng `createMany` thay vì vòng lặp `for...of` khi insert Order Items.
  - Xóa sạch Cart Items sau khi checkout thành công.

### 1.4 BullMQ Background Pipeline
- Tích hợp `@nestjs/bullmq` và cấu hình kết nối Redis (tái sử dụng cấu hình từ Throttler).
- Chuyển logic nặng nề (Reserve Stock của Inventory) ra khỏi API Checkout chính, đẩy vào `order-queue`.
- Tạo `OrderProcessor` (kế thừa `WorkerHost`) để consume job `process-order`:
  - Thành công: Chuyển trạng thái Order sang `confirmed`.
  - Hết hàng (`InsufficientStockException`): Chuyển trạng thái sang `cancelled` và ngắt job (không retry).
  - Lỗi mạng/Hệ thống: Quăng lỗi để BullMQ tự động retry theo cơ chế Exponential Backoff.

### 1.5 Solid Payment Interface (OCP & DIP)
- Triển khai **Strategy Pattern** cho cổng thanh toán thông qua `PaymentProviderInterface`.
- Định nghĩa Custom Provider Token `PAYMENT_PROVIDER` để inject phụ thuộc. Hệ thống hoàn toàn không biết đến class `MockPaymentProvider` cụ thể. (Chuẩn bị sẵn sàng cho Stripe và VNPay ở Week 6).

---

## 2. Kiến thức kỹ thuật cốt lõi (Deep Dive)

### 2.1 Prisma Nested Includes vs Performance Trade-offs
Trong API View Cart, việc sử dụng `include` lồng nhau sâu (`Cart` -> `CartItems` -> `ProductVariant` -> `Product` -> `ProductImage`) là hợp lý để lấy đủ dữ liệu hiển thị (tên, hình ảnh). 
Tuy nhiên, nếu tái sử dụng hàm `getCart` này bên trong API `addToCart` (chỉ để lấy ID của giỏ hàng), hệ thống sẽ bị kéo chậm đáng kể do phải query hàng tá bảng không cần thiết. Giải pháp là tách biệt: API đọc thì dùng nested include, API ghi/update thì dùng `upsert` nhẹ nhàng với `select: { id: true }`.

### 2.2 Snapshot Pattern (Event Sourcing siêu nhỏ)
- Thay vì lưu FK tham chiếu đến bảng `Address`, Ordex lưu **bản sao** của địa chỉ tại thời điểm đặt hàng. 
- Lý do: Nếu user chuyển nhà và sửa địa chỉ trong profile, các đơn hàng cũ đã giao không được phép bị đổi địa chỉ giao hàng. Tương tự cho Giá và Tên sản phẩm — cần chốt vĩnh viễn mức giá tại thời điểm khách hàng ấn nút Mua.
- **Lưu ý:** Chỉ snapshot các fields có ý nghĩa nghiệp vụ (`full_name`, `phone`, `address_line`...), tuyệt đối không spread (nhân bản) nguyên object Prisma vì nó chứa các field rác như `id`, `created_at`.

### 2.3 Dependency Inversion Principle (DIP) đúng nghĩa
Nếu Module A xuất (export) một Class B, Module C import Class B để dùng → Đây KHÔNG phải là DIP, vì C vẫn phụ thuộc chặt chẽ vào implementation của B.
DIP chuẩn trong NestJS: Module A export một **Token** (chuỗi string / Symbol), và gắn Token đó vào Class B. Module C chỉ biết đến cái Token đó và Interface tương ứng. Khi thay đổi Class B thành Class D (Ví dụ Mock → Stripe), code của Module C (OrderService) **không thay đổi dù chỉ một dòng**.

---

## 3. Bài học xương máu (Bugs & Cạm bẫy)

### 3.1 "Increment" vs "Set" (Sự kỳ vọng của User)
- **Bối cảnh:** Khi viết logic cập nhật số lượng của 1 món hàng trong giỏ, tôi dùng lệnh `increment: dto.quantity`.
- **Hệ quả:** Nếu trong giỏ có 2 món, user gõ số 5 vào ô input trên màn hình, giỏ hàng sẽ thành 7 món!
- **Bài học:** Lỗi Business Logic không đến từ code sai cú pháp, mà đến từ việc không hiểu "Sự kỳ vọng của UX". Ở giao diện Cart, thay đổi ô input đồng nghĩa với thao tác **ghi đè (Set)**, chứ không phải **cộng dồn (Increment)**.

### 3.2 Lỗi logic hàm `Date.now()`
- **Bối cảnh:** Khi thiết kế mã đơn hàng dạng `ORD-YYYYMMDD-XXXX`, tôi dùng `Date.now().toLocaleString()`.
- **Hệ quả:** Mã đơn hàng sinh ra chuỗi kỳ dị `ORD-1,753,134,268,000-A3XZ` vì `Date.now()` trả về Unix Timestamp.
- **Bài học:** Cần sử dụng `new Date()` và trích xuất rõ ràng `.getFullYear()`, `.getMonth()`, `.getDate()`. Hơn nữa, phải nhớ dùng `padStart(2, '0')` để tháng 8 không bị biến thành `8` (phải là `08`), giữ cho mã đơn hàng có độ dài đồng nhất.

### 3.3 Nguy cơ "Double Reserve" do Non-Idempotency
- **Bối cảnh:** Worker đang gọi hàm `reserveStock()` (cộng dồn `reserved` lên) thì bị crash. BullMQ cứu cánh bằng cách tự động Retry job này từ đầu.
- **Hệ quả:** Mặc dù luồng chạy lại thành công, nhưng những món hàng đã được cộng dồn ở lần 1 (trước khi crash) sẽ bị cộng dồn lần 2. Dẫn đến âm kho ảo.
- **Bài học:** Các Background Jobs thao tác làm thay đổi dữ liệu (mutation) bắt buộc phải là **Idempotent** (chạy 1 hay 100 lần kết quả vẫn như nhau). Mặc dù hiện tại hệ thống chưa giải quyết triệt để (đã để dành tới Week 8: Idempotency Key), nhưng việc nhận thức được rủi ro này là một bước tiến cực lớn về tư duy Distributed Systems.
