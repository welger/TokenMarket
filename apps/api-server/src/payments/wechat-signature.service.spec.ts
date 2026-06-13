import { createCipheriv, generateKeyPairSync } from 'node:crypto';

import { WechatSignatureService } from './wechat-signature.service.js';

function encryptResource(plaintext: string, apiV3Key: string) {
  const nonce = 'notify-nonce';
  const associatedData = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(nonce, 'utf8'),
  );
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    associated_data: associatedData,
    nonce,
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
  };
}

describe('WechatSignatureService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  const publicKeyPem = publicKey.export({
    type: 'spki',
    format: 'pem',
  }) as string;
  const service = new WechatSignatureService();

  it('builds and signs WeChat Pay API v3 request authorization headers', () => {
    const header = service.createAuthorizationHeader({
      method: 'POST',
      pathWithQuery: '/v3/pay/transactions/jsapi',
      timestamp: '1710000000',
      nonce: 'nonce-123',
      body: '{"amount":{"total":100}}',
      merchantId: '1900000001',
      merchantSerialNo: 'serial-123',
      merchantPrivateKeyPem: privateKeyPem,
    });

    expect(header).toContain('WECHATPAY2-SHA256-RSA2048');
    expect(header).toContain('mchid="1900000001"');
    expect(header).toContain('serial_no="serial-123"');
    expect(header).toContain('nonce_str="nonce-123"');
    expect(header).toContain('timestamp="1710000000"');
    expect(header).toContain('signature="');
  });

  it('verifies a notification signature over timestamp, nonce, and body', () => {
    const body = '{"id":"notification_1"}';
    const timestamp = '1710000000';
    const nonce = 'notify-nonce';
    const signature = service.sign(
      `${timestamp}\n${nonce}\n${body}\n`,
      privateKeyPem,
    );

    expect(
      service.verifyNotificationSignature({
        timestamp,
        nonce,
        body,
        signature,
        platformPublicKeyPem: publicKeyPem,
      }),
    ).toBe(true);
    expect(
      service.verifyNotificationSignature({
        timestamp,
        nonce,
        body: `${body} `,
        signature,
        platformPublicKeyPem: publicKeyPem,
      }),
    ).toBe(false);
  });

  it('decrypts API v3 notification resources using AES-256-GCM', () => {
    const apiV3Key = 'a'.repeat(32);
    const plaintext = JSON.stringify({
      out_trade_no: 'ord_1',
      transaction_id: '4200000001',
      trade_state: 'SUCCESS',
    });
    const resource = encryptResource(plaintext, apiV3Key);

    expect(service.decryptResource(resource, apiV3Key)).toBe(plaintext);
    expect(() =>
      service.decryptResource(resource, 'b'.repeat(32)),
    ).toThrow(
      expect.objectContaining({
        code: 'WECHAT_PAY_RESOURCE_DECRYPT_FAILED',
      }),
    );
  });
});
