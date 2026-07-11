import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class ImageService {
  async optimizeImage(
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const optimizedBuffer = await sharp(fileBuffer)
      .resize(1000, 1000, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    const fileNameWithoutExt = originalName.split('.').slice(0, -1).join('.');
    const newFileName = `${fileNameWithoutExt}-${Date.now()}.webp`;

    return {
      buffer: optimizedBuffer,
      fileName: newFileName,
      mimeType: 'image/webp',
    };
  }
}
