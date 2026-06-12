import { ForbiddenException } from '@nestjs/common';

import { TestPaymentDriver } from './test-payment.driver.js';

describe('TestPaymentDriver', () => {
  it('marks every result as an explicit test payment', async () => {
    const driver = new TestPaymentDriver('test');

    await expect(
      driver.pay(
        { id: 'order_1', amountMinor: 100, currency: 'CNY' },
        { isAdmin: false },
      ),
    ).resolves.toEqual({
      driver: 'test',
      paymentReference: 'test:order_1',
      displayLabel: '测试支付',
    });
  });

  it('rejects non-admin use outside the test environment', async () => {
    const driver = new TestPaymentDriver('production');

    await expect(
      driver.pay(
        { id: 'order_1', amountMinor: 100, currency: 'CNY' },
        { isAdmin: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
