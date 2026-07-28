# ADR 008: Vị trí xóa giỏ hàng (Cart Deletion) trong luồng Checkout Đồng bộ

**Ngày:** 2026-07-28 (Week 6)
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Trong API `POST /orders/checkout`, chúng ta phải thực hiện 3 thao tác chính có tính thay đổi dữ liệu (mutation):
1. Đặt chỗ tồn kho (Reserve Stock).
2. Xóa giỏ hàng của User (`cartItem.deleteMany`).
3. Gọi API Stripe để tạo `PaymentIntent` (External Call).

Câu hỏi đặt ra là: Lệnh xóa giỏ hàng nên đặt **TRƯỚC** hay **SAU** khi gọi API Stripe?
- Nếu đặt **SAU**, giỏ hàng của User sẽ được bảo toàn nếu API Stripe gọi thất bại (UX tốt hơn).
- Tuy nhiên, hiện tại mã nguồn đang đặt lệnh xóa giỏ hàng **TRƯỚC** khi gọi API Stripe, chấp nhận việc User có thể bị mất giỏ hàng nếu Stripe lỗi.

## Quyết định (Decision)
**Giữ nguyên lệnh xóa giỏ hàng TRƯỚC khi gọi API Stripe.**
Chấp nhận sự suy giảm nhỏ về UX (người dùng bị mất giỏ hàng nếu thanh toán lỗi) để đổi lấy sự an toàn tuyệt đối về mặt nhất quán dữ liệu (Data Inconsistency) và tài chính.

## Phân tích (Rationale)
Vấn đề không nằm ở việc `deleteMany` có khả năng lỗi cao hay thấp, mà nằm ở **cái gì xảy ra khi nó lỗi, tùy thuộc vào việc nó đứng trước hay sau Stripe**.

1. **Nếu `deleteMany` lỗi TRƯỚC khi gọi Stripe (Vị trí hiện tại):**
   `createPayment` chưa từng chạy $\rightarrow$ chưa hề có PaymentIntent nào được tạo ở Stripe. Khối `catch` sẽ hoàn tác (release stock, cancel order). Toàn bộ state cục bộ và ở Stripe đều đồng nhất là "chưa có gì xảy ra". Hệ thống sạch sẽ, không có gì để dọn dẹp thêm.

2. **Nếu `deleteMany` lỗi SAU khi Stripe đã tạo PaymentIntent thành công (Dời xuống dưới):**
   Lỗi này vẫn nằm trong cùng khối `try` của API checkout, nên nó rơi vào `catch` hiện tại $\rightarrow$ `catch` này thực thi lệnh release stock và cancel order.
   **Hậu quả thảm họa (Fatal Consequences):**
   - **Local báo "cancelled", Stripe báo "có payment"**: Hai hệ thống lệch nhau, không có cơ chế tự đối soát (reconciliation) trong flow này.
   - **Risk Oversell**: Hàng (Stock) bị nhả ra và có thể bán cho khách khác, trong khi thực ra khách đầu tiên đã "trả tiền" (hoặc bị hold tiền) cho món hàng đó trên Stripe.
   - **Risk Double Charge**: Do toàn bộ luồng bị coi là Failed, Idempotency key bị xóa ở outer catch. Client tự động retry $\rightarrow$ Tạo ra Order thứ 2 và Payment thứ 2 cho cùng một giỏ hàng.
   - Để khắc phục hậu quả này, bắt buộc phải can thiệp thủ công (manual intervention): refund PaymentIntent mồ côi, đối soát lại order/stock, tốn kém nhân sự và ảnh hưởng nghiêm trọng đến uy tín (khách thấy "cancelled" nhưng thẻ vẫn bị trừ).

So với hậu quả khổng lồ trên, "mất giỏ hàng" chỉ là một cái giá rất rẻ: khách hàng chỉ việc thao tác lại để đưa hàng vào giỏ, không ai bị trừ tiền oan, không có dữ liệu nào bị lệch, hệ thống tự phục hồi ngay lập tức. Đây là một sự đánh đổi bất đối xứng (asymmetry): Một bên là UX friction vô hại, một bên là financial/inventory inconsistency đắt đỏ và khó dò (silent failure).

## Nguyên tắc cốt lõi rút ra
Bất kỳ operation nào chạy **sau** một external call không thể rollback (như việc charge tiền qua Stripe) đều **không được phép** rơi vào nhánh Exception chung (nhánh báo hiệu "toàn bộ checkout thất bại, release hết"). 
*(Ví dụ tham chiếu: Thao tác `idempotencyKey.update` ở Step 3 được đặt riêng trong một khối `try/catch` độc lập best-effort, chỉ log lỗi chứ không ném Exception làm hỏng toàn bộ flow đã thành công).*

## Hệ quả & Đánh đổi (Consequences)
**Tích cực:**
- Đảm bảo tính toàn vẹn dữ liệu tài chính (Financial Consistency) và Tồn kho.
- Hệ thống miễn nhiễm với các rủi ro lệch pha trạng thái thanh toán.

**Đánh đổi (Và hướng khắc phục trong tương lai nếu cần):**
- Trải nghiệm UX bị giảm sút nhẹ nếu Stripe bị lỗi mạng hoặc timeout.
- **Hướng khắc phục toàn diện (Tương lai):** Thay vì hard-delete giỏ hàng trong request checkout đồng bộ, hãy chuyển sang mô hình **Event-driven Cart Lifecycle**. Khi bắt đầu checkout, chỉ đánh dấu (lock/convert) giỏ hàng. Giỏ hàng chỉ thực sự bị xóa khi Webhook từ Stripe xác nhận `payment_intent.succeeded`. Nếu Stripe failed/timeout, unlock giỏ hàng trở lại. Cách này giải quyết dứt điểm bài toán "operation nào chạy trước/sau Stripe" vì vòng đời của giỏ hàng không còn phụ thuộc vào luồng HTTP request đồng bộ nữa.
