import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  WECHAT_CODE_EXCHANGE,
  type WechatCodeExchange,
} from './wechat-code-exchange.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { UserStatus } from '../generated/prisma/client.js';

export interface WechatLoginResult {
  accessToken: string;
  userId: string;
}

@Injectable()
export class WechatAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(WECHAT_CODE_EXCHANGE)
    private readonly codeExchange: WechatCodeExchange,
  ) {}

  async login(code: unknown): Promise<WechatLoginResult> {
    const normalizedCode =
      typeof code === 'string' ? code.trim() : '';
    if (
      normalizedCode.length < 1 ||
      normalizedCode.length > 256
    ) {
      throw new BadRequestException('Invalid code');
    }

    const { openId } = await this.codeExchange.exchange(normalizedCode);
    const user = await this.prisma.user.upsert({
      where: { wechatOpenId: openId },
      update: {},
      create: { wechatOpenId: openId },
      select: { id: true, status: true },
    });
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'user' },
      { audience: 'miniapp' },
    );

    return { accessToken, userId: user.id };
  }
}
