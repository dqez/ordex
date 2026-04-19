import { generateSlug } from './slug.util';

describe('Slug Utility', () => {
  describe('generateSlug', () => {
    it('should convert to lowercase', async () => {
      const result = await generateSlug('Hello World');
      expect(result).toMatch(/^hello-world/);
    });

    it('should replace spaces with hyphens', async () => {
      const result = await generateSlug('hello world test');
      expect(result).toContain('-');
      expect(result).not.toContain(' ');
    });

    it('should trim whitespace', async () => {
      const result = await generateSlug('  hello world  ');
      expect(result).toBe('hello-world');
    });

    it('should remove Vietnamese diacritics', async () => {
      const result = await generateSlug('Sản phẩm công nghệ');
      expect(result).not.toMatch(/[ăâđêôơư]/);
    });

    it('should remove special characters', async () => {
      const result = await generateSlug('Product!@#$%^&*()Name');
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });

    it('should handle single word', async () => {
      const result = await generateSlug('Product');
      expect(result).toBe('product');
    });

    it('should collapse multiple spaces to single hyphen', async () => {
      const result = await generateSlug('hello    world');
      expect(result).toBe('hello-world');
    });

    it('should handle numbers', async () => {
      const result = await generateSlug('iPhone 15 Pro Max');
      expect(result).toMatch(/^iphone-15-pro-max/);
    });

    it('should return empty string for whitespace-only input', async () => {
      const result = await generateSlug('   ');
      expect(result).toBe('');
    });

    it('should return empty string for empty input', async () => {
      const result = await generateSlug('');
      expect(result).toBe('');
    });

    it('should append random suffix for uniqueness when callback returns existing slug', async () => {
      const result = await generateSlug(
        'Existing Product',
        async (slug: string) => {
          return slug === 'existing-product';
        },
      );
      expect(result).toMatch(/^existing-product-[a-z0-9]{4}$/);
    });

    it('should not append suffix when slug is unique', async () => {
      const result = await generateSlug(
        'Unique Product Name',
        async () => false,
      );
      expect(result).toBe('unique-product-name');
    });

    it('should handle mixed Vietnamese and English', async () => {
      const result = await generateSlug('Máy tính Laptop gaming');
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });
  });
});
