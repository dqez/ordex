export function generateOrderNumber(): string {
  const now = new Date();
  const date =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `ORD-${date}-${random}`;
}
