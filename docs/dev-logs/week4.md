# Development Log - Week 4: Inventory Module & Optimistic Locking

> **Mục tiêu:** Xây dựng module Inventory cốt lõi. Triển khai cơ chế Optimistic Locking để xử lý bài toán concurrency (Race Condition) khi nhiều khách hàng cùng giành mua một sản phẩm có giới hạn tồn kho. Xây dựng chiến lược cảnh báo Low Stock.
> **Trạng thái:** ✅ HOÀN THÀNH

## 1. Hành động đã thực hiện

### 1.1 Architecture Decision Records (ADRs)

- **ADR 004: Stock Reservation Error Handling**:
  - Phân tách rõ ràng hai loại lỗi khi trừ kho:
    - `409 Conflict`: Technical conflict do `version` DB thay đổi khi có nhiều request đồng thời. Có thể retry ở tầng application.
    - `422 Unprocessable Entity`: Business rule conflict khi kho thật sự hết hàng (`available < requested`). Không thể retry.
- **ADR 005: Low Stock Alert Strategy**:
  - Chốt phương pháp Hybrid: Kết hợp Event-driven (detect ngay khoảnh khắc tồn kho vạch qua ngưỡng threshold) để gửi alert real-time và Cron job chạy lúc nửa đêm để đối soát (reconciliation) như một safety net.

### 1.2 Custom Exceptions & Error Handling

- **Tạo Custom Exceptions**:
  - `InsufficientStockException` (422) mang theo payload `variantId` và số lượng `available` thực tế.
  - `StockReservationConflictException` (409) mang theo payload `variantId`.
- **Cập nhật Exception Filter**:
  - Cập nhật `AllExceptionFilter` để nó có thể trích xuất thuộc tính `code` từ custom exception, giúp trả về JSON response thống nhất (`INSUFFICIENT_STOCK`, `STOCK_CONFLICT`) thay vì gộp chung vào `HTTP_ERROR`.

### 1.3 Inventory Service & Optimistic Locking

- **Thuật toán Reserve Stock**:
  - Read: Tìm `current` inventory để lấy `quantity`, `reserved`, và `version`.
  - Validate: Nếu `quantity - reserved < requested`, quăng lỗi `422 InsufficientStockException`.
  - Update (Optimistic Locking): Dùng `Prisma.$executeRaw` để thực thi SQL Update. Tăng `reserved = reserved + qty`, tăng `version = version + 1`, kèm điều kiện `WHERE version = ${current.version}`.
  - Xử lý kết quả: Kiểm tra `affected rows`. Nếu bằng `0` nghĩa là có transaction khác đã chen vào sửa version → Gọi đệ quy để retry.
- **Jitter Backoff Retry**:
  - Implement hàm `jitterBackoff(attempt)` sinh ra độ trễ ngẫu nhiên (`base + Math.random() * base`) thay vì fixed delay, giúp hệ thống tránh bị "Thundering Herd" (hàng loạt request retry cùng 1 mili-giây). Giới hạn `MAX_RETRY = 3`.

### 1.4 Test Concurrency (Stress Test Cục Bộ)

- Cập nhật `test-concurrency.mjs` để test các scenario tranh chấp thật sự:
  - Bắn đồng thời 5 request (bằng `Promise.all`), tranh nhau 2 slot tồn kho.
  - Kết quả hoàn hảo: Chính xác 2 request thành công (201 OK), 3 request báo hết hàng (422), và thỉnh thoảng có log retry (version conflict) nhưng không xảy ra lỗi 409 văng ra ngoài, cũng không bị âm kho hay overselling.

---

## 2. Kiến thức kỹ thuật cốt lõi (Deep Dive)

### 2.1 Optimistic Locking vs Pessimistic Locking

- **Pessimistic Locking (Khóa bi quan - FOR UPDATE)**:
  - Khóa hẳn row trong DB. Bất kỳ request nào khác muốn đọc/ghi row này đều phải đợi đến khi transaction hiện tại commit.
  - Ưu điểm: Đảm bảo tuyệt đối không có conflict.
  - Nhược điểm: Dễ gây "nút thắt cổ chai" (bottleneck), giảm thông lượng (throughput) của hệ thống e-commerce khi có Flash Sale.
- **Optimistic Locking (Khóa lạc quan)**:
  - Không khóa row. Cho phép đọc bình thường. Khi update mới kiểm tra xem `version` có còn như lúc đọc không.
  - Ưu điểm: Tốc độ cực nhanh, throughput cao cho read-heavy system. Phù hợp vì xác suất 2 người cùng tranh 1 cái áo lúc nửa đêm là rất thấp.
  - Nhược điểm: Phải tự code logic retry ở application layer khi bắt được conflict.

### 2.2 Full Jitter trong Retry Pattern

Khi có conflict, nếu tất cả các request cùng retry sau đúng 50ms, chúng sẽ lại đâm sầm vào nhau một lần nữa (gọi là Thundering Herd - đàn bò tót).
Thuật toán Full Jitter (của AWS) thêm tính ngẫu nhiên vào thời gian chờ:

```typescript
const base = 10 * Math.pow(2, attempt); // Exponential backoff: 10, 20, 40...
return base + Math.random() * base; // Thêm random: 10-20ms, 20-40ms...
```

Nhờ vậy, các request sẽ được "rải đều" ra các thời điểm khác nhau, giảm thiểu tỉ lệ va chạm trong lần retry tiếp theo.

### 2.3 Phân tách "Kho vật lý" (Quantity) và "Kho đang giữ" (Reserved)

Một sai lầm rất phổ biến của Junior là chỉ dùng 1 field `stock` và trừ thẳng đi khi user click Đặt Hàng.

- Nếu trừ thẳng: User hủy đơn hoặc không thanh toán -> Lại phải cộng lại. Kho bị "nhấp nháy".
- Cách đúng (như đang dùng):
  - `quantity`: Số lượng thật sự nằm trong nhà kho. Chỉ giảm khi đơn hàng đã đóng gói giao đi.
  - `reserved`: Số lượng đang được giữ chộp cho các đơn hàng "Pending Payment".
  - `available = quantity - reserved`: Số lượng hiển thị trên web cho khách mua.

---

## 3. Bài học xương máu (Bugs & Cạm bẫy)

> _"Logic business đôi khi không sai ở câu lệnh if-else, mà sai ở chính định nghĩa của các biến trong đầu chúng ta."_

### 3.1 Cạm bẫy "Double-Counting" (Trừ lặp 2 lần)

**Bối cảnh:** Khi viết câu lệnh raw SQL để cập nhật tồn kho trong `reserveSingleItem`, tôi đã viết:

```sql
UPDATE inventory
SET quantity = quantity - ${qty},   -- LỖI TẠI ĐÂY
    reserved = reserved + ${qty},
    version = version + 1
...
```

**Hệ quả:** Vì `available = quantity - reserved`, việc tôi vừa giảm `quantity` xuống 10, lại vừa tăng `reserved` lên 10 khiến cho `available` tụt đi hẳn... 20 đơn vị! Kết quả là DB hiển thị `available = -10` (âm kho ảo).
**Bài học:** Nhầm lẫn về Semantics. Việc "giữ chỗ" (reserve) chỉ được phép thay đổi cột `reserved`. Việc xuất kho (fulfill) mới được đụng tới `quantity`. Đã fix lại bằng cách bỏ dòng update `quantity`.

### 3.2 "Vô tình bị chặn cửa" bởi Rate Limiter

**Bối cảnh:** Khi chạy test script bắn 5 request đồng thời bằng Promise.all, thay vì nhận được 201 hoặc 409 từ Inventory, console lại in ra hàng loạt lỗi `429 Too Many Requests`.
**Nguyên nhân:** Quên mất rằng ở Week 2, hệ thống đã cài đặt `ThrottlerGuard` với giới hạn siêu ngặt nghèo: `limit: 3` request mỗi 1 giây (1000ms). Bắn 5 request cùng lúc thì 2 request auto bị block ngay ở cổng.
**Bài học:** Rate Limiter đang làm rất tốt nhiệm vụ của nó. Khi test tải trọng ở tầng DB, phải tính đến các firewall bên ngoài.
**Giải pháp:** Tạm thời nâng `limit` trong `app.module.ts` lên `20` để bypass guard trong lúc test, sau đó revert lại cấu hình chuẩn. `@SkipThrottle()` ở Controller không có tác dụng trong trường hợp này vì Redis Storage xử lý state trước khi guard đánh giá decorator.

### 3.3 Đọc kết quả HTTP Status Code

Ban đầu, kết quả test trả về 1 lỗi `409 Conflict`. Cứ ngỡ là lỗi code.
Sau khi phân tích kĩ logs: R1, R2, R3 update version thành công. R4 bị kẹt, thử đọc version cũ, bị miss 3 lần liên tiếp, hết `MAX_RETRY` nên văng 409.
Đây là **Hành vi đúng**. 409 chứng tỏ DB không bao giờ bị khóa sai lệch. Module Order (Week 5) sẽ nhận 409 này và retry toàn bộ luồng checkout ở tầng cao hơn.
