import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private configService: ConfigService) {
    this.bucketName =
      this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');

    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      endpoint: this.configService.getOrThrow<string>('AWS_S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
    });

    try {
      await this.s3Client.send(command);

      const endpoint = this.configService.getOrThrow<string>('AWS_S3_ENDPOINT');
      return `${endpoint}/${this.bucketName}/${fileName}`;
    } catch (error) {
      this.logger.error(`Failed to upload file ${fileName}`, error);
      throw new Error('File upload failed');
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const endpoint = this.configService.getOrThrow<string>('AWS_S3_ENDPOINT');

      const cleanEndpoint = endpoint.endsWith('/')
        ? endpoint.slice(0, -1)
        : endpoint;
      const prefix = `${cleanEndpoint}/${this.bucketName}/`;

      if (!fileUrl.startsWith(prefix)) {
        this.logger.warn(`Cannot delete file, URL mismatch: ${fileUrl}`);
        return;
      }

      const key = fileUrl.substring(prefix.length);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Delete file from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${fileUrl}`, error);
      //Khong nem loi ra de trach lamf treo luong main delete
    }
  }
}
