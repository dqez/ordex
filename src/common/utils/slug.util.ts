const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a',
  á: 'a',
  ả: 'a',
  ã: 'a',
  ạ: 'a',
  ă: 'a',
  ằ: 'a',
  ắ: 'a',
  ẳ: 'a',
  ẵ: 'a',
  ặ: 'a',
  â: 'a',
  ầ: 'a',
  ấ: 'a',
  ẩ: 'a',
  ẫ: 'a',
  ậ: 'a',
  đ: 'd',
  è: 'e',
  é: 'e',
  ẻ: 'e',
  ẽ: 'e',
  ẹ: 'e',
  ê: 'e',
  ề: 'e',
  ế: 'e',
  ể: 'e',
  ễ: 'e',
  ệ: 'e',
  ì: 'i',
  í: 'i',
  ỉ: 'i',
  ĩ: 'i',
  ị: 'i',
  ò: 'o',
  ó: 'o',
  ỏ: 'o',
  õ: 'o',
  ọ: 'o',
  ô: 'o',
  ồ: 'o',
  ố: 'o',
  ổ: 'o',
  ỗ: 'o',
  ộ: 'o',
  ơ: 'o',
  ờ: 'o',
  ớ: 'o',
  ở: 'o',
  ỡ: 'o',
  ợ: 'o',
  ù: 'u',
  ú: 'u',
  ủ: 'u',
  ũ: 'u',
  ụ: 'u',
  ư: 'u',
  ừ: 'u',
  ứ: 'u',
  ử: 'u',
  ữ: 'u',
  ự: 'u',
  ỳ: 'y',
  ý: 'y',
  ỷ: 'y',
  ỹ: 'y',
  ỵ: 'y',
};

function transliterate(str: string): string {
  return str.replace(/[^\x00-\x7F]/g, (char) => VIETNAMESE_MAP[char] ?? char);
}

const ALLOWED_REGEX = /[^a-z0-9\s-]/g;
const MULTIPLE_HYPHENS_REGEX = /-+/g;

function randomSuffix(length = 4): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function generateSlug(
  name: string,
  isUnique?: (slug: string) => Promise<boolean>,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const transliterated = transliterate(trimmed);
  let slug = transliterated
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(ALLOWED_REGEX, '')
    .replace(MULTIPLE_HYPHENS_REGEX, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) return '';

  if (isUnique) {
    const exists = await isUnique(slug);
    if (exists) {
      slug = `${slug}-${randomSuffix()}`;
    }
  }

  return slug;
}
