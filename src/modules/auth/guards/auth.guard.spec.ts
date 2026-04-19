import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthGuard } from './auth.guard';

const mockPayload = {
  sub: 'user-uuid-1',
  email: 'test@example.com',
  role: UserRole.BUYER,
};

function createMockContext(authHeader?: string): ExecutionContext {
  const request = { headers: { authorization: authHeader }, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jwtService = { verify: jest.fn() } as unknown as jest.Mocked<JwtService>;
    configService = {
      get: jest.fn(() => 'access-secret'),
    } as unknown as jest.Mocked<ConfigService>;
    guard = new AuthGuard(jwtService, configService, new Reflector());
  });

  it('should return true and attach user for valid Bearer token', () => {
    (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);
    const ctx = createMockContext('Bearer valid-token');

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toEqual({
      sub: mockPayload.sub,
      email: mockPayload.email,
      role: mockPayload.role,
    });
  });

  it('should throw UnauthorizedException when no Authorization header', () => {
    const ctx = createMockContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when token type is not Bearer', () => {
    const ctx = createMockContext('Basic some-token');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when token is invalid', () => {
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });
    const ctx = createMockContext('Bearer invalid-token');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
