import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: {
        sub: string;
        email: string;
        role: UserRole;
      };
    }
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
        destination?: string;
        filename?: string;
        path?: string;
      }
    }
  }
}

export {};
