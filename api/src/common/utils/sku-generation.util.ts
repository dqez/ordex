import slugify from 'slugify';
import { JsonObject } from '../types/json.type';

export function generateSku(
  productName: string,
  attributes?: JsonObject,
): string {
  const base = slugify(productName, {
    replacement: '',
    lower: false,
    trim: true,
    strict: true,
  })
    .substring(0, 5)
    .toUpperCase();

  const attrs = attributes
    ? Object.values(attributes)
        .filter(
          (v) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean',
        )
        .map((v) =>
          slugify(String(v), {
            replacement: '',
            lower: false,
            trim: true,
            strict: true,
          })
            .substring(0, 3)
            .toUpperCase(),
        )
        .join('-')
    : '';

  const random = Math.floor(1000 + Math.random() * 9000);

  return [base, attrs, random].filter(Boolean).join('-');
}
