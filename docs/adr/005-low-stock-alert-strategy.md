# ADR 005: Chiến lược Cảnh báo Sắp Hết Hàng (Low Stock Alert)

**Ngày:** 2026-07-15
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Bảng `inventory` có cột `low_stock_threshold`. Khi số lượng tồn kho giảm xuống dưới ngưỡng này, hệ thống cần thông báo cho Seller. Cần quyết định: thông báo real-time ngay khi stock giảm, hay dùng CronJob quét định kỳ?

## Quyết định (Decision)
Sử dụng **cả hai** — mỗi cái một vai trò khác nhau:

### 1. Event-driven (Primary) — Detect Threshold Crossing

Phát event `stock.low_stock_alert` qua BullMQ **chỉ khi stock "vượt qua" ngưỡng** (từ trên → dưới), KHÔNG phải mỗi lần stock ở dưới ngưỡng:

```typescript
const wasAboveThreshold = before.quantity > before.lowStockThreshold;
const isNowBelowThreshold = after.quantity <= after.lowStockThreshold;

if (wasAboveThreshold && isNowBelowThreshold) {
  await this.notifyQueue.add('stock.low_stock_alert', { variantId, quantity: after.quantity });
}
```

Điểm mấu chốt: nếu chỉ check `after < threshold` ở mọi lần deductStock → **spam thông báo cho seller mỗi đơn hàng** một khi đã dưới ngưỡng. Detect crossing là cách đúng để thông báo đúng 1 lần.

Fire-and-forget **sau khi transaction commit** — không block checkout flow.

### 2. Cron Reconciliation (Safety Net) — Chạy 1 lần/ngày

Quét toàn bộ `inventory WHERE quantity <= low_stock_threshold` và đối chiếu với log thông báo đã gửi. Lý do vẫn cần:
- Event có thể bị miss (bug, BullMQ job fail rơi vào DLQ).
- Admin/Seller sửa tay `quantity` trực tiếp trong DB (bypass application layer).
- Pattern **defense-in-depth** — hệ thống production hiếm khi tin tưởng 100% vào 1 cơ chế duy nhất.

Thêm `reconcile-low-stock` (daily) vào nhóm scheduled jobs của `system.cleanup` queue (cùng với `cleanup-expired-carts`, `cleanup-idempotency-keys`).

## Lý do (Rationale)
1. **Event-driven cho tốc độ:** Seller biết ngay khi hàng sắp hết, kịp nhập thêm.
2. **Cron cho độ tin cậy:** Bắt lưới những gì event-driven bỏ sót.
3. **Tránh notification spam:** Detect crossing thay vì check absolute value.

## Hệ quả & Hạn chế (Consequences & Limitations)
- Cron reconciliation cần thêm 1 bảng hoặc 1 flag để track "đã gửi alert cho variant này chưa", tránh gửi lại alert mỗi ngày cho cùng 1 variant vẫn dưới ngưỡng. Có thể dùng `last_alert_sent_at` trên bảng `inventory`, hoặc check notification history.
- Event `stock.low_stock_alert` cần được thêm vào Event Catalog (`event-flows.md` mục 7) cho nhất quán.
