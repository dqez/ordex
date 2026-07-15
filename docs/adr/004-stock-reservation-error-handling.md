# ADR 004: Chiến lược Xử lý Lỗi cho Stock Reservation (Optimistic Locking)

**Ngày:** 2026-07-15
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Khi nhiều request đồng thời cùng mua 1 sản phẩm, hệ thống sử dụng Optimistic Locking (`version` column) để ngăn overselling. Khi `reserveStock` thất bại, cần quyết định: ném 1 loại exception chung hay phân biệt theo nguyên nhân gốc?

## Quyết định (Decision)

### 1. Phân tách 2 loại exception theo root cause

| Nguyên nhân | Ý nghĩa | Retry có ích? | HTTP Status |
|---|---|---|---|
| `version` mismatch (ai đó update trước) | Technical conflict — state đã đổi | ✅ Có, retry sẽ thấy data mới | `409 Conflict` |
| `(quantity - reserved) < requestedQty` | Business rule — thật sự hết hàng | ❌ Không, retry mãi vẫn vậy | `422 Unprocessable Entity` |

- Tạo 2 custom exception: `InsufficientStockException` (422) và `StockReservationConflictException` (409).
- Trong vòng lặp retry: **check tồn kho trước** (fail fast nếu hết hàng), chỉ retry khi version conflict.

### 2. Jitter Backoff thay vì Fixed Delay

Khi nhiều request retry đồng thời với delay cố định, chúng sẽ va nhau lần nữa ở cùng thời điểm (thundering herd / retry storm). Sử dụng random jitter (10–50ms + random offset) để phân tán các retry, giảm số lần conflict thực tế.

### 3. Chọn Optimistic Locking thay vì Pessimistic Lock / Redis Distributed Lock

- Write contention per-row thấp trong steady state (khách hàng thường mua sản phẩm khác nhau).
- Critical section cực ngắn (1 lệnh UPDATE).
- Pessimistic lock (`SELECT ... FOR UPDATE`) giữ row lock, block các request khác — overhead không đáng cho use-case này.
- Risk duy nhất: hot item (flash-sale) có contention cao → mitigated bằng jitter retry (max 3 lần).

## Lý do (Rationale)
1. **Phân loại đúng lỗi = Client thông minh hơn:** Client nhận 422 biết là hết hàng → hiển thị "Hết hàng" ngay. Client nhận 409 biết là conflict tạm thời → có thể auto-retry.
2. **Jitter giảm conflict thực tế:** Pattern chuẩn trong các hệ thống flash-sale (Shopee, Tiki).
3. **Optimistic Locking phù hợp steady state:** Không cần overhead của distributed lock cho trường hợp thông thường.

## Hệ quả & Hạn chế (Consequences & Limitations)
- Trong trường hợp flash-sale cực đoan (hàng nghìn request/giây cho 1 variant), Optimistic Locking vẫn có thể gây nhiều retry. Nếu tương lai cần hỗ trợ flash-sale thực thụ, cân nhắc thêm lớp Redis atomic decrement (`DECRBY`) phía trước DB để giảm áp lực write.
- Cần implement `ExceptionFilter` cho 2 custom exception mới để trả về response format nhất quán.
