import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthGuard } from '@modules/auth/guards/auth.guard';
import { AddressService } from './address.service';
import { AddressCreateRequest } from './dto/address.create-request';
import { AddressUpdateRequest } from './dto/address.update-request';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly addressService: AddressService,
  ) {}

  @Get('me')
  getMe(@CurrentUser('sub') userId: string) {
    return this.userService.getCurrentUser(userId);
  }

  @Put('me')
  updateMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: { fullName?: string; phone?: string },
  ) {
    return this.userService.update(userId, dto);
  }

  @Get('me/addresses')
  getAddresses(@CurrentUser('sub') userId: string) {
    return this.addressService.getAddresses(userId);
  }

  @Post('me/addresses')
  createAddress(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddressCreateRequest,
  ) {
    return this.addressService.createAddress(userId, dto);
  }

  @Put('me/addresses/:id')
  updateAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
    @Body() dto: AddressUpdateRequest,
  ) {
    return this.addressService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
  ): Promise<void> {
    return this.addressService.deleteAddress(userId, addressId);
  }

  @Patch('me/addresses/:id/default')
  setDefaultAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.addressService.setDefaultAddress(userId, addressId);
  }
}
