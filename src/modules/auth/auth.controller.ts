import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { AuthLoginRequest } from './dto/auth-login.request';
import { AuthRegisterRequest } from './dto/auth-register.request';
import { AuthResponse } from './dto/auth.response';
import { AuthGuard } from './guards/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: AuthRegisterRequest): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AuthLoginRequest): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string): Promise<AuthResponse> {
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  logout(@CurrentUser('sub') userId: string): Promise<void> {
    return this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: Express.Request['user']) {
    return user;
  }

  @Get('google')
  @UseGuards(PassportAuthGuard('google'))
  googleLogin() {
    // passport redirect
  }

  @Get('google/callback')
  @UseGuards(PassportAuthGuard('google'))
  googleCallback(@Req() req: Request): AuthResponse {
    return req.user as AuthResponse;
  }
}
