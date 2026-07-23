# ADR 006: Tách biệt Order Status và Payment Status — Nguyên tắc Single Source of Truth per Aggregate

**Ngày:** 2026-07-23
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh

Khi thiết kế luồng Order → Payment, xuất hiện 2 câu hỏi kiến trúc:

1. Order nên có bao nhiêu trạng thái (state)? Đặc biệt: có nên thêm `payment_processing` vào enum `OrderStatus` không?
2. Có nên giữ `confirmed` (vốn mơ hồ về nghĩa) hay thay bằng `stock_reserved` (rõ ràng hơn)?

## Các phương án đã xem xét

### Phương án A: Gộp — Chỉ dùng status hiện có, không thêm gì

```
pending → confirmed → paid → processing → shipped → delivered → completed
```

**Vấn đề:** `confirmed` gộp 2 tình huống có cách xử lý hoàn toàn khác nhau:

- Vừa reserve stock xong, chưa tạo Payment Intent → Nếu kéo dài quá vài giây, đây là bug hệ thống.
- User đang ở trang thanh toán Stripe/VNPay → Hành vi bình thường, có thể kéo dài 10–15 phút.

Hệ quả: Cron job `release-stale-reservations` và Admin Dashboard buộc phải **query chéo** qua bảng `payments` để suy luận lại — tức là thông tin vẫn cần, chỉ bị giấu đi thay vì được model rõ ràng. Độ phức tạp bị chuyển sang nơi khác, không thực sự giảm.

### Phương án B: Thêm cả `stock_reserved` và `payment_processing` vào OrderStatus

```
pending → stock_reserved → payment_processing → paid → ...
```

**Vấn đề:** Bảng `payments` đã có sẵn cột `status` với giá trị `'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded'`. Nếu thêm `payment_processing` vào `OrderStatus` nữa, hệ thống đang **lưu cùng một sự thật ở 2 nơi**:

- `orders.status = 'payment_processing'`
- `payments.status = 'processing'`

Hai cột này phải luôn đồng bộ. Nhưng trong hệ thống bất đồng bộ (BullMQ), payment webhook có thể update `payments.status` xong trong khi job update `orders.status` bị delay/fail → 2 bảng lệch nhau, không biết tin cái nào.

Đây là vi phạm nguyên tắc **Single Source of Truth per Aggregate**: trạng thái payment thuộc về Payment aggregate, không nên nhân bản sang Order aggregate.

### ✅ Phương án B' (Được chọn): Chỉ thêm `stock_reserved`, bỏ `payment_processing` và `confirmed`

```
pending → stock_reserved → paid → processing → shipped → delivered → completed
    ↘ cancelled              ↘ payment_failed → cancelled
```

## Quyết định

1. **Thêm `stock_reserved`** vào enum `OrderStatus` — phản ánh 1 sự kiện thật, xảy ra 1 lần, thuộc sở hữu của Order/Inventory aggregate. Đáng là 1 state riêng.
2. **Loại bỏ `confirmed`** — trạng thái này mơ hồ, không rõ nghĩa (confirmed bởi ai? stock hay payment?). Thay thế hoàn toàn bằng `stock_reserved`.
3. **Không thêm `payment_processing`** vào OrderStatus — trạng thái chi tiết của quá trình thanh toán được theo dõi qua `payments.status`, không nhân bản vào `orders.status`.

Khi cần biết "đơn hàng đang ở bước nào của payment", chỉ cần query:

```typescript
// Order ở stock_reserved + chưa có payment → job ProcessPayment chưa chạy (bug hệ thống nếu kéo dài)
// Order ở stock_reserved + payments.status = 'processing' → user đang thanh toán (bình thường)
const isAwaitingPayment =
  order.status === "stock_reserved" && order.payment?.status === "processing";
```

## Nguyên tắc áp dụng

> **State chỉ nên tồn tại trong 1 aggregate nếu nó không thể suy ra được từ nơi khác.** Nếu `payment_processing` suy ra được từ `payments.status`, nó không cần là 1 giá trị riêng của `OrderStatus`.

## Hệ quả

- `OrderStatus` enum: Thêm `stock_reserved`, xóa `confirmed`.
- `order-transitions.constant.ts`: Cập nhật transition map.
- `order.processor.ts`: Job `process-order` set status → `stock_reserved` (thay vì `confirmed`).
- `event-flows.md`: Cập nhật mermaid diagram, xóa node `payment_processing`, thêm ghi chú "Payment sub-state tracked via Payment.status".
- Cron job `release-stale-reservations` (Week 7): Query `orders WHERE status = 'stock_reserved' AND created_at < NOW() - INTERVAL '15 min'` — rõ ràng, không cần join `payments`.
