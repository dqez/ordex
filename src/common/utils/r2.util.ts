import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function validateFileType(mimetype: string): void {
  if (!ALLOWED_TYPES.includes(mimetype)) {
    throw new Error('Invalid file type');
  }
}

export function validateFileSize(size: number): void {
  if (size === 0 || size > MAX_SIZE) {
    throw new Error('File size exceeds 5MB');
  }
}

function getR2Config() {
  return {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? '',
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
  };
}

function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimetype] ?? 'bin';
}

async function uploadToR2(
  buffer: Buffer,
  key: string,
  mimetype: string,
): Promise<string> {
  const { accountId, bucketName, publicUrl } = getR2Config();

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': mimetype,
      'x-amz-acl': 'public-read',
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.statusText}`);
  }

  return `${publicUrl.replace(/\/$/, '')}/${key}`;
}

export async function uploadFile(file: Express.Multer.File): Promise<string> {
  validateFileType(file.mimetype);
  validateFileSize(file.size);

  const ext = getExtension(file.mimetype);
  const key = `products/${uuidv4()}.${ext}`;

  return uploadToR2(file.buffer, key, file.mimetype);
}
