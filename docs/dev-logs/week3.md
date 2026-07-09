# Development Log - Week 3: Product, Category & Inventory Foundations

> **Mục tiêu:** Xây dựng hệ thống quản lý Danh mục (Category) dạng nested tree và Sản phẩm (Product) kèm theo Biến thể (Variant) và số lượng tồn kho (Inventory).
> **Trạng thái:** Đang tiến hành (Hoàn thành Category CRUD, Product CRUD cơ bản, Phân quyền Seller vs Public).

## 1. Hành động đã thực hiện

### 1.1 Category Module (Admin Only)
- **Tạo DTOs:** 
  - `CreateCategoryDto`: Sử dụng `class-validator` để validate dữ liệu đầu vào (name, parentId, description, imageUrl, sortOrder, isActive).
  - `UpdateCategoryDto`: Dùng `PartialType` để kế thừa và biến các field thành optional.
- **Slug Generation:** Cài đặt package `slugify` để tự động tạo URL-friendly slug từ `name`. Bắt lỗi `ConflictException` nếu slug bị trùng.
- **Service Logic:**
  - `create`: Kiểm tra parent category tồn tại trước khi tạo mới.
  - `findAll`: Lấy danh sách flat từ DB (dùng `findMany`) và chuyển đổi sang dạng nested tree (cha con lồng nhau).
  - `findOne`: Trả về chi tiết danh mục dựa trên `id` và yêu cầu danh mục đó phải đang `is_active: true` (sử dụng `findFirst` thay vì `findUnique` để linh hoạt query theo field không phải unique).
  - `update`: Hỗ trợ partial update. Tự động sinh lại slug nếu có cập nhật tên và kiểm tra trùng lặp.
  - `remove`: Bắt lỗi không cho phép xóa danh mục nếu đang có chứa danh mục con bên trong (chống orphan data).
- **Phân quyền Controller:**
  - `GET` (danh sách, chi tiết) được đánh dấu `@Public()` cho khách hàng tự do truy cập.
  - `POST`, `PATCH`, `DELETE` được bảo vệ bởi `@Roles('admin')`.

### 1.2 Product Module & Variants (Seller)
- **Thiết kế DTO (Nested Validation):**
  - Khai báo `CreateVariantDto` lồng bên trong `CreateProductDto`.
  - Sử dụng `@ValidateNested({ each: true })` và `@Type(() => CreateVariantDto)` từ `class-transformer` để đảm bảo body API mảng variants được validate chính xác.
- **Prisma Transactions:** 
  - Trong hàm `create`, việc tạo Product, tạo Product Variants và khởi tạo mốc Inventory đầu tiên phải đi liền với nhau thành một khối. 
  - Dùng `this.prisma.$transaction(async (tx) => { ... })` để đảm bảo ACID (tất cả cùng thành công hoặc cùng rollback).
- **Soft Delete:**
  - `remove`: Không xóa vật lý dữ liệu khỏi bảng (`delete`), thay vào đó set `is_deleted = true` và lưu vết `deleted_at`.
- **Bảo mật Ownership:**
  - `update` & `remove`: Bắt buộc kiểm tra `seller_id === req.user.id`. Seller này không được phép sửa/xóa sản phẩm của Seller khác (`ForbiddenException`).

### 1.3 Kiến trúc luồng hiển thị (Storefront vs Seller Center)
- **Storefront (Khách hàng):** 
  - Endpoint `GET /products` (Public). 
  - Chỉ query những sản phẩm có trạng thái là `active` và `is_deleted: false`.
- **Seller Center (Người bán):** 
  - Bổ sung endpoint riêng `GET /products/me` (Yêu cầu role `seller`).
  - Query tất cả sản phẩm của chính seller đó (`seller_id: user.id`), bao gồm cả `draft`, `active` và `archived`.
- **Cập nhật trạng thái:** 
  - Sản phẩm vừa tạo mặc định là `draft`. 
  - Cập nhật `UpdateProductDto` (dùng `OmitType` để loại bỏ thuộc tính variants) để cho phép Seller gửi lệnh PATCH chuyển trạng thái sang `active` khi đã sẵn sàng bán.

---

## 2. Kiến thức kỹ thuật cốt lõi (Deep Dive)

### 2.1 Hiểu rõ sự khác biệt giữa `null`, `undefined` và `unknown` trong TypeScript
Khi xử lý DTO (như API PATCH cho cập nhật một phần), việc phân biệt 3 kiểu này là cực kỳ quan trọng đối với Backend (đặc biệt khi chuyển từ các ngôn ngữ như C# sang).

| Khái niệm | null | undefined | unknown |
|---|---|---|---|
| **Định nghĩa** | Có chủ đích không có giá trị (Ví dụ: `avatar: null`) | Giá trị chưa được gán, không tồn tại | Tôi chưa biết kiểu dữ liệu là gì |
| **Bản chất** | Là một giá trị | Là một giá trị | Là một Kiểu Dữ Liệu (Type) |
| **Có trong JSON / DB?**| CÓ | KHÔNG | - |

**Tại sao ta check `if (dto.description !== undefined)` thay vì `if (dto.description)`?**
- Client gửi `{"description": ""}` -> `dto.description` là một string rỗng `""` (falsy).
- Nếu dùng `if (dto.description)`, câu điều kiện sẽ đánh giá là false -> **Bỏ qua không update**. Điều này là sai vì client thật sự muốn đổi mô tả thành rỗng.
- Dùng `if (dto.description !== undefined)` nghĩa là: Chỉ cần Client CÓ GỬI field này lên (kể cả rỗng, số 0, false, null), ta sẽ tiến hành update. Nếu Client KHÔNG GỬI (`undefined`), ta giữ nguyên dữ liệu cũ trong DB.

**Lợi ích của `unknown` so với `any`:**
- `any`: Bỏ qua hoàn toàn sự kiểm tra của TypeScript (tắt bảo vệ).
- `unknown`: Vẫn bắt buộc bạn phải "ép kiểu" hoặc dùng Type Guard (ví dụ: `typeof obj === "string"`) thì mới thao tác được với nó. An toàn hơn `any` rất nhiều.

### 2.2 Thuật toán chuyển đổi Flat Array sang Nested Tree
Trong `CategoryService`, để cấu trúc dữ liệu phẳng từ DB thành dạng cây cho giao diện (Adjacency List Model -> Tree Object Graph), thuật toán sử dụng `Map` là tối ưu nhất.

**Các bước hoạt động:**
1. Khởi tạo một `Map<string, Node>` để lưu trữ tất cả các category.
2. **Vòng lặp 1:** Đưa tất cả flat record vào Map, đồng thời gán thêm cho mỗi node một mảng `children: []` rỗng.
3. **Vòng lặp 2:** Lấy từng node trong Map. Kiểm tra xem nó có `parent_id` hay không?
   - CÓ: Tìm node cha trong Map (chỉ tốn `O(1)`) và `.push()` chính nó vào mảng `children` của cha.
   - KHÔNG: Đây là Root Node. Đưa nó vào mảng kết quả cuối cùng.

**Tại sao dùng `Map` mà không dùng `.find()` lồng nhau?**
- Nếu dùng `categories.find(c => c.id === cat.parent_id)`, thuật toán sẽ bị `O(n^2)` vì mỗi lần đi tìm cha đều phải duyệt lại toàn bộ mảng.
- Với `Map`, tra cứu chỉ tốn `O(1)`. Thuật toán sẽ tối ưu xuống `O(n)`. Rất cần thiết cho performance ở Backend.

### 2.3 Index Signature trong TypeScript (`[key: string]: unknown`)
Khi viết thuật toán Tree, ta muốn viết một hàm có thể dùng chung cho Category, Comment, Folder, Menu,... mà không bị phụ thuộc cứng vào cấu trúc cố định.

```typescript
private buildTree(categories: {
    id: string;
    parent_id: string | null;
    [key: string]: unknown;
}[])
```
- Nghĩa là: Object đầu vào **bắt buộc** phải có `id` và `parent_id`. Ngoài ra nó được phép có **thêm bất kỳ** thuộc tính nào khác (`name`, `slug`, `tags`,...) với key là chuỗi và value là `unknown`.
- Hiện nay, ở TypeScript hiện đại, cách tốt hơn để viết lại hàm này là sử dụng **Generic** để giữ được nguyên vẹn thông tin các trường mở rộng:
  ```typescript
  function buildTree<T extends { id: string; parent_id: string | null }>(categories: T[]) { ... }
  ```
