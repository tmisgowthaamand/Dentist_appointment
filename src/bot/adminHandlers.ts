import { Telegraf, Context, Markup } from 'telegraf';
import { getAppointmentsToday, getAppointmentById, updateAppointmentStatus } from '../services/googleSheets.js';
import { generateInvoicePDF } from '../services/invoice.js';

const authenticatedAdmins = new Set<string>();

const isAdmin = (ctx: Context) => {
    const adminIds = (process.env.ADMIN_CHAT_ID || '').split(',').map(id => id.trim());
    const userId = ctx.from?.id.toString() || '';
    return adminIds.includes(userId);
};

const sendAdminMenu = async (ctx: Context) => {
    const firstName = ctx.from?.first_name || 'Admin';
    const welcomeMsg = `Hello *${firstName}*,\n` +
        `I am your *BrightCare Dental Admin Dashboard Bot* 🏥. I help you manage clinic schedules, view patient reports, and track performance.\n\n` +
        `🚀 *Commands:*\n` +
        `• /today - View today\'s schedule\n` +
        `• /history - View medical reports\n` +
        `• /stats - Revenue & performance\n` +
        `• /cancel - Cancel an appointment\n` +
        `• /end - Logout & end session securely\n\n` +
        `How can I help you manage the clinic today?`;

    await ctx.replyWithPhoto(
        'https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=1000',
        {
            caption: welcomeMsg,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Today\'s Schedule', 'ADMIN_TODAY'), Markup.button.callback('📈 Statistics', 'ADMIN_STATS')],
                [Markup.button.callback('📖 View History', 'ADMIN_HISTORY_HELP')]
            ])
        }
    );

    await ctx.reply('Quick Menu:', Markup.keyboard([
        ['📊 Today\'s Schedule', '📈 Statistics'],
        ['📖 History Help', '🔚 Logout']
    ]).resize());
};

export function setupAdminBotHandlers(bot: Telegraf<Context>) {

    // Global Error Handling
    bot.catch((err: any, ctx) => {
        console.error(`Admin Bot error for ${ctx.updateType}`, err);
    });

    bot.start(async (ctx) => {
        try {
            const userId = ctx.from.id.toString();
            console.log(`Admin Bot Start - From ID: ${userId}, Env ID: ${process.env.ADMIN_CHAT_ID}`);

            if (!isAdmin(ctx)) {
                await ctx.reply(`❌ Access Denied.\n\nYour Telegram ID: \`${userId}\`\nThis ID is not authorized to use this Admin Bot.`);
                return;
            }

            if (authenticatedAdmins.has(userId)) {
                return await sendAdminMenu(ctx);
            }

            await ctx.reply('🔒 *Admin Dashboard Locked*\n\nPlease type the *Admin Password* below to unlock details:', { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in start handler:', err);
        }
    });

    // Handle Password Entry
    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id.toString();
        const text = ctx.message.text;

        if (isAdmin(ctx) && !authenticatedAdmins.has(userId)) {
            const password = process.env.ADMIN_PASSWORD || 'adminbot123';
            if (text === password) {
                authenticatedAdmins.add(userId);
                await ctx.reply('✅ *Authentication Successful!*', { parse_mode: 'Markdown' });
                await sendAdminMenu(ctx);
                const newCtx = Object.create(ctx);
                Object.defineProperty(newCtx, 'message', {
                    value: { ...ctx.message, text: '/today' },
                    writable: true
                });
                return (bot as any).handleContext(newCtx);
            } else {
                return await ctx.reply('❌ *Incorrect Password.* Please try again:');
            }
        }
        return next();
    });

    // Handle Button Clicks
    bot.action('ADMIN_TODAY', async (ctx) => {
        try {
            const userId = ctx.from?.id.toString() || '';
            if (!isAdmin(ctx) || !authenticatedAdmins.has(userId)) {
                await ctx.answerCbQuery('🔒 Authentication Required', { show_alert: true });
                return;
            }
            await ctx.answerCbQuery();
            const appointments = await getAppointmentsToday();
            const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

            if (appointments.length === 0) {
                return await ctx.reply(`📭 *No appointments scheduled for today (${today}).*`, { parse_mode: 'Markdown' });
            }

            const paid = appointments.filter(a => a.paymentStatus === 'Paid').length;
            const pending = appointments.length - paid;

            let msg = `🏥 *Daily Schedule - ${today}*\n`;
            msg += `━━━━━━━━━━━━━━━\n`;
            msg += `✅ *Paid:* ${paid}  |  ⏳ *Pending:* ${pending}\n`;
            msg += `━━━━━━━━━━━━━━━\n\n`;

            appointments.forEach((a, index) => {
                const statusEmoji = a.paymentStatus === 'Paid' ? '🟢' : '🟡';
                msg += `${index + 1}. ${statusEmoji} *${a.patientName}* (${a.age}/${a.gender})\n`;
                msg += `   ⏰ ${a.slot} | 👨‍⚕️ ${a.doctorName}\n`;
                msg += `   🔗 ID: \`${a.appointmentId}\`\n\n`;
            });

            await ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in ADMIN_TODAY action:', err);
        }
    });

    bot.action('ADMIN_STATS', async (ctx) => {
        try {
            const userId = ctx.from?.id.toString() || '';
            if (!isAdmin(ctx) || !authenticatedAdmins.has(userId)) {
                await ctx.answerCbQuery('🔒 Authentication Required', { show_alert: true });
                return;
            }
            await ctx.answerCbQuery();
            const appointments = await getAppointmentsToday();
            const total = appointments.length;
            const paid = appointments.filter(a => a.paymentStatus === 'Paid').length;
            const revenue = paid * 100;

            const msg = `📈 *Booking Statistics (Today)*\n\n` +
                `👥 *Total Bookings:* ${total}\n` +
                `💰 *Total Revenue:* ₹${revenue}\n` +
                `💳 *Completion Rate:* ${total > 0 ? Math.round((paid / total) * 100) : 0}%\n\n`;

            await ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in ADMIN_STATS action:', err);
        }
    });

    bot.action('ADMIN_HISTORY_HELP', async (ctx) => {
        try {
            const userId = ctx.from?.id.toString() || '';
            if (!isAdmin(ctx) || !authenticatedAdmins.has(userId)) {
                await ctx.answerCbQuery('🔒 Authentication Required', { show_alert: true });
                return;
            }
            await ctx.answerCbQuery();
            await ctx.reply('📖 To view a report, please type:\n`/history [ID]`\n\nExample: `/history APT1766821774259`', { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in ADMIN_HISTORY_HELP action:', err);
        }
    });

    // Handle Persistent Keyboard Clicks
    bot.hears('📊 Today\'s Schedule', (ctx) => {
        if (isAdmin(ctx) && authenticatedAdmins.has(ctx.from.id.toString())) {
            return (bot as any).handleContext(Object.assign(Object.create(ctx), { message: { text: '/today' } }));
        }
    });
    bot.hears('📈 Statistics', (ctx) => {
        if (isAdmin(ctx) && authenticatedAdmins.has(ctx.from.id.toString())) {
            return (bot as any).handleContext(Object.assign(Object.create(ctx), { message: { text: '/stats' } }));
        }
    });
    bot.hears('📖 History Help', (ctx) => {
        if (isAdmin(ctx) && authenticatedAdmins.has(ctx.from.id.toString())) {
            return (bot as any).handleContext(Object.assign(Object.create(ctx), { message: { text: '/history' } }));
        }
    });


    // Helper to check auth and notify user
    const checkAuth = async (ctx: Context): Promise<boolean> => {
        const userId = ctx.from?.id.toString() || '';
        if (!isAdmin(ctx)) return false; // Ignore random strangers
        if (!authenticatedAdmins.has(userId)) {
            await ctx.reply('🔒 *Admin Session Locked*\n\nPlease run /start and enter your password to access these details.', { parse_mode: 'Markdown' });
            return false;
        }
        return true;
    };

    bot.command('today', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;

            await ctx.reply('📊 *Fetching Today\'s Schedule...*', { parse_mode: 'Markdown' });

            const appointments = await getAppointmentsToday();
            const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

            if (appointments.length === 0) {
                await ctx.reply(`📭 *No appointments scheduled for today (${today}).*`, { parse_mode: 'Markdown' });
                return;
            }

            const paid = appointments.filter(a => a.paymentStatus === 'Paid').length;
            const pending = appointments.length - paid;

            let msg = `🏥 *Daily Schedule - ${today}*\n`;
            msg += `━━━━━━━━━━━━━━━\n`;
            msg += `✅ *Paid:* ${paid}  |  ⏳ *Pending:* ${pending}\n`;
            msg += `━━━━━━━━━━━━━━━\n\n`;

            appointments.forEach((a, index) => {
                const statusEmoji = a.paymentStatus === 'Paid' ? '🟢' : '🟡';
                msg += `${index + 1}. ${statusEmoji} *${a.patientName}* (${a.age}/${a.gender})\n`;
                msg += `   ⏰ ${a.slot} | 👨‍⚕️ ${a.doctorName}\n`;
                msg += `   🔗 ID: \`${a.appointmentId}\`\n\n`;
            });

            await ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in today command:', err);
        }
    });

    bot.command('history', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;
            const text = (ctx.message as any).text;
            const appointmentId = text.split(' ')[1];
            if (!appointmentId) {
                await ctx.reply('📖 *Usage:* /history APT123456\nExample: `/history APT1766821774259`', { parse_mode: 'Markdown' });
                return;
            }

            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                if (appointment.medicalReportLink) {
                    await ctx.reply(`📄 *Medical History for ${appointment.patientName}*\n\n🔗 [View Report](${appointment.medicalReportLink})\n\n_Patient: ${appointment.patientName}_\n_Doctor: ${appointment.doctorName}_`, { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(`📭 No medical report found for Appointment ID: \`${appointmentId}\``, { parse_mode: 'Markdown' });
                }
            } else {
                await ctx.reply('❌ Appointment not found. Please check the ID.');
            }
        } catch (err) {
            console.error('Error in history command:', err);
        }
    });

    bot.command('stats', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;

            const appointments = await getAppointmentsToday();
            const total = appointments.length;
            const paid = appointments.filter(a => a.paymentStatus === 'Paid').length;
            const revenue = paid * 100; // Assuming ₹100 per booking

            const msg = `📈 *Booking Statistics (Today)*\n\n` +
                `👥 *Total Bookings:* ${total}\n` +
                `💰 *Total Revenue:* ₹${revenue}\n` +
                `💳 *Completion Rate:* ${total > 0 ? Math.round((paid / total) * 100) : 0}%\n\n` +
                `_Keep up the good work!_ 🦷`;

            await ctx.reply(msg, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in stats command:', err);
        }
    });

    bot.command('cancel', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;
            const text = (ctx.message as any).text;
            const appointmentId = text.split(' ')[1];
            if (!appointmentId) {
                await ctx.reply('Please provide an appointment ID. Usage: /cancel APT123');
                return;
            }
            await updateAppointmentStatus(appointmentId, 'Failed');
            await ctx.reply(`✅ *Appointment ${appointmentId} has been cancelled.*`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in cancel command:', err);
        }
    });

    bot.command('simulate_pay', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;
            const text = (ctx.message as any).text;
            const appointmentId = text.split(' ')[1];
            if (!appointmentId) {
                await ctx.reply('Usage: /simulate_pay APT123456');
                return;
            }

            await ctx.reply(`🔄 Simulating successful payment for ${appointmentId}...`);

            await updateAppointmentStatus(appointmentId, 'Paid');
            const appointment = await getAppointmentById(appointmentId);

            if (appointment) {
                const confirmationMsg = `✅ *Payment Successful (SIMULATED)!*
Your appointment is confirmed.

🆔 *Appointment ID:* ${appointment.appointmentId}
👤 *Patient Name:* ${appointment.patientName}
👨‍⚕️ *Doctor:* ${appointment.doctorName}

Thank you for choosing our clinic! 🦷`;

                await ctx.reply(`✅ Simulation complete for ${appointment.patientName}. Invoice logic triggered.`);
            } else {
                await ctx.reply('❌ Could not find appointment with that ID.');
            }
        } catch (err) {
            console.error('Simulation error:', err);
            await ctx.reply('❌ Simulation failed. Check logs.');
        }
    });

    bot.command('status', async (ctx) => {
        try {
            if (!(await checkAuth(ctx))) return;
            const text = (ctx.message as any).text;
            const appointmentId = text.split(' ')[1];
            if (!appointmentId) {
                await ctx.reply('Usage: /status APT123456');
                return;
            }

            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                await ctx.reply(`🆔 *Appointment:* ${appointment.appointmentId}\n👤 *Patient:* ${appointment.patientName}\n🟢 *Status:* ${appointment.paymentStatus}`, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('❌ Appointment not found.');
            }
        } catch (err) {
            console.error('Error in status command:', err);
        }
    });

    bot.command('end', async (ctx) => {
        try {
            if (!isAdmin(ctx)) return;
            authenticatedAdmins.delete(ctx.from.id.toString());
            await ctx.reply('Admin session ended and logged out securely. See you later! 🏥', Markup.removeKeyboard());
        } catch (err) {
            console.error('Error in end command:', err);
        }
    });
}
