import {
  transitionOrder,
  type OrderEvent,
} from './order-state-machine.js';
import { OrderStatus } from '../generated/prisma/client.js';

describe('transitionOrder', () => {
  it.each([
    [OrderStatus.PENDING_PAYMENT, 'PAY', OrderStatus.PAID],
    [OrderStatus.PAID, 'FULFILL', OrderStatus.FULFILLED],
    [OrderStatus.PENDING_PAYMENT, 'CANCEL', OrderStatus.CANCELLED],
    [OrderStatus.FULFILLED, 'REQUEST_REFUND', OrderStatus.REFUND_PENDING],
    [OrderStatus.REFUND_PENDING, 'REFUND', OrderStatus.REFUNDED],
    [
      OrderStatus.REFUND_PENDING,
      'REJECT_REFUND',
      OrderStatus.REFUND_REJECTED,
    ],
  ] satisfies Array<[OrderStatus, OrderEvent, OrderStatus]>)(
    'transitions %s with %s',
    (from, event, expected) => {
      expect(transitionOrder(from, event)).toBe(expected);
    },
  );

  it('rejects invalid transitions', () => {
    expect(() =>
      transitionOrder(OrderStatus.FULFILLED, 'PAY'),
    ).toThrow('INVALID_ORDER_TRANSITION');
  });
});
