# ADR 003: Chiến lược Lọc Giá Sản Phẩm (Product Price Filtering)

**Ngày:** 2026-07-12
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Khi xây dựng tính năng lọc sản phẩm theo khoảng giá (`minPrice` và `maxPrice`), chúng ta phải đối mặt với hai lựa chọn: lọc dựa trên giá trị `base_price` của Sản phẩm (Product), hay lọc dựa trên giá của từng Biến thể (Product Variant) bên trong sản phẩm đó.

## Quyết định (Decision)
Trong Giai đoạn 1 (Phase 1 / MVP), API sẽ **chỉ lọc dựa trên `base_price`** của bảng `Product`.

## Lý do (Rationale)
1. **Tính nhất quán về Trải nghiệm (UX Consistency):** API `GET /products` hiện tại trả về `basePrice` làm đại diện cho sản phẩm để hiển thị lên thẻ sản phẩm (Product Card). Nếu ta lọc ngầm bên dưới bằng giá của biến thể, sẽ có trường hợp sản phẩm lọt vào danh sách kết quả, nhưng giá `basePrice` hiển thị trên màn hình lại nằm ngoài khoảng giá người dùng vừa chọn. Điều này gây khó hiểu và trải nghiệm tồi cho User.
2. **Sự Đơn Giản (Simplicity):** Việc query xuyên qua bảng Variant đòi hỏi phải sử dụng `JOIN` phức tạp hoặc subquery `EXISTS`, và phải ra quyết định xem "variant nào khớp thì lấy" (variant rẻ nhất? hay bất kỳ?). Điều này làm query nặng nề một cách không cần thiết, hoàn toàn phù hợp với tư tưởng của roadmap là "bỏ qua độ phức tạp của multi-unit variant trong Phase 1".

## Hệ quả & Hạn chế (Consequences & Limitations)
- Nếu seller cố tình tạo một biến thể có giá chênh lệch quá lớn so với `base_price`, bộ lọc giá có thể sẽ bỏ sót biến thể đó. 
- Đây là một giới hạn (limitation) có chủ ý để giữ MVP đơn giản, không phải là một bug (lỗi hệ thống).
