const SKU_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALPHANUM_REGEX = /^[A-Z0-9-]+$/;
const AMBIGUOUS_REGEX = /[0O1LI]/;

function randomChars(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += SKU_CHARS[Math.floor(Math.random() * SKU_CHARS.length)];
  }
  return result;
}

export function generateSku(): string {
  return `ORD-${randomChars(8)}`;
}

export function generateSkuForVariant(
  productId: string,
  variantIndex: number,
): string {
  const prefix = productId.replace(/-/g, '').substring(0, 8).toUpperCase();
  const paddedIndex = variantIndex.toString().padStart(3, '0');
  return `ORD-${prefix}-${paddedIndex}`;
}
