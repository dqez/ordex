import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const emailExist = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (emailExist) {
      throw new ConflictException('The email has already been used!');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash: hashedPassword,
        full_name: dto.fullName,
        role: dto.role,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...newUserWithoutPassword } = newUser;
    return newUserWithoutPassword;
  }

  async login(dto: LoginDto) {
    const userExist = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!userExist) {
      throw new UnauthorizedException('The email or password was wrong!');
    }
    if (!userExist.password_hash) {
      throw new UnauthorizedException('The email or password was wrong!');
    }

    const result = await bcrypt.compare(dto.password, userExist.password_hash);
    if (!result) {
      throw new UnauthorizedException('The email or password was wrong!');
    }

    const payload = {
      sub: userExist.id,
      email: userExist.email,
      role: userExist.role,
    };

    const accessToken = this.jwt.sign(payload);

    const refreshToken = randomUUID();
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const familyId = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        user_id: userExist.id,
        token_hash: refreshTokenHash,
        family_id: familyId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), //7 days
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...user } = userExist;
    return { user, accessToken, refreshToken };
  }

  async refresh(refreshTokenRaw: string) {
    //Hash token for look up
    const tokenHash = createHash('sha256')
      .update(refreshTokenRaw)
      .digest('hex');
    //Find in db
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        token_hash: tokenHash,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Check refreshToken đã revoked chưa? nếu rồi thì user đang reuse freshToken cũ. Update revoked và throw exception.
    if (storedToken.is_revoked) {
      await this.prisma.refreshToken.updateMany({
        where: {
          family_id: storedToken.family_id,
        },
        data: {
          is_revoked: true,
        },
      });
      throw new UnauthorizedException(
        'Token reuse detected! All sessions revoked.',
      );
    }
    //check hết hạn
    if (storedToken.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    //thu hồi (revoke) token cũ
    await this.prisma.refreshToken.update({
      where: {
        id: storedToken.id,
      },
      data: {
        is_revoked: true,
      },
    });
    // tạo token mới - cùng family_id
    const newRefreshToken = randomUUID();
    const newTokenHash = createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        user_id: storedToken.user_id,
        token_hash: newTokenHash,
        family_id: storedToken.family_id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    // sign access token mới
    const user = await this.prisma.user.findUnique({
      where: {
        id: storedToken.user_id,
      },
    });

    const accessToken = this.jwt.sign({
      sub: user!.id,
      email: user!.email,
      role: user!.role,
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshTokenRaw: string) {
    const tokenHash = createHash('sha256')
      .update(refreshTokenRaw)
      .digest('hex');

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        token_hash: tokenHash,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: {
        id: storedToken.id,
      },
      data: {
        is_revoked: true,
      },
    });

    return { message: 'Logged out successfully' };
  }
}
