import { OrderStatus } from '../generated/prisma/client.js';

export type OrderEvent =
  | 'PAY'
  | 'FULFILL'
  | 'CANCEL'
  | 'REQUEST_REFUND'
  | 'REFUND'
  | 'REJECT_REFUND';

const transitions: Partial<
  Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>>
> = {
  [OrderStatus.PENDING_PAYMENT]: {
    PAY: OrderStatus.PAID,
    CANCEL: OrderStatus.CANCELLED,
  },
  [OrderStatus.PAID]: {
    FULFILL: OrderStatus.FULFILLED,
    REQUEST_REFUND: OrderStatus.REFUND_PENDING,
  },
  [OrderStatus.FULFILLED]: {
    REQUEST_REFUND: OrderStatus.REFUND_PENDING,
  },
  [OrderStatus.REFUND_PENDING]: {
    REFUND: OrderStatus.REFUNDED,
    REJECT_REFUND: OrderStatus.REFUND_REJECTED,
  },
};

export function transitionOrder(
  current: OrderStatus,
  event: OrderEvent,
): OrderStatus {
  const next = transitions[current]?.[event];
  if (!next) {
    throw new Error('INVALID_ORDER_TRANSITION');
  }
  return next;
}
