import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function createMockContext(
  user?: { sub: string; email: string; role: UserRole },
  handler = {},
): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = createMockContext({
      sub: 'u1',
      email: 'a@b.com',
      role: UserRole.BUYER,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.SELLER,
    ]);
    const ctx = createMockContext({
      sub: 'u1',
      email: 'a@b.com',
      role: UserRole.SELLER,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.ADMIN,
    ]);
    const ctx = createMockContext({
      sub: 'u1',
      email: 'a@b.com',
      role: UserRole.BUYER,
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no user on request', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      UserRole.BUYER,
    ]);
    const ctx = createMockContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access when empty roles array required', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
    const ctx = createMockContext({
      sub: 'u1',
      email: 'a@b.com',
      role: UserRole.BUYER,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
