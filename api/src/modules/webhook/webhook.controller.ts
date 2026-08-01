import {
  Controller,
  Post,
  RawBodyRequest,
  HttpCode,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from '../payment/payment.service';
import { Public } from 'src/common/decorators/public.decorator';
import { Request } from 'express';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async handleStripe(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    const signature = req.headers['stripe-signature'];
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing raw body or signature');
    }

    await this.paymentService.handleStripeWebhook(rawBody, signature as string);

    return { received: true };
  }
}
