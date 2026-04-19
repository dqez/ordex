import { uploadFile, validateFileType, validateFileSize } from './r2.util';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid-v4') }));

describe('R2 Upload Utility', () => {
  describe('validateFileType', () => {
    it('should accept image/jpeg', () => {
      expect(() => validateFileType('image/jpeg')).not.toThrow();
    });

    it('should accept image/png', () => {
      expect(() => validateFileType('image/png')).not.toThrow();
    });

    it('should accept image/webp', () => {
      expect(() => validateFileType('image/webp')).not.toThrow();
    });

    it('should accept image/gif', () => {
      expect(() => validateFileType('image/gif')).not.toThrow();
    });

    it('should reject application/pdf', () => {
      expect(() => validateFileType('application/pdf')).toThrow(
        'Invalid file type',
      );
    });

    it('should reject text/plain', () => {
      expect(() => validateFileType('text/plain')).toThrow('Invalid file type');
    });

    it('should reject executable files', () => {
      expect(() => validateFileType('application/x-executable')).toThrow(
        'Invalid file type',
      );
    });
  });

  describe('validateFileSize', () => {
    it('should accept file at 5MB limit', () => {
      const fiveMB = 5 * 1024 * 1024;
      expect(() => validateFileSize(fiveMB)).not.toThrow();
    });

    it('should accept file below 5MB', () => {
      const threeMB = 3 * 1024 * 1024;
      expect(() => validateFileSize(threeMB)).not.toThrow();
    });

    it('should reject file above 5MB', () => {
      const sixMB = 6 * 1024 * 1024;
      expect(() => validateFileSize(sixMB)).toThrow('File size exceeds 5MB');
    });

    it('should reject zero byte file', () => {
      expect(() => validateFileSize(0)).toThrow('File size exceeds 5MB');
    });
  });

  describe('uploadFile', () => {
    it('should throw if file type is invalid', async () => {
      const buffer = Buffer.from('fake pdf content');
      const mockFile = {
        buffer,
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
        size: buffer.length,
      } as Express.Multer.File;
      await expect(uploadFile(mockFile)).rejects.toThrow('Invalid file type');
    });

    it('should throw if file size exceeds 5MB', async () => {
      const buffer = Buffer.alloc(6 * 1024 * 1024);
      const mockFile = {
        buffer,
        mimetype: 'image/jpeg',
        originalname: 'large.jpg',
        size: buffer.length,
      } as Express.Multer.File;
      await expect(uploadFile(mockFile)).rejects.toThrow(
        'File size exceeds 5MB',
      );
    });
  });
});
