import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import slugify from 'slugify';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Bắt đầu seed data...');

  // 1. Tạo 2 User: admin và seller
  const passwordHash = await bcrypt.hash('Dinhquy10@', 10);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ordex.com' },
    update: {},
    create: {
      email: 'admin@ordex.com',
      password_hash: passwordHash,
      full_name: 'System Admin',
      role: 'admin',
      is_verified: true,
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: 'seller@ordex.com' },
    update: {},
    create: {
      email: 'seller@ordex.com',
      password_hash: passwordHash,
      full_name: 'Demo Seller',
      role: 'seller',
      is_verified: true,
    },
  });

  console.log('✅ Đã tạo Users (admin, seller)');

  // 2. Tạo Categories
  const catElectronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Thiết bị điện tử',
      is_active: true,
    },
  });

  const catLaptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: {
      name: 'Laptops',
      slug: 'laptops',
      parent_id: catElectronics.id,
      description: 'Máy tính xách tay',
      is_active: true,
    },
  });

  console.log('✅ Đã tạo Categories');

  // 3. Tạo Product mẫu kèm Variants và Inventory
  const productName = 'MacBook Pro M3 Max 2024';
  const productSlug = slugify(productName, { lower: true });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    update: {},
    create: {
      name: productName,
      slug: productSlug,
      description:
        'MacBook Pro 14-inch M3 Max chip with 14-core CPU, 30-core GPU',
      base_price: 3199.0,
      currency: 'USD',
      status: 'active',
      seller_id: seller.id,
      category_id: catLaptops.id,
      productVariants: {
        create: [
          {
            sku: 'MBP-M3M-14-36GB-1TB-SILVER',
            name: '14-inch, 36GB RAM, 1TB SSD, Silver',
            price: 3199.0,
            attributes: { color: 'Silver', ram: '36GB', ssd: '1TB' },
            inventory: {
              create: {
                quantity: 50,
                reserved: 0,
                low_stock_threshold: 5,
              },
            },
          },
          {
            sku: 'MBP-M3M-16-48GB-1TB-SPACEBLACK',
            name: '16-inch, 48GB RAM, 1TB SSD, Space Black',
            price: 3999.0,
            attributes: { color: 'Space Black', ram: '48GB', ssd: '1TB' },
            inventory: {
              create: {
                quantity: 20,
                reserved: 0,
                low_stock_threshold: 3,
              },
            },
          },
        ],
      },
    },
  });

  console.log('✅ Đã tạo Product & Inventory');
  console.log('🎉 Seeding hoàn tất!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
