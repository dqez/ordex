# ADR 002: Refresh Token Rotation và Xử lý Token Reuse

**Ngày:** 2026-06-25 (Week 2)
**Trạng thái:** Đã chốt (Accepted)

## Bối cảnh (Context)
Để bảo mật hệ thống Authentication, chúng ta sử dụng cơ chế Access Token (sống ngắn hạn - 15 phút) và Refresh Token (sống dài hạn - 7 ngày). Khi Access Token hết hạn, client dùng Refresh Token để xin cấp lại cặp token mới. Tuy nhiên, nếu Refresh Token bị Hacker đánh cắp, Hacker có thể duy trì quyền truy cập mãi mãi.

## Quyết định (Decision)
Áp dụng cơ chế **Refresh Token Rotation** kết hợp với **Family ID Reuse Detection**:
1. **Rotation:** Mỗi khi Refresh Token được dùng để cấp token mới, Refresh Token cũ đó sẽ bị đánh dấu là `is_revoked = true` (thu hồi) và một Refresh Token mới toanh được sinh ra.
2. **Family ID:** Tất cả các Refresh Token được sinh ra từ cùng một phiên đăng nhập (cùng một thiết bị) sẽ chia sẻ chung một chuỗi `family_id` (UUID).
3. **Reuse Detection (Phát hiện dùng lại):** Nếu một Refresh Token **đã bị revoked** mà vẫn tiếp tục bị đem ra gửi lên API xin token mới, hệ thống sẽ coi đây là dấu hiệu bị đánh cắp (Token Leak). Hệ thống sẽ lập tức **Revoke toàn bộ** các token có cùng `family_id` đó, ép User phải đăng nhập lại bằng mật khẩu.

## Lý do (Rationale)
1. Giảm thiểu "cửa sổ thời gian" Hacker có thể sử dụng token bị cắp (Hacker dùng thì User văng ra, hoặc User dùng thì Hacker văng ra và bị lộ).
2. Bảo vệ được User ở mức độ cao nhất mà không cần phải xây dựng một hệ thống Redis quản lý Session quá đắt đỏ và nặng nề ngay từ Phase 1.

## Hệ quả & Hạn chế (Consequences & Limitations)
- Database sẽ chứa rất nhiều Refresh Token (nhiều bản ghi rác bị revoked). Cần thiết lập một CronJob dọn dẹp các token đã revoked hoặc đã hết hạn định kỳ.
- Nếu User có mạng lag (gửi 2 request refresh token cùng lúc), có rủi ro bị nhận diện nhầm là Hacker. Cần xử lý debounce ở Frontend cẩn thận.
