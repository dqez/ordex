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
import { randomUUID } from 'crypto';

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
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
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
}
