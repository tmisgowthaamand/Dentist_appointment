import { Telegraf, Context } from 'telegraf';
import { getAppointmentsToday, markReminderSent } from './googleSheets.js';
import { DateTime } from 'luxon';
export function setupReminderService(bot) {
    console.log('⏰ Reminder Service Initialized (Checking every 15 minutes)');
    // Check every 15 minutes
    setInterval(async () => {
        try {
            console.log('🔍 Checking for upcoming appointments (3-hour window)...');
            const appointments = await getAppointmentsToday();
            const now = DateTime.now().setZone('Asia/Kolkata');
            for (const apt of appointments) {
                // Skip if reminder already sent or appointment failed
                if (apt.reminderSent || apt.paymentStatus === 'Failed')
                    continue;
                const parts = apt.slot.split(':');
                const hours = parseInt(parts[0] || '');
                const minutes = parseInt(parts[1] || '');
                if (isNaN(hours) || isNaN(minutes))
                    continue;
                const aptTime = DateTime.fromISO(apt.date, { zone: 'Asia/Kolkata' })
                    .set({ hour: hours, minute: minutes });
                // Calculate difference in hours
                const diff = aptTime.diff(now, 'hours').hours;
                // Send reminder if appointment is between 2.5 and 3.5 hours away
                if (diff > 0 && diff <= 3.1) {
                    const msg = `🔔 Reminder: Your appointment with *${apt.doctorName}* is in 3 hours at *${apt.slot}*! See you soon. 🦷`;
                    try {
                        await bot.telegram.sendMessage(apt.telegramChatId, msg, { parse_mode: 'Markdown' });
                        await markReminderSent(apt.appointmentId);
                        console.log(`✅ Reminder sent to ${apt.patientName} for ${apt.slot}`);
                    }
                    catch (err) {
                        console.error(`❌ Failed to send reminder to ${apt.telegramChatId}:`, err);
                    }
                }
            }
        }
        catch (error) {
            console.error('Error in Reminder Service:', error);
        }
    }, 15 * 60 * 1000); // 15 minutes
}
//# sourceMappingURL=reminders.js.map