import express from 'express';
import { verifyWebhookSignature } from '../services/razorpay.js';
import { updateAppointmentStatus, getAppointmentById, updateAppointmentPaidEventId } from '../services/googleSheets.js';
import { Telegraf, Markup } from 'telegraf';

import { generateInvoicePDF } from '../services/invoice.js';

const router = express.Router();

function isTelegramMessageNotModifiedError(err: unknown): boolean {
    const e = err as any;
    const description = e?.response?.description;
    return e?.response?.error_code === 400 && typeof description === 'string' && description.includes('message is not modified');
}

export function setupRazorpayWebhook(bot: Telegraf, adminBot: Telegraf) {
    router.post('/razorpay-webhook', async (req, res) => {
        console.log('🔔 Razorpay Webhook Received:', req.body.event);
        const signature = req.headers['x-razorpay-signature'] as string;
        // Use rawBody if available (from custom middleware), otherwise fallback to JSON stringify (unreliable)
        const rawBody = (req as any).rawBody;
        const bodyContent = rawBody ? rawBody.toString() : JSON.stringify(req.body);

        console.log(`🔍 Verifying Webhook. Has RawBody: ${!!rawBody}`);

        if (!verifyWebhookSignature(bodyContent, signature)) {
            console.warn('❌ Invalid Razorpay signature for event:', req.body.event);
            return res.status(400).send('Invalid signature');
        }

        console.log('✅ Signature Verified. Processing event...');
        const event = req.body.event;
        const payload = req.body.payload;

        if (event === 'payment_link.paid' || event === 'payment.captured') {
            console.log('💰 Payment Captured event detected');
            const data = event === 'payment_link.paid' ? payload.payment_link.entity : payload.payment.entity;
            const notes = data.notes || {};
            const appointmentId = notes.appointmentId;
            const paidEventId = `${event}:${data.id}`;

            if (!appointmentId) {
                console.warn('⚠️ No appointmentId found in notes for payment:', data.id);
                return res.status(200).send('No appointmentId');
            }

            console.log(`📌 Processing payment for Appointment ID: ${appointmentId}`);

            const existingAppointment = await getAppointmentById(appointmentId);
            if (existingAppointment?.paidEventId === paidEventId) {
                console.log(`🔁 Duplicate paid webhook ignored for ${appointmentId}. Event already processed (${paidEventId}).`);
                return res.status(200).send('Already processed');
            }
            if (existingAppointment?.paymentStatus === 'Paid' && existingAppointment?.paidEventId) {
                console.log(`🔁 Paid webhook ignored for ${appointmentId}. Appointment already marked Paid with event ${existingAppointment.paidEventId}.`);
                return res.status(200).send('Already processed');
            }

            await updateAppointmentStatus(appointmentId, 'Paid');

            // Persist the event id for idempotency (so retries don't resend messages/invoice).
            try {
                await updateAppointmentPaidEventId(appointmentId, paidEventId);
            } catch (e) {
                console.error('Failed to store paidEventId for idempotency:', e);
            }

            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                // If another worker already stored this event, skip all side-effects.
                if (appointment.paidEventId && appointment.paidEventId !== paidEventId) {
                    console.log(`🔁 Skipping side-effects for ${appointmentId}. Different paidEventId already stored (${appointment.paidEventId}).`);
                    return res.status(200).send('Already processed');
                }

                // Update original payment message if exists
                if (appointment.paymentMessageId) {
                    try {
                        await bot.telegram.editMessageText(
                            appointment.telegramChatId,
                            appointment.paymentMessageId,
                            undefined,
                            `✅ *Payment Received!* 🦷\n\nThank you for completing the payment. Your appointment is confirmed shortly.`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (e) {
                        if (!isTelegramMessageNotModifiedError(e)) {
                            console.error('Failed to edit previous payment message:', e);
                        }
                    }
                }

                const confirmationMsg = `✅ *Payment Successful!*
Your appointment is now fully confirmed.

🆔 *Appointment ID:* ${appointment.appointmentId}
👤 *Patient Name:* ${appointment.patientName}
👨‍⚕️ *Doctor:* ${appointment.doctorName}
📅 *Date:* ${appointment.date}
🕒 *Time:* ${appointment.slot}

Thank you for choosing BrightCare Dental! See you at your appointment. 🦷`;

                // Update state to handle report upload
                const chatId = Number(appointment.telegramChatId);
                try {
                    const { setUserState } = await import('../bot/handlers.js');
                    setUserState(chatId, {
                        step: 'AWAITING_REPORT_CHOICE',
                        lastAppointmentId: appointmentId,
                        patientName: appointment.patientName
                    });
                } catch (e) {
                    console.error('Failed to update user state after payment:', e);
                }

                // Notify User with Message
                await bot.telegram.sendMessage(appointment.telegramChatId, confirmationMsg, { parse_mode: 'Markdown' });

                // Generate and Send Invoice PDF
                try {
                    const pdfBuffer = await generateInvoicePDF(appointment);
                    await bot.telegram.sendDocument(appointment.telegramChatId, {
                        source: pdfBuffer,
                        filename: `Invoice_${appointment.appointmentId}.pdf`
                    }, {
                        caption: "📄 Here is your appointment invoice. See you soon!"
                    });
                } catch (pdfError) {
                    console.error('Error sending invoice PDF:', pdfError);
                }

                // Ask for report using buttons
                setTimeout(() => {
                    bot.telegram.sendMessage(appointment.telegramChatId,
                        '📄 *One last thing:* Do you have any previous dental reports or X-rays to share with the doctor?',
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('✅ Yes', 'REPORT_YES'), Markup.button.callback('❌ No', 'REPORT_NO')]
                            ])
                        }
                    ).catch(e => console.error('Failed to send report choice message:', e));
                }, 1000);

                // Notify Admin (lead) via main bot (admin bot removed)
                const adminChatId = process.env.ADMIN_CHAT_ID;
                if (adminChatId) {
                    await bot.telegram.sendMessage(adminChatId, `🦷 *New Paid Appointment*\n\n${confirmationMsg}`, { parse_mode: 'Markdown' }).catch(e => console.error('Failed to notify admin of paid appointment:', e));
                }
            }
        } else if (event === 'payment_link.cancelled' || event === 'payment_link.expired') {
            const paymentLink = payload.payment_link.entity;
            const appointmentId = paymentLink.notes.appointmentId;
            await updateAppointmentStatus(appointmentId, 'Failed');

            // Notify Admin of Failure
            const appointment = await getAppointmentById(appointmentId);
            const adminChatId = process.env.ADMIN_CHAT_ID;
            if (adminChatId && appointment) {
                const statusLabel = event === 'payment_link.cancelled' ? '❌ Cancelled' : '⏰ Expired';
                await bot.telegram.sendMessage(adminChatId, `⚠️ *Payment ${statusLabel}*\n\nID: \`${appointmentId}\`\nPatient: ${appointment.patientName}\nDoctor: ${appointment.doctorName}`, { parse_mode: 'Markdown' }).catch(e => console.error('Failed to notify admin of payment failure:', e));
            }
        }

        res.status(200).send('OK');
    });

    return router;
}
