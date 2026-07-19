/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `carts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[variant_id]` on the table `inventory` will be added. If there are existing duplicate values, this will fail.
  - Made the column `family_id` on table `refresh_tokens` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "addresses" ALTER COLUMN "address_line" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "slug" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "description" SET DATA TYPE TEXT,
ALTER COLUMN "image_url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "product_images" ALTER COLUMN "url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "slug" SET DATA TYPE VARCHAR(280);

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variant_id_key" ON "inventory"("variant_id");
