import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
