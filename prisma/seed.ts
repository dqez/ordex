import { PrismaClient, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateSku(
  categoryCode: string,
  productIndex: number,
  variantIndex: number,
): string {
  const catPart = categoryCode.slice(0, 3).toUpperCase();
  const prodPart = String(productIndex + 1).padStart(3, '0');
  const varPart = String(variantIndex + 1).padStart(2, '0');
  return `${catPart}-${prodPart}-${varPart}`;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const categories = [
  {
    name: 'Electronics',
    slug: 'electronics',
    icon: 'devices',
    description: 'Electronic devices and accessories',
    children: [
      { name: 'Smartphones', slug: 'smartphones', icon: 'smartphone' },
      { name: 'Laptops', slug: 'laptops', icon: 'laptop' },
      {
        name: 'Accessories',
        slug: 'electronics-accessories',
        icon: 'headphones',
      },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    icon: 'shirt',
    description: 'Clothing and fashion items',
    children: [
      { name: "Men's Clothing", slug: 'mens-clothing', icon: 'shirt' },
      { name: "Women's Clothing", slug: 'womens-clothing', icon: 'shirt' },
      { name: 'Shoes', slug: 'shoes', icon: 'footprints' },
    ],
  },
  {
    name: 'Home & Living',
    slug: 'home-living',
    icon: 'home',
    description: 'Home decor and furniture',
    children: [
      { name: 'Furniture', slug: 'furniture', icon: 'sofa' },
      { name: 'Kitchenware', slug: 'kitchenware', icon: 'utensils' },
      { name: 'Decor', slug: 'home-decor', icon: 'lamp' },
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    icon: 'sparkles',
    description: 'Beauty and personal care products',
    children: [
      { name: 'Skincare', slug: 'skincare', icon: 'droplet' },
      { name: 'Makeup', slug: 'makeup', icon: 'palette' },
    ],
  },
  {
    name: 'Sports',
    slug: 'sports',
    icon: 'dumbbell',
    description: 'Sports equipment and gear',
    children: [
      { name: 'Fitness', slug: 'fitness', icon: 'dumbbell' },
      { name: 'Outdoor', slug: 'outdoor', icon: 'tent' },
      { name: 'Team Sports', slug: 'team-sports', icon: 'trophy' },
    ],
  },
];

const productTemplates: Record<
  string,
  Array<{
    name: string;
    description: string;
    basePrice: number;
    variants: Array<{
      name: string;
      skuSuffix: string;
      priceOffset: number;
      attributes: Record<string, string>;
    }>;
  }>
> = {
  Electronics: [
    {
      name: 'Premium Wireless Headphones',
      description: 'High-quality wireless headphones with noise cancellation',
      basePrice: 299000,
      variants: [
        {
          name: 'Black',
          skuSuffix: 'BLK',
          priceOffset: 0,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          skuSuffix: 'WHT',
          priceOffset: 0,
          attributes: { color: 'White' },
        },
        {
          name: 'Silver',
          skuSuffix: 'SLV',
          priceOffset: 50000,
          attributes: { color: 'Silver' },
        },
      ],
    },
    {
      name: 'Smart Watch Pro',
      description: 'Advanced smartwatch with health monitoring',
      basePrice: 599000,
      variants: [
        {
          name: '40mm',
          skuSuffix: '40',
          priceOffset: 0,
          attributes: { size: '40mm' },
        },
        {
          name: '44mm',
          skuSuffix: '44',
          priceOffset: 50000,
          attributes: { size: '44mm' },
        },
      ],
    },
    {
      name: 'USB-C Fast Charger',
      description: '65W fast charging adapter with USB-C cable',
      basePrice: 89000,
      variants: [
        {
          name: 'Single Port',
          skuSuffix: 'SNG',
          priceOffset: 0,
          attributes: { ports: '1' },
        },
        {
          name: 'Dual Port',
          skuSuffix: 'DLB',
          priceOffset: 30000,
          attributes: { ports: '2' },
        },
      ],
    },
  ],
  Fashion: [
    {
      name: 'Classic Cotton T-Shirt',
      description: 'Comfortable 100% cotton t-shirt',
      basePrice: 199000,
      variants: [
        {
          name: 'Small',
          skuSuffix: 'S',
          priceOffset: 0,
          attributes: { size: 'S' },
        },
        {
          name: 'Medium',
          skuSuffix: 'M',
          priceOffset: 0,
          attributes: { size: 'M' },
        },
        {
          name: 'Large',
          skuSuffix: 'L',
          priceOffset: 0,
          attributes: { size: 'L' },
        },
        {
          name: 'XL',
          skuSuffix: 'XL',
          priceOffset: 0,
          attributes: { size: 'XL' },
        },
      ],
    },
    {
      name: 'Slim Fit Jeans',
      description: 'Modern slim fit denim jeans',
      basePrice: 449000,
      variants: [
        {
          name: '29x30',
          skuSuffix: '2930',
          priceOffset: 0,
          attributes: { waist: '29', length: '30' },
        },
        {
          name: '32x32',
          skuSuffix: '3232',
          priceOffset: 0,
          attributes: { waist: '32', length: '32' },
        },
        {
          name: '34x34',
          skuSuffix: '3434',
          priceOffset: 20000,
          attributes: { waist: '34', length: '34' },
        },
      ],
    },
    {
      name: 'Running Sneakers',
      description: 'Lightweight running shoes with cushioned sole',
      basePrice: 699000,
      variants: [
        {
          name: 'US 8',
          skuSuffix: '08',
          priceOffset: 0,
          attributes: { size: '8' },
        },
        {
          name: 'US 9',
          skuSuffix: '09',
          priceOffset: 0,
          attributes: { size: '9' },
        },
        {
          name: 'US 10',
          skuSuffix: '10',
          priceOffset: 0,
          attributes: { size: '10' },
        },
      ],
    },
  ],
  'Home & Living': [
    {
      name: 'Ceramic Dinner Set',
      description: '12-piece ceramic dinner set for 4 people',
      basePrice: 899000,
      variants: [
        {
          name: 'White',
          skuSuffix: 'WHT',
          priceOffset: 0,
          attributes: { color: 'White' },
        },
        {
          name: 'Blue',
          skuSuffix: 'BLU',
          priceOffset: 0,
          attributes: { color: 'Blue' },
        },
      ],
    },
    {
      name: 'LED Desk Lamp',
      description: 'Adjustable LED lamp with multiple brightness levels',
      basePrice: 349000,
      variants: [
        {
          name: 'Black',
          skuSuffix: 'BLK',
          priceOffset: 0,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          skuSuffix: 'WHT',
          priceOffset: 0,
          attributes: { color: 'White' },
        },
      ],
    },
    {
      name: 'Memory Foam Pillow',
      description: 'Ergonomic memory foam pillow for better sleep',
      basePrice: 299000,
      variants: [
        {
          name: 'Standard',
          skuSuffix: 'STD',
          priceOffset: 0,
          attributes: { size: 'Standard' },
        },
        {
          name: 'King',
          skuSuffix: 'KNG',
          priceOffset: 100000,
          attributes: { size: 'King' },
        },
      ],
    },
  ],
  Beauty: [
    {
      name: 'Vitamin C Serum',
      description: 'Brightening vitamin C facial serum 30ml',
      basePrice: 259000,
      variants: [
        {
          name: '30ml',
          skuSuffix: '30',
          priceOffset: 0,
          attributes: { volume: '30ml' },
        },
        {
          name: '50ml',
          skuSuffix: '50',
          priceOffset: 80000,
          attributes: { volume: '50ml' },
        },
      ],
    },
    {
      name: 'Moisturizing Cream',
      description: 'Daily hydrating moisturizer for all skin types',
      basePrice: 189000,
      variants: [
        {
          name: '50ml',
          skuSuffix: '50',
          priceOffset: 0,
          attributes: { volume: '50ml' },
        },
        {
          name: '100ml',
          skuSuffix: '100',
          priceOffset: 90000,
          attributes: { volume: '100ml' },
        },
      ],
    },
    {
      name: 'Sunscreen SPF 50',
      description: 'Water-resistant sunscreen for face and body',
      basePrice: 159000,
      variants: [
        {
          name: '50ml',
          skuSuffix: '50',
          priceOffset: 0,
          attributes: { volume: '50ml' },
        },
        {
          name: '100ml',
          skuSuffix: '100',
          priceOffset: 60000,
          attributes: { volume: '100ml' },
        },
      ],
    },
  ],
  Sports: [
    {
      name: 'Adjustable Dumbbell Set',
      description: '5-25kg adjustable dumbbell pair',
      basePrice: 1299000,
      variants: [
        {
          name: '5-15kg',
          skuSuffix: '515',
          priceOffset: 0,
          attributes: { weight: '5-15kg' },
        },
        {
          name: '5-25kg',
          skuSuffix: '525',
          priceOffset: 200000,
          attributes: { weight: '5-25kg' },
        },
      ],
    },
    {
      name: 'Yoga Mat Premium',
      description: 'Non-slip 6mm thick yoga mat',
      basePrice: 399000,
      variants: [
        {
          name: 'Purple',
          skuSuffix: 'PUR',
          priceOffset: 0,
          attributes: { color: 'Purple' },
        },
        {
          name: 'Blue',
          skuSuffix: 'BLU',
          priceOffset: 0,
          attributes: { color: 'Blue' },
        },
        {
          name: 'Pink',
          skuSuffix: 'PNK',
          priceOffset: 0,
          attributes: { color: 'Pink' },
        },
      ],
    },
    {
      name: 'Resistance Bands Set',
      description: 'Set of 5 resistance bands with different tensions',
      basePrice: 199000,
      variants: [
        {
          name: 'Light',
          skuSuffix: 'LIT',
          priceOffset: 0,
          attributes: { tension: 'Light' },
        },
        {
          name: 'Medium',
          skuSuffix: 'MED',
          priceOffset: 0,
          attributes: { tension: 'Medium' },
        },
        {
          name: 'Heavy',
          skuSuffix: 'HVY',
          priceOffset: 0,
          attributes: { tension: 'Heavy' },
        },
      ],
    },
  ],
};

const imageUrls = [
  'https://picsum.photos/seed/{seed}/800/800',
  'https://picsum.photos/seed/{seed}/800/801',
  'https://picsum.photos/seed/{seed}/800/802',
  'https://picsum.photos/seed/{seed}/800/803',
];

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data in proper order
  console.log('🧹 Clearing existing data...');
  await prisma.inventory.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  // Create a default seller user
  const seller = await prisma.user.upsert({
    where: { email: 'seller@ordex.local' },
    update: {},
    create: {
      email: 'seller@ordex.local',
      passwordHash: '$2b$10$dummyhashforseed',
      fullName: 'Ordex Seller',
      role: 'SELLER',
      isVerified: true,
      isActive: true,
    },
  });

  console.log('✅ Data cleared');

  // Create categories
  console.log('📁 Creating categories...');
  for (const cat of categories) {
    const created = await prisma.category.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        isActive: true,
      },
    });
    console.log(`  ✅ Category: ${cat.name} (${created.id})`);

    // Create subcategories
    for (const child of cat.children) {
      const childCreated = await prisma.category.create({
        data: {
          name: child.name,
          slug: child.slug,
          description: `${child.name} products`,
          isActive: true,
          parentId: created.id,
        },
      });
      console.log(`    ✅ Subcategory: ${child.name} (${childCreated.id})`);
    }
  }

  // Get all leaf categories (subcategories)
  const leafCategories = await prisma.category.findMany({
    where: { parentId: { not: null } },
  });

  // Create products for each category
  console.log('\n📦 Creating products...');
  let globalProductIndex = 0;

  for (const category of leafCategories) {
    const catName =
      categories.find((c) => c.children.some((ch) => ch.slug === category.slug))
        ?.name ?? category.name;
    const templates =
      productTemplates[catName] ??
      productTemplates[Object.keys(productTemplates)[0]]!;

    for (
      let productIndex = 0;
      productIndex < templates.length;
      productIndex++
    ) {
      const template = templates[productIndex];
      globalProductIndex++;

      const product = await prisma.product.create({
        data: {
          name: template.name,
          slug: slugify(template.name) + '-' + globalProductIndex,
          description: template.description,
          basePrice: new Prisma.Decimal(template.basePrice),
          categoryId: category.id,
          sellerId: seller.id,
          status: 'ACTIVE',
        },
      });
      console.log(`  ✅ Product: ${template.name} (${product.id})`);

      // Create variants
      for (
        let variantIndex = 0;
        variantIndex < template.variants.length;
        variantIndex++
      ) {
        const variantTemplate = template.variants[variantIndex];
        const sku = generateSku(
          category.slug,
          globalProductIndex,
          variantIndex,
        );
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: sku,
            name: variantTemplate.name,
            price: new Prisma.Decimal(
              template.basePrice + variantTemplate.priceOffset,
            ),
            attributes: variantTemplate.attributes,
            isActive: true,
          },
        });

        // Create inventory for variant
        await prisma.inventory.create({
          data: {
            variantId: variant.id,
            quantity: randomInt(10, 100),
            reserved: randomInt(0, 10),
            lowStockThreshold: 10,
            version: 0,
          },
        });
        console.log(`    ✅ Variant: ${variantTemplate.name} (${variant.id})`);

        // Create images for product
        const numImages = randomInt(2, 4);
        for (let imgIndex = 0; imgIndex < numImages; imgIndex++) {
          const seed = `${product.id}-${imgIndex}`;
          await prisma.productImage.create({
            data: {
              productId: product.id,
              url: imageUrls[imgIndex % imageUrls.length].replace(
                '{seed}',
                seed,
              ),
              sortOrder: imgIndex,
              isPrimary: imgIndex === 0,
            },
          });
        }
      }
    }
  }

  console.log('\n✅ Seed complete!');
  console.log(
    `   Categories: ${categories.length} root + ${categories.reduce((acc, c) => acc + c.children.length, 0)} subcategories`,
  );
  console.log(`   Products: ${globalProductIndex}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
