import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AddressService } from './address.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserService, AddressService],
  exports: [UserService],
})
export class UserModule {}
