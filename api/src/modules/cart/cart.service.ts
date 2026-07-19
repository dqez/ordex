import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId },
      include: {
        cartItems: {
          orderBy: { added_at: 'desc' },
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    productImages: {
                      where: { is_primary: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return cart;
  }

  async addToCart(userId: string, dto: AddToCartDto) {
    const cart = await this.prisma.cart.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId },
      select: { id: true },
    });

    await this.prisma.cartItem.upsert({
      where: {
        cart_id_variant_id: { cart_id: cart.id, variant_id: dto.variantId },
      },
      update: {
        quantity: {
          increment: dto.quantity,
        },
      },
      create: {
        cart_id: cart.id,
        variant_id: dto.variantId,
        quantity: dto.quantity,
      },
    });

    return { message: 'Add to cart successfully' };
  }

  async updateCartItem(
    userId: string,
    variantId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    try {
      await this.prisma.cartItem.update({
        where: {
          cart_id_variant_id: {
            cart_id: cart.id,
            variant_id: variantId,
          },
        },
        data: {
          quantity: dto.quantity,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Item not found in cart');
      }
    }

    return { message: 'Update cart item successfully' };
  }

  async removeFromCart(userId: string, variantId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!cart) throw new NotFoundException('Cart not found');

    try {
      await this.prisma.cartItem.delete({
        where: {
          cart_id_variant_id: {
            cart_id: cart.id,
            variant_id: variantId,
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Item not found in cart');
      }
    }

    return { message: 'Remove variant from cart successfully' };
  }

  async clearCart(userId: string) {
    await this.prisma.cartItem.deleteMany({
      where: {
        cart: {
          user_id: userId,
        },
      },
    });

    return { message: 'Clear cart successfully' };
  }
}
