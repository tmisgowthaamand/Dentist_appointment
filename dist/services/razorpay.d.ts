import type { Appointment } from '../types/index.js';
export declare function createPaymentLink(appointment: Appointment): Promise<import("razorpay/dist/types/paymentLink.js").PaymentLinks.RazorpayPaymentLink>;
export declare function verifyWebhookSignature(body: string, signature: string): boolean;
//# sourceMappingURL=razorpay.d.ts.map