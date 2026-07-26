# ADR 007: Đồng bộ hoá luồng Checkout (Reserve Stock + Create Payment Intent) — Giới hạn BullMQ cho phần thực sự bất đồng bộ

**Ngày:** 2026-07-25 (Week 6)
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Sequence diagram gốc trong `event-flows.md` (mục 2.1, Happy Path) mô tả luồng checkout như sau:
1. `POST /orders` tạo `Order (status: pending)`, dispatch job `ValidateAndReserveStock` vào `OrderQueue` (BullMQ), trả về `201 Created` ngay lập tức.
2. Kết nối HTTP đóng lại tại đây.
3. Vài giây sau, Worker mới nhặt job, giữ kho, rồi tiếp tục dispatch job `ProcessPayment`, gọi Stripe tạo `PaymentIntent`.
4. Diagram ghi: `PaymentService-->>Client: Redirect to Stripe checkout`.

Bước 4 **không thể thực hiện được về mặt kỹ thuật**: HTTP là giao thức request/response, kết nối giữa trình duyệt và server đã đóng ngay sau bước 1. Server không có cách nào "redirect" hay đẩy `client_secret` ngược lại trình duyệt của một request đã kết thúc từ trước đó.

Đồng thời, `api-specification.md` (mục 6, response mẫu `POST /orders`) lại giả định `checkoutUrl` nằm **ngay trong response 201** của request checkout — tức là bản thân tài liệu API spec đã thiết kế theo hướng đồng bộ, mâu thuẫn trực tiếp với sequence diagram trong `event-flows.md`.

## Phân tích latency thực tế (Rationale)

| Bước | Thời gian ước tính |
|---|---|
| Reserve stock (1 UPDATE với optimistic lock, tối đa 3 retry) | ~1–20ms |
| Gọi Stripe API tạo PaymentIntent | ~200–500ms |
| **Tổng** | **Dưới 1 giây** |

Con số này nằm hoàn toàn trong ngưỡng chấp nhận được của một HTTP request thông thường. BullMQ/hàng đợi bất đồng bộ sinh ra để giải quyết việc **chậm thật sự, không chắc chắn về thời điểm hoàn tất, hoặc không do server chủ động kiểm soát lịch trình** (gửi email, gọi Telegram, tổng hợp analytics, và đặc biệt — webhook do Stripe chủ động gọi ngược lại theo lịch của họ). Reserve stock và tạo payment intent không thuộc nhóm này.

## Quyết định (Decision)

**1. Đồng bộ hoá** bước reserve-stock + create-payment-intent, chạy trực tiếp trong request `POST /orders/checkout`:

```typescript
async checkout(dto: CheckoutDto, userId: string) {
  const order = await this.orderRepo.create({ status: 'pending', ... });

  try {
    // 1. Reserve stock — in-process, có retry nội bộ, KHÔNG qua queue
    await this.inventoryService.reserveStock(order.items);
    await this.orderRepo.updateStatus(order.id, 'stock_reserved');

    // 2. Gọi Stripe/VNPay ngay trong cùng request
    const paymentIntent = await this.paymentService.createPaymentIntent(order);
    await this.paymentRepo.create({ orderId: order.id, status: 'processing', ... });

    // 3. Trả thẳng client_secret / checkoutUrl trong response 201
    return { order, payment: { clientSecret: paymentIntent.clientSecret } };

  } catch (err) {
    // Compensation ngay tại chỗ — pipeline ngắn 2 bước, không cần Saga formal
    await this.inventoryService.releaseStock(order.items).catch(() => {});
    await this.orderRepo.updateStatus(order.id, 'cancelled');
    throw new PaymentGatewayException(err);
  }
}
```

**2. Giữ nguyên bất đồng bộ (qua BullMQ)** cho phần thực sự không do server chủ động kiểm soát lịch trình:
- Webhook `payment_intent.succeeded` → job `ConfirmOrder`: `stock_reserved` → `paid` → `processing`, trừ kho vĩnh viễn, dispatch Notify + Analytics.
- Webhook `payment_intent.failed` → job `HandlePaymentFailure`: release stock, chuyển `payment_failed`.
- Cron `release-stale-reservations` (giữ nguyên, không đổi) — vẫn cần thiết vì user có thể đã nhận được `client_secret` nhưng bỏ dở giữa chừng ở trang thanh toán, khiến order treo ở `stock_reserved` quá 15 phút.

## Hệ quả & Đánh đổi (Consequences & Limitations)

**Tích cực:**
- Loại bỏ hoàn toàn vấn đề "chuyển tiếp kết quả từ worker sang client đã đóng kết nối" — không còn khoảng hở giữa 2 request.
- Không cần thêm cơ chế polling/WebSocket cho một luồng có latency dưới 1 giây.
- Ranh giới sync/async được vẽ đúng theo bản chất: đồng bộ cho phần server chủ động kiểm soát; bất đồng bộ cho phần phụ thuộc bên thứ ba gọi ngược lại.

**Đánh đổi:**
- Request `POST /orders/checkout` chịu toàn bộ latency của lệnh gọi Stripe (~200–500ms) thay vì trả về ngay lập tức — chấp nhận được vì đây là hành động người dùng chủ động chờ (bấm nút "Đặt hàng"), không phải background task.
- Nếu Stripe API chậm bất thường hoặc timeout, request checkout sẽ bị treo lâu hơn bình thường — cần đặt timeout hợp lý cho lệnh gọi Stripe SDK (khuyến nghị 5–10s) và xử lý lỗi rõ ràng thay vì để mặc định.
