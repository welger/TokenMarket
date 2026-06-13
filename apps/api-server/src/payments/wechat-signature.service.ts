import {
  createDecipheriv,
  createSign,
  createVerify,
} from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface WechatAuthorizationHeaderInput {
  method: string;
  pathWithQuery: string;
  timestamp: string;
  nonce: string;
  body: string;
  merchantId: string;
  merchantSerialNo: string;
  merchantPrivateKeyPem: string;
}

export interface WechatNotificationSignatureInput {
  timestamp: string;
  nonce: string;
  body: string;
  signature: string;
  platformPublicKeyPem: string;
}

export interface WechatEncryptedResource {
  associated_data?: string;
  nonce: string;
  ciphertext: string;
}

export class WechatPayResourceDecryptException extends UnauthorizedException {
  readonly code = 'WECHAT_PAY_RESOURCE_DECRYPT_FAILED';

  constructor() {
    super({
      code: 'WECHAT_PAY_RESOURCE_DECRYPT_FAILED',
      message: '微信支付通知解密失败',
    });
  }
}

@Injectable()
export class WechatSignatureService {
  createAuthorizationHeader(input: WechatAuthorizationHeaderInput) {
    const message = this.buildSignatureMessage(
      input.method,
      input.pathWithQuery,
      input.timestamp,
      input.nonce,
      input.body,
    );
    const signature = this.sign(message, input.merchantPrivateKeyPem);

    return [
      'WECHATPAY2-SHA256-RSA2048',
      `mchid="${input.merchantId}"`,
      `nonce_str="${input.nonce}"`,
      `signature="${signature}"`,
      `timestamp="${input.timestamp}"`,
      `serial_no="${input.merchantSerialNo}"`,
    ].join(' ');
  }

  sign(message: string, privateKeyPem: string): string {
    return createSign('RSA-SHA256')
      .update(message)
      .end()
      .sign(privateKeyPem, 'base64');
  }

  verifyNotificationSignature(
    input: WechatNotificationSignatureInput,
  ): boolean {
    const message = `${input.timestamp}\n${input.nonce}\n${input.body}\n`;
    return createVerify('RSA-SHA256')
      .update(message)
      .end()
      .verify(
        input.platformPublicKeyPem,
        Buffer.from(input.signature, 'base64'),
      );
  }

  decryptResource(
    resource: WechatEncryptedResource,
    apiV3Key: string,
  ): string {
    try {
      const encrypted = Buffer.from(resource.ciphertext, 'base64');
      const authTag = encrypted.subarray(encrypted.length - 16);
      const ciphertext = encrypted.subarray(0, encrypted.length - 16);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(apiV3Key, 'utf8'),
        Buffer.from(resource.nonce, 'utf8'),
      );
      if (resource.associated_data) {
        decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
      }
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new WechatPayResourceDecryptException();
    }
  }

  private buildSignatureMessage(
    method: string,
    pathWithQuery: string,
    timestamp: string,
    nonce: string,
    body: string,
  ): string {
    return `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
  }
}
