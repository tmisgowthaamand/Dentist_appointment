import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';
import type { Appointment } from '../types/index.js';

dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export async function createPaymentLink(appointment: Appointment) {
    const amount = 100 * 100; // ₹100 in paise

    // Sanitize phone number (must be 10 digits for Razorpay link in most cases)
    const sanitizedPhone = appointment.phone.replace(/\D/g, '');
    const validPhone = sanitizedPhone.length >= 10 ? sanitizedPhone.slice(-10) : '9100000000';

    const options: any = {
        amount: amount,
        currency: 'INR',
        accept_partial: false,
        description: `Dentist Appointment - ${appointment.doctorName} - ${appointment.slot}`,
        customer: {
            name: appointment.patientName,
            contact: validPhone,
        },
        notes: {
            appointmentId: appointment.appointmentId,
        },
    };

    // Redirect to Telegram bot after payment
    // This ensures users are taken back to the chat to see their confirmation
    // Redirect to our server callback first to show a success page, then to Telegram
    const serverUrl = process.env.SERVER_URL || '';
    options.callback_url = `${serverUrl}/callback`;
    options.callback_method = 'get';

    try {
        const response = await razorpay.paymentLink.create(options);
        return response;
    } catch (error: any) {
        console.error('Razorpay Error. Data:', JSON.stringify(options, null, 2));
        console.error('Error details:', error);
        throw error;
    }
}

export function verifyWebhookSignature(body: string, signature: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}
