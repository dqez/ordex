# ADR 001: Snapshot Pattern cho Địa chỉ giao hàng của Đơn Hàng

**Ngày:** 2026-06-20 (Week 1)
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Trong quá trình thiết kế Database (`database-design.md`), chúng ta cần quyết định cách lưu trữ địa chỉ giao hàng (`shipping_address`) cho mỗi Đơn hàng (`Order`). Có hai phương án: 
1. Lưu một Foreign Key (`address_id`) trỏ về bảng `Address`.
2. Lưu toàn bộ thông tin địa chỉ dưới dạng một cục JSON (`Json` type) trực tiếp vào bảng `Order`.

## Quyết định (Decision)
Sử dụng **Snapshot Pattern**: Lưu cứng toàn bộ dữ liệu địa chỉ thành kiểu `Json` vào cột `shipping_address` của bảng `Order` tại thời điểm User chốt đơn.

## Lý do (Rationale)
1. **Tính Bất biến (Immutability):** Đơn hàng là một chứng từ lịch sử cần được bảo toàn tuyệt đối. Nếu ta dùng Foreign Key trỏ về bảng `Address`, khi User chuyển nhà và vào phần cài đặt sửa địa chỉ trong bảng `Address`, nó sẽ tự động làm thay đổi cả địa chỉ giao hàng của các đơn hàng đã giao thành công cách đây 3 năm. Điều này vi phạm nguyên tắc về lưu trữ hóa đơn.
2. **Hiệu suất (Performance):** Việc nhúng luôn JSON vào Order giúp khi query lịch sử đơn hàng không cần phải `JOIN` thêm với bảng `Address`, tăng tốc độ đọc.

## Hệ quả & Hạn chế (Consequences & Limitations)
- Dữ liệu bị phình to hơn một chút do lặp lại thông tin (Duplication). Tuy nhiên chi phí lưu trữ string là quá nhỏ so với lợi ích về mặt Data Integrity (toàn vẹn dữ liệu).
- Cột `shipping_address` không có Schema ràng buộc tĩnh bằng RDBMS, do đó API tạo đơn hàng (Checkout) phải có trách nhiệm Validate cực kỳ chặt chẽ (dùng DTO + class-validator) trước khi lưu vào JSON.
