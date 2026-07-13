# Development Log - Week 3: Product, Category & Inventory Foundations

> **Mục tiêu:** Xây dựng hệ thống quản lý Danh mục (Category) dạng nested tree và Sản phẩm (Product) kèm theo Biến thể (Variant), số lượng tồn kho (Inventory), và API lấy danh sách sản phẩm với đầy đủ Lọc/Phân trang/Sắp xếp.
> **Trạng thái:** ✅ HOÀN THÀNH

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

### 1.4 Product Image & Storage Module (MinIO)
- **Tách biệt Storage Module (Clean Architecture):** Thay vì viết chung logic xử lý file vào `ProductModule`, chúng ta đã tạo một `StorageModule` global độc lập.
  - `StorageService`: Chuyên giao tiếp với AWS S3 (và MinIO qua `forcePathStyle: true`).
  - `ImageService`: Sử dụng thư viện `sharp` để resize ảnh (1000x1000), nén 80% và chuyển về `.webp`. Tách riêng nghiệp vụ xử lý ảnh khỏi logic upload.
- **Tối ưu hóa Upload Concurrent:** Sử dụng `Promise.all` cùng `map` thay vì vòng lặp `for...of` để upload song song (concurrent) nhiều ảnh cùng lúc, tối đa hóa thông lượng mạng.
- **Xử lý File Input tại Boundary:** Sử dụng `ParseFilePipe` của NestJS ở Controller để chặn ngay các file sai định dạng hoặc vượt quá dung lượng (5MB) trước khi request chạm vào Service.

---

## 3. Bài học xương máu (Bugs & Cạm bẫy)

> *"Ai làm dev mà không một lần lỡ tay đè biến (shadow), gọi nhầm API S3 hay cãi nhau với TypeScript?"* - Dưới đây là những lỗi thực tế đã gặp và khắc phục trong tuần này.

### 3.1 Cạm bẫy Prisma Type Mismatch (JsonNull)
Khi dùng `Prisma.ProductVariantUpdateInput`, trình biên dịch đôi lúc báo lỗi đỏ chót liên quan đến `JsonNull` vs `JsonNullClass` do Prisma gen type đôi khi bị xung đột.
- **Giải pháp 1 (Tạm thời):** Fallback về `Record<string, unknown>` hoặc `any` để tắt Type-Safe.
- **Giải pháp 2 (Chuẩn 2026):** Không cần import Type Input từ Prisma. Sử dụng **Spread Syntax** `...(dto.name && { name: dto.name })` để tạo object update inline ngay trong tham số của hàm `this.prisma.xyz.update({ data: { ... } })`. Nhờ vậy TypeScript sẽ tự suy luận (Type Inference) chuẩn 100% mà code lại cực kỳ thanh lịch.

### 3.2 Lỗi "Unsafe member access" với Multer
Dù đã cài `@types/multer`, ESLint đôi khi vẫn la ó `Express.Multer.File` là kiểu không xác định (cannot be resolved).
- **Lý do:** TypeScript strict mode đôi khi cần "đánh thức" (load) các Global Namespace.
- **Giải pháp:** Cần thêm đúng 1 dòng `import 'multer';` lên đầu file để compiler nhận diện được Type định nghĩa của thư viện này. Cần đặc biệt lưu ý lỗi "shadowing variable" (đặt tên biến trong hàm map trùng với mảng bên ngoài).

### 3.3 Cạm bẫy "Idempotent" khi Xóa File trên S3/MinIO
Trong `StorageService.deleteFile`, ban đầu chúng ta chỉ lấy tên file `ten-anh.webp`. Khi gửi lên MinIO, S3 Key bị thiếu thư mục gốc `products/123/`.
- **Hệ quả:** MinIO không tìm thấy file để xóa nhưng cũng **KHÔNG báo lỗi** (vì S3 Delete API mang đặc tính Idempotent - nếu không tìm thấy file, nó vẫn coi như thao tác thành công và trả về HTTP 200). Rất dễ sinh ảo giác là file đã bị xóa.
- **Giải pháp:** Bóc tách chính xác S3 Key bằng cách `url.substring(prefix.length)` (cắt bỏ phần endpoint và bucketName) để lấy ra đúng đường dẫn tương đối trong bucket.

### 3.4 Hai cách dùng Prisma Transactions: Batch vs Interactive
Chúng ta đã sử dụng cả 2 loại Transaction của Prisma cho 2 tình huống khác nhau:
1. **Interactive Transaction (`async (tx) => {}`):**
   - Dùng khi tạo Product: Dùng để giữ một kết nối (connection) lâu dài thực thi các lệnh phụ thuộc lẫn nhau, hoặc mở đường cho logic phức tạp trong tương lai (vd: gửi Audit log lấy từ `product.id`). Lock DB lâu hơn.
2. **Batch Transaction (`[ query1, query2 ]`):**
   - Dùng khi Đổi Ảnh Primary (`updateMany` cho tất cả ảnh cũ thành false, và `update` 1 ảnh mới thành true).
   - Hai lệnh này không cần chờ kết quả (ID) của nhau. Đẩy thành mảng để Prisma gộp chung 1 round-trip gửi xuống DB giúp tốc độ thực thi nhanh chớp nhoáng.
