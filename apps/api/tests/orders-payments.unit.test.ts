import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { canTransitionOrder } from '../src/modules/orders/orderStateMachine.js';
import { isWithinCancelWindow } from '../src/modules/orders/orders.routes.js';
import { verifyRazorpaySignature } from '../src/modules/payments/payments.routes.js';

describe('Order State Machine', () => {
  it('allows valid lifecycle transitions', () => {
    expect(canTransitionOrder('PLACED', 'ACCEPTED')).toBe(true);
    expect(canTransitionOrder('ACCEPTED', 'PREPARING')).toBe(true);
    expect(canTransitionOrder('PREPARING', 'READY')).toBe(true);
    expect(canTransitionOrder('READY', 'SERVED')).toBe(true);
  });

  it('rejects invalid or terminal transitions', () => {
    expect(canTransitionOrder('PLACED', 'SERVED')).toBe(false);
    expect(canTransitionOrder('SERVED', 'CANCELLED')).toBe(false);
    expect(canTransitionOrder('CANCELLED', 'ACCEPTED')).toBe(false);
  });

  it('enforces the 5-minute customer cancellation window', () => {
    const placedAt = new Date('2026-11-25T10:00:00.000Z');
    expect(isWithinCancelWindow(placedAt, new Date('2026-11-25T10:04:59.000Z'))).toBe(true);
    expect(isWithinCancelWindow(placedAt, new Date('2026-11-25T10:05:01.000Z'))).toBe(false);
  });
});

describe('Razorpay Signature Verification', () => {
  it('verifies valid HMAC-SHA256 signatures and rejects tampered ones', () => {
    const secret = 'rzp_test_secret_key';
    const orderId = 'order_12345';
    const paymentId = 'pay_67890';
    const validSig = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(verifyRazorpaySignature(orderId, paymentId, validSig, secret)).toBe(true);
    expect(verifyRazorpaySignature(orderId, paymentId, 'tampered_sig', secret)).toBe(false);
  });
});
