import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '@prisma/prisma.service';
import { AuthRegisterRequest } from './dto/auth-register.request';
import {
  AuthResponse,
  AuthUserResponse,
  JwtPayload,
} from './dto/auth.response';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: AuthRegisterRequest): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role ?? UserRole.BUYER,
      },
    });

    return this.issueTokenPair(user.id, user.email, user.role, user.fullName);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokenPair(user.id, user.email, user.role, user.fullName);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async refreshTokens(currentRefreshToken: string): Promise<AuthResponse> {
    const tokenHash = createHash('sha256')
      .update(currentRefreshToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.isRevoked) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException('Token reuse detected');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const { user } = stored;
    return this.issueTokenPair(
      user.id,
      user.email,
      user.role,
      user.fullName,
      stored.familyId,
    );
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async findOrCreateOAuthUser(profile: {
    email: string | undefined;
    fullName: string;
    oauthId: string;
  }): Promise<AuthResponse> {
    if (!profile.email)
      throw new UnauthorizedException('Google account has no email');

    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          fullName: profile.fullName,
          role: UserRole.BUYER,
          oauthProvider: 'google',
          oauthId: profile.oauthId,
          isVerified: true,
        },
      });
    }

    return this.issueTokenPair(user.id, user.email, user.role, user.fullName);
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    fullName: string,
    existingFamilyId?: string,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: userId, email, role };
    const familyId = existingFamilyId ?? randomUUID();

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiry') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshExpiry') as any,
    });

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt, isRevoked: false },
    });

    const user: AuthUserResponse = { sub: userId, email, role, fullName };
    return { accessToken, refreshToken, user };
  }
}
