import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'family-uuid-1'),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'hashed-token'),
  })),
}));

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  fullName: 'Test User',
  role: UserRole.BUYER,
};

const mockRefreshToken = {
  id: 'rt-uuid-1',
  tokenHash: 'hashed-token',
  familyId: 'family-uuid-1',
  isRevoked: false,
  user: mockUser,
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    jwtService = {
      sign: jest.fn(() => 'mock-token'),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          'jwt.accessSecret': 'access-secret',
          'jwt.accessExpiry': '15m',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiry': '7d',
        };
        return map[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new AuthService(prisma, jwtService, configService);
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register({
        email: 'test@example.com',
        password: 'Password1!',
        fullName: 'Test User',
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw ConflictException if email already registered', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password1!',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should default role to BUYER when not provided', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      await service.register({
        email: 'test@example.com',
        password: 'Password1!',
        fullName: 'Test User',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: UserRole.BUYER }),
        }),
      );
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.login('test@example.com', 'Password1!');

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login('nobody@example.com', 'Password1!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for OAuth user without passwordHash', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      await expect(
        service.login('test@example.com', 'Password1!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(
        'test@example.com',
        'Password1!',
      );

      expect(result).toEqual(mockUser);
    });

    it('should return null for invalid password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@example.com', 'wrong');

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateUser(
        'nobody@example.com',
        'Password1!',
      );

      expect(result).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('should issue new token pair for valid refresh token', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(
        mockRefreshToken,
      );
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isRevoked: true } }),
      );
    });

    it('should throw UnauthorizedException for unknown token', async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.refreshTokens('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke entire token family on reuse detection', async () => {
      const revokedToken = { ...mockRefreshToken, isRevoked: true };
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(
        revokedToken,
      );
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: mockRefreshToken.familyId },
          data: { isRevoked: true },
        }),
      );
    });
  });

  describe('logout', () => {
    it('should revoke all active refresh tokens for user', async () => {
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await service.logout('user-uuid-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });
  });

  describe('findOrCreateOAuthUser', () => {
    it('should return tokens for existing OAuth user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.findOrCreateOAuthUser({
        email: 'test@example.com',
        fullName: 'Test User',
        oauthId: 'google-123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should create new user for first-time OAuth login', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        ...mockUser,
        oauthProvider: 'google',
        oauthId: 'google-123',
        isVerified: true,
      });
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.findOrCreateOAuthUser({
        email: 'new@example.com',
        fullName: 'New User',
        oauthId: 'google-456',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oauthProvider: 'google',
            isVerified: true,
          }),
        }),
      );
      expect(result.accessToken).toBeDefined();
    });

    it('should throw UnauthorizedException when email is missing', async () => {
      await expect(
        service.findOrCreateOAuthUser({
          email: undefined,
          fullName: 'No Email',
          oauthId: 'google-789',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
