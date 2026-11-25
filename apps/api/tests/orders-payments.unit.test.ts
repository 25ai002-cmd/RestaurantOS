import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { canTransitionOrder } from '../src/modules/orders/orderStateMachine.js';
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
