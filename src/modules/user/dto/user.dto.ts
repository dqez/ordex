import { UserRole } from '@prisma/client';

export class UserDto {
  id!: string;
  email!: string;
  fullName!: string;
  role!: UserRole;
  isVerified!: boolean;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
