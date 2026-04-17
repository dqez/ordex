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
  }
}

export {};
