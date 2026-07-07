import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { user_id: userId, is_default: true },
        data: { is_default: false },
      });
    }

    return this.prisma.address.create({
      data: {
        user_id: userId,
        label: dto.label,
        full_name: dto.fullName,
        phone: dto.phone,
        address_line: dto.addressLine,
        ward: dto.ward,
        district: dto.district,
        city: dto.city,
        state: dto.state,
        is_default: dto.isDefault ?? false,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, user_id: userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { user_id: userId, is_default: true },
        data: { is_default: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data: {
        label: dto.label,
        full_name: dto.fullName,
        phone: dto.phone,
        address_line: dto.addressLine,
        ward: dto.ward,
        district: dto.district,
        city: dto.city,
        state: dto.state,
        is_default: dto.isDefault,
      },
    });
  }

  async remove(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, user_id: userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });
    return { message: 'Address deleted successfully' };
  }
}
