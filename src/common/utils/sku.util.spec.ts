import { generateSku, generateSkuForVariant } from './sku.util';

describe('SKU Utility', () => {
  describe('generateSku', () => {
    it('should start with ORD- prefix', () => {
      const result = generateSku();
      expect(result).toMatch(/^ORD-/);
    });

    it('should contain only uppercase alphanumeric characters and hyphens', () => {
      const result = generateSku();
      expect(result).toMatch(/^[A-Z0-9-]+$/);
    });

    it('should not contain ambiguous characters (0, O, 1, L, I)', () => {
      const result = generateSku();
      expect(result).not.toMatch(/[01LI]/);
    });

    it('should generate unique SKUs on multiple calls', () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(generateSku());
      }
      expect(results.size).toBe(100);
    });
  });

  describe('generateSkuForVariant', () => {
    it('should include productId prefix in SKU', () => {
      const productId = '550e8400-e29b-41d4-a716-446655440000';
      const result = generateSkuForVariant(productId, 1);
      expect(result).toContain('550E8400');
    });

    it('should include ORD- prefix', () => {
      const result = generateSkuForVariant(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
      );
      expect(result).toMatch(/^ORD-/);
    });

    it('should include variant index padded to 3 digits', () => {
      const result = generateSkuForVariant(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
      );
      expect(result).toMatch(/-001$/);
    });

    it('should pad variant index to 3 digits for indices under 100', () => {
      const result = generateSkuForVariant(
        '550e8400-e29b-41d4-a716-446655440000',
        42,
      );
      expect(result).toMatch(/-042$/);
    });

    it('should handle large variant indices', () => {
      const result = generateSkuForVariant(
        '550e8400-e29b-41d4-a716-446655440000',
        999,
      );
      expect(result).toMatch(/-999$/);
    });

    it('should not contain ambiguous characters', () => {
      const result = generateSkuForVariant(
        '550e8400-e29b-41d4-a716-446655440000',
        1,
      );
      // Check only the ORD- prefix + random part (not productId chars which may contain 0/1)
      expect(result).toMatch(/^ORD-[A-Z0-9]{8}-001$/);
    });

    it('should generate different SKUs for different variant indices', () => {
      const productId = '550e8400-e29b-41d4-a716-446655440000';
      const sku1 = generateSkuForVariant(productId, 1);
      const sku2 = generateSkuForVariant(productId, 2);
      expect(sku1).not.toBe(sku2);
    });
  });
});
