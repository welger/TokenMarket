import {
  mapApiCalls,
  mapInvoices,
  mapOrders,
  mapRefunds,
  mapUsageDashboard,
  payWechatOrder,
} from '../miniprogram/services/billing';
import { wxRequestPaymentMock } from './wx.mock';

describe('billing and usage mapping', () => {
  test('maps usage summary and plan remaining quota', () => {
    const dashboard = mapUsageDashboard(
      {
        callCount: 12,
        chargedUnits: 98000,
        inputCharacters: 86000,
        outputCharacters: 12000,
        periodEnd: '2026-06-01T00:00:00.000Z',
        periodStart: '2026-05-01T00:00:00.000Z',
        remainingUnits: 43000,
      },
      [
        {
          expiresAt: '2026-06-30T00:00:00.000Z',
          plan: { name: '开发测试套餐' },
          remainingUnifiedQuota: 43000,
          status: 'ACTIVE',
        },
      ],
    );

    expect(dashboard).toMatchObject({
      callCount: '12',
      chargedUnits: '9.8 万 字符',
      periodText: '5.1 - 5.31',
      remainingUnits: '4.3 万 字符',
    });
    expect(dashboard.planRows[0]).toMatchObject({
      name: '开发测试套餐',
      remainingText: '4.3 万 字符',
      statusText: '生效中',
    });
  });

  test('maps call logs without prompt, response, upstream id or plaintext key', () => {
    const rows = mapApiCalls([
      {
        chargedUnits: 8,
        createdAt: '2026-06-13T08:30:00.000Z',
        durationMs: 230,
        errorSummary: 'private response body',
        httpStatus: 200,
        inputCharacters: 5,
        modelName: 'qwen-turbo',
        outputCharacters: 3,
        prompt: 'private prompt',
        requestId: 'req_1',
        upstreamRequestId: 'upstream-secret',
      } as never,
    ]);

    expect(rows[0]).toEqual({
      chargedUnits: '8 字符',
      charactersText: '输入 5 / 输出 3',
      createdAtText: '2026-06-13 16:30',
      durationText: '230 ms',
      httpStatusText: '200',
      modelName: 'qwen-turbo',
      requestId: 'req_1',
    });
    expect(JSON.stringify(rows)).not.toMatch(
      /private prompt|private response body|upstream-secret|sk-gw_/,
    );
  });

  test('maps order payment status honestly', () => {
    const rows = mapOrders([
      {
        amountMinor: 9900,
        createdAt: '2026-06-13T00:00:00.000Z',
        currency: 'CNY',
        id: 'order_1',
        orderNumber: 'ord_1',
        paymentDriver: 'TEST',
        plan: { name: '开发测试套餐' },
        status: 'FULFILLED',
      },
      {
        amountMinor: 19900,
        currency: 'CNY',
        id: 'order_2',
        paymentDriver: 'WECHAT',
        status: 'PENDING_PAYMENT',
      },
    ]);

    expect(rows[0]).toMatchObject({
      canPayWechat: false,
      paymentText: '测试支付',
      statusText: '已发放',
    });
    expect(rows[1]).toMatchObject({
      canPayWechat: true,
      paymentText: '微信支付',
      statusText: '待支付',
    });
  });

  test('maps order creation dates in the miniapp local timezone', () => {
    const rows = mapOrders([
      {
        amountMinor: 100,
        createdAt: '2026-06-16T18:10:00.000Z',
        currency: 'CNY',
        id: 'order_1',
        orderNumber: 'ord_1',
        paymentDriver: 'WECHAT',
        status: 'FULFILLED',
      },
    ]);

    expect(rows[0].createdAtText).toBe('2026-06-17');
  });

  test('maps order creation dates without Intl support', () => {
    const originalIntl = globalThis.Intl;
    Object.defineProperty(globalThis, 'Intl', {
      configurable: true,
      value: undefined,
    });

    try {
      const rows = mapOrders([
        {
          amountMinor: 100,
          createdAt: '2026-06-16T18:10:00.000Z',
          currency: 'CNY',
          id: 'order_1',
          orderNumber: 'ord_1',
          paymentDriver: 'WECHAT',
          status: 'FULFILLED',
        },
      ]);

      expect(rows[0].createdAtText).toBe('2026-06-17');
    } finally {
      Object.defineProperty(globalThis, 'Intl', {
        configurable: true,
        value: originalIntl,
      });
    }
  });

  test('requests WeChat payment params and invokes wx.requestPayment', async () => {
    const request = jest.fn().mockResolvedValue({
      nonceStr: 'nonce-1',
      package: 'prepay_id=wx123',
      paySign: 'signed',
      signType: 'RSA',
      timeStamp: '1710000000',
    });
    wxRequestPaymentMock.mockImplementation((options) => {
      options.success?.({
        errMsg: 'requestPayment:ok',
      } as WechatMiniprogram.GeneralCallbackResult);
    });

    await expect(
      payWechatOrder('order_1', { request }),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/me/orders/order_1/pay-wechat',
    });
    expect(wxRequestPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nonceStr: 'nonce-1',
        package: 'prepay_id=wx123',
        paySign: 'signed',
        signType: 'RSA',
        timeStamp: '1710000000',
      }),
    );
  });

  test('rejects invalid WeChat payment params before opening payment sheet', async () => {
    const request = jest.fn().mockResolvedValue({
      nonceStr: 'nonce-1',
      package: 'prepay_id=wx123',
      signType: 'RSA',
      timeStamp: '1710000000',
    });

    await expect(
      payWechatOrder('order_1', { request }),
    ).rejects.toThrow('微信支付参数无效，请稍后重试');
    expect(wxRequestPaymentMock).not.toHaveBeenCalled();
  });

  test('maps wx.requestPayment failure to a public error message', async () => {
    const request = jest.fn().mockResolvedValue({
      nonceStr: 'nonce-1',
      package: 'prepay_id=wx123',
      paySign: 'signed',
      signType: 'RSA',
      timeStamp: '1710000000',
    });
    wxRequestPaymentMock.mockImplementation((options) => {
      options.fail?.({
        errMsg: 'requestPayment:fail system error',
      } as WechatMiniprogram.GeneralCallbackResult);
    });

    await expect(
      payWechatOrder('order_1', { request }),
    ).rejects.toThrow('微信支付未完成，请稍后重试或联系客服');
  });

  test('does not mark invoices issued before ISSUED status', () => {
    const invoices = mapInvoices([
      { id: 'inv_1', status: 'SUBMITTED', title: '示例公司' },
      { id: 'inv_2', status: 'ISSUED', title: '示例公司' },
    ]);

    expect(invoices[0].statusText).toBe('已提交');
    expect(invoices[0].statusText).not.toBe('已开具');
    expect(invoices[1].statusText).toBe('已开具');
  });

  test('maps refund records without pretending real payment refunds', () => {
    const refunds = mapRefunds([
      {
        amountMinor: 9900,
        reason: '未使用',
        status: 'REFUNDED',
      },
    ]);

    expect(refunds[0]).toMatchObject({
      amountText: '¥99.00',
      reason: '未使用',
      statusText: '测试退款已完成',
    });
  });
});
