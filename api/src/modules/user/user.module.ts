import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';

@Module({
  controllers: [UserController, AddressController],
  providers: [UserService, AddressService],
})
export class UserModule {}
