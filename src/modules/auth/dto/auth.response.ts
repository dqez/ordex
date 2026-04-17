import { UserRole } from '@prisma/client';

export class JwtPayload {
  sub!: string;
  email!: string;
  role!: UserRole;
  iat?: number;
  exp?: number;
}

export class AuthUserResponse {
  sub!: string;
  email!: string;
  role!: UserRole;
  fullName!: string;
}

export class AuthResponse {
  accessToken!: string;
  refreshToken!: string;
  user!: AuthUserResponse;
}
