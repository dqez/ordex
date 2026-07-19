import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('add')
  addToCart(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddToCartDto) {
    return this.cartService.addToCart(user.id, dto);
  }

  @Patch('item/:variantId')
  updateCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(user.id, variantId, dto);
  }

  @Delete('item/:variantId')
  removeFromCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.cartService.removeFromCart(user.id, variantId);
  }

  @Delete()
  clearCart(@CurrentUser() user: AuthenticatedUser) {
    return this.cartService.clearCart(user.id);
  }
}
