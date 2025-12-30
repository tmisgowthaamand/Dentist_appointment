import { Telegraf, Context, Markup } from 'telegraf';
import { transcribeAudio, analyzeIntent, generateReply } from '../services/ai.js';
import { getDoctors, addAppointment, updateAppointmentStatus, getAppointmentsToday, getAppointmentById, getSlotCounts, getAppointmentsByChatId, updateAppointmentReport, updateAppointmentPaymentMessageId } from '../services/googleSheets.js';
import { createPaymentLink } from '../services/razorpay.js';
import { generateInvoicePDF } from '../services/invoice.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const userStates = {};
export function setupBotHandlers(bot, adminBot) {
    // Global Error Handling
    bot.catch((err, ctx) => {
        console.error(`Telegraf error for ${ctx.updateType}`, err);
        // Do not throw, just log to keep the bot alive
    });
    // Middleware to ensure user state exists
    bot.use(async (ctx, next) => {
        if (ctx.from) {
            if (!userStates[ctx.from.id]) {
                userStates[ctx.from.id] = { step: 'IDLE' };
            }
        }
        return next();
    });
    bot.start(async (ctx) => {
        const chatId = ctx.from.id;
        const firstName = ctx.from.first_name;
        userStates[chatId] = { step: 'IDLE' };
        const bannerPath = path.join(__dirname, '../../assets/banner.png');
        let welcomeMsg = `Hello *${firstName}*,\n`;
        welcomeMsg += `I am your *BrightCare Dental Appointment Booking Bot* 🦷. I can help you find specialists, check availability, and manage your visits.\n\n`;
        welcomeMsg += `🚀 *Commands:*\n`;
        welcomeMsg += `• /start - Start the booking flow\n`;
        welcomeMsg += `• /cancel - Manage or cancel appointments\n`;
        welcomeMsg += `• /help - Get assistance\n`;
        welcomeMsg += `• /about - Learn about our clinic\n`;
        welcomeMsg += `• /end - End session with a healthy tip\n\n`;
        welcomeMsg += `How can I help you today? You can type "Book" to start!`;
        if (fs.existsSync(bannerPath)) {
            await ctx.replyWithPhoto({ source: bannerPath }, {
                caption: welcomeMsg,
                parse_mode: 'Markdown'
            });
        }
        else {
            await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
        }
    });
    bot.command('help', (ctx) => {
        ctx.reply(`📖 *How to use this Bot*\n\n1. Type "Book" or use /start to begin.\n2. Provide patient details (Name, Age, Gender).\n3. Choose your Doctor and Time Slot.\n4. Select payment method.\n5. Receive your invoice instantly!\n\nUse /cancel if you need to remove an appointment.`, { parse_mode: 'Markdown' });
    });
    bot.command('about', (ctx) => {
        ctx.reply(`🏢 *About BrightCare Dental*\n\nWe provide state-of-the-art dental care with modern technology. Our specialists are available across various fields including:\n\n• Orthodontics\n• Pediatric Dentistry\n• Dental Surgery\n• General Dentistry\n\n📍 *Location:* Clinic Main Road, City Center\n📞 *Contact:* +91 98765-43210`, { parse_mode: 'Markdown' });
    });
    bot.command('end', (ctx) => {
        const chatId = ctx.from.id;
        userStates[chatId] = { step: 'IDLE' };
        let goodbyeMsg = `✅ *Session Ended*\n\n`;
        goodbyeMsg += `Thank you for visiting *BrightCare Dental*! 🦷\n\n`;
        goodbyeMsg += `If you want to book another appointment, type *Book* or use /start anytime.\n\n`;
        goodbyeMsg += `✨ *Tip:* Brush twice daily and floss once a day for healthy gums.`;
        ctx.reply(goodbyeMsg, { parse_mode: 'Markdown' });
    });
    // Handle Voice Messages
    bot.on('voice', async (ctx) => {
        const chatId = ctx.from.id;
        const fileId = ctx.message.voice.file_id;
        try {
            ctx.reply('Processing your voice note... 🎧');
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            const filePath = path.join(__dirname, `../../temp_${fileId}.ogg`);
            const response = await axios({
                method: 'GET',
                url: fileUrl.href,
                responseType: 'stream',
            });
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            const text = await transcribeAudio(filePath);
            fs.unlinkSync(filePath); // Clean up
            ctx.reply(`You said: "${text}"`);
            await handleTextMessage(ctx, text);
        }
        catch (error) {
            console.error('Error handling voice:', error);
            ctx.reply('Sorry, I couldn\'t process your voice note.');
        }
    });
    // Handle Medical Report Uploads
    bot.on(['document', 'photo'], async (ctx) => {
        const chatId = ctx.from.id;
        const state = userStates[chatId];
        if (!state || state.step !== 'AWAITING_REPORT_UPLOAD' || !state.lastAppointmentId) {
            return;
        }
        if (!ctx.message)
            return;
        try {
            const appointmentId = state.lastAppointmentId;
            let fileId = '';
            let fileName = 'Report';
            const message = ctx.message;
            if ('document' in message && message.document) {
                fileId = message.document.file_id;
                fileName = message.document.file_name || 'Report.pdf';
            }
            else if ('photo' in message && message.photo && message.photo.length > 0) {
                // Get the highest resolution photo
                const photos = message.photo;
                const bestPhoto = photos[photos.length - 1];
                if (bestPhoto) {
                    fileId = bestPhoto.file_id;
                }
                fileName = `report_${Date.now()}.jpg`;
            }
            ctx.reply('💾 *Uploading your report to the doctor...*', { parse_mode: 'Markdown' });
            const fileUrl = await ctx.telegram.getFileLink(fileId);
            const reportPath = path.join(__dirname, `../../public/reports/${appointmentId}_${fileName}`);
            // Ensure directory exists
            const reportsDir = path.join(__dirname, '../../public/reports');
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            const response = await axios({
                method: 'GET',
                url: fileUrl.href,
                responseType: 'stream',
            });
            const writer = fs.createWriteStream(reportPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            // Update Google Sheet with the report link
            const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
            const publicLink = `${baseUrl}/reports/${appointmentId}_${fileName}`;
            await updateAppointmentReport(appointmentId, publicLink);
            state.step = 'IDLE';
            ctx.reply(`✅ *Report Successfully Attached!* 🦷\nYour doctor will review your history before your visit.`, { parse_mode: 'Markdown' });
            // Notify Admin via ADMIN BOT
            if (process.env.ADMIN_CHAT_ID) {
                await adminBot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `📄 *New Medical Report Uploaded*\n` +
                    `━━━━━━━━━━━━━━━\n` +
                    `👤 *Patient:* ${state.patientName}\n` +
                    `🔗 *Appointment ID:* \`${appointmentId}\`\n\n` +
                    `📥 *View:* [Open Report](${publicLink})\n\n` +
                    `💡 *Shortcut:* \`/history ${appointmentId}\``, { parse_mode: 'Markdown' }).catch(e => console.error('Failed to notify admin of report upload:', e));
            }
        }
        catch (error) {
            console.error('REPORT_UPLOAD_ERROR:', error);
            ctx.reply('❌ Sorry, I couldn\'t save your report. Please try again or bring the physical copy to the clinic.');
        }
    });
    // Handle Text Messages
    bot.on('text', async (ctx) => {
        await handleTextMessage(ctx, ctx.message.text);
    });
    async function handleTextMessage(ctx, text) {
        const chatId = ctx.from.id;
        const state = userStates[chatId];
        if (!state)
            return;
        try {
            if (state.step === 'IDLE') {
                const lowerText = text.toLowerCase();
                const bookingKeywords = ['book', 'appoint', 'doctor', 'pain', 'checkup', 'dentist', 'clinic', 'visit', 'slot', 'time'];
                const hasBookingIntent = bookingKeywords.some(kw => lowerText.includes(kw));
                if (hasBookingIntent) {
                    state.step = 'AWAITING_NAME';
                    state.language = 'English';
                    ctx.reply('Sure! I can help you book an appointment. 🦷\nWhat is the patient\'s name?');
                    return;
                }
                // If no clear intent, try AI
                try {
                    const analysis = await analyzeIntent(text);
                    state.language = analysis.language;
                    if (analysis.intent === 'BOOK_APPOINTMENT') {
                        state.step = 'AWAITING_NAME';
                        if (analysis.extractedInfo?.name) {
                            state.patientName = analysis.extractedInfo.name;
                            if (analysis.extractedInfo?.phone) {
                                state.phone = analysis.extractedInfo.phone;
                                if (analysis.extractedInfo?.age) {
                                    state.age = analysis.extractedInfo.age;
                                    if (analysis.extractedInfo?.gender) {
                                        state.gender = analysis.extractedInfo.gender;
                                        if (analysis.extractedInfo?.purpose) {
                                            state.purpose = analysis.extractedInfo.purpose;
                                            await proceedToDoctorSelection(ctx, state);
                                        }
                                        else {
                                            state.step = 'AWAITING_PURPOSE';
                                            ctx.reply('What is the purpose of your visit? (e.g., checkup, toothache)');
                                        }
                                    }
                                    else {
                                        state.step = 'AWAITING_GENDER';
                                        ctx.reply('Please select the patient\'s gender:', Markup.inlineKeyboard([
                                            [Markup.button.callback('Male', 'GENDER_Male'), Markup.button.callback('Female', 'GENDER_Female')],
                                            [Markup.button.callback('Other', 'GENDER_Other')]
                                        ]));
                                    }
                                }
                                else {
                                    state.step = 'AWAITING_AGE';
                                    ctx.reply('How old is the patient?');
                                }
                            }
                            else {
                                state.step = 'AWAITING_PHONE';
                                ctx.reply('Great! Please provide your phone number.');
                            }
                        }
                        else {
                            ctx.reply('Sure! I can help you book an appointment. What is the patient\'s name?');
                        }
                    }
                    else {
                        const reply = await generateReply(text, state.language || 'English', 'General inquiry.');
                        ctx.reply(reply);
                    }
                }
                catch (aiError) {
                    // Fail silently to the global catch block which handles 429/errors
                    throw aiError;
                }
            }
            else if (state.step === 'AWAITING_NAME') {
                state.patientName = text;
                state.step = 'AWAITING_PHONE';
                ctx.reply(`Got it, ${text}. Please provide your phone number.`);
            }
            else if (state.step === 'AWAITING_PHONE') {
                state.phone = text;
                state.step = 'AWAITING_AGE';
                ctx.reply('How old is the patient?');
            }
            else if (state.step === 'AWAITING_AGE') {
                state.age = text;
                state.step = 'AWAITING_GENDER';
                ctx.reply('Please select your gender:', Markup.inlineKeyboard([
                    [Markup.button.callback('Male', 'GENDER_Male'), Markup.button.callback('Female', 'GENDER_Female')],
                    [Markup.button.callback('Other', 'GENDER_Other')]
                ]));
            }
            else if (state.step === 'AWAITING_PURPOSE') {
                state.purpose = text;
                await proceedToDoctorSelection(ctx, state);
            }
        }
        catch (error) {
            console.error('Error handling text message:', error);
            if (error.status === 429) {
                // FALLBACK: Simple keyword detection to keep the bot working
                const lowerText = text.toLowerCase();
                const bookingKeywords = ['book', 'appoint', 'doctor', 'pain', 'checkup', 'dentist', 'clinic', 'visit', 'slot', 'time'];
                const isBooking = bookingKeywords.some(kw => lowerText.includes(kw));
                if (state.step === 'IDLE' && isBooking) {
                    state.step = 'AWAITING_NAME';
                    state.language = 'English';
                    ctx.reply('My AI connection is a bit busy, but I can still help you manually! 🦷\n\nLet\'s get started. What is the patient\'s name?');
                }
                else if (state.step === 'IDLE') {
                    ctx.reply('I am experiencing high traffic right now. 😅\n\nIf you want to book an appointment, just type "Book" or "Appointment"!');
                }
                else {
                    ctx.reply('I hit a slight speed bump, but I saved your info! Please try re-sending your last message to continue.');
                }
            }
            else {
                ctx.reply('Sorry, I encountered an error. Please try again later.');
            }
        }
    }
    async function proceedToDoctorSelection(ctx, state) {
        state.step = 'SELECTING_DOCTOR';
        try {
            const doctors = await getDoctors();
            if (doctors.length === 0) {
                ctx.reply('I\'m sorry, no doctors are currently listed in our clinic.');
                state.step = 'IDLE';
                return;
            }
            // Modern selection UI showing ALL doctors with status
            const doctorButtons = doctors.map(d => {
                const isAvailable = d.status === 'Available';
                const statusEmoji = isAvailable ? '🟢' : '🔴';
                const buttonText = `${statusEmoji} ${d.doctorName} [${d.specialty}]`;
                return [Markup.button.callback(buttonText, isAvailable ? `DOC_${d.doctorName}` : `UNAVAILABLE_${d.doctorName}`)];
            });
            ctx.reply('✨ *Our Expert Specialists* ✨\n\n🟢 = Available Now\n🔴 = Busy / In Surgery\n\nPlease choose an available doctor:', {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(doctorButtons)
            });
        }
        catch (error) {
            console.error('Error in proceedToDoctorSelection:', error);
            ctx.reply('Sorry, I couldn\'t fetch the doctor list. Please try again.');
        }
    }
    // Handle Callbacks (Doctor / Slot Selection)
    bot.on('callback_query', async (ctx) => {
        const chatId = ctx.from.id;
        const state = userStates[chatId];
        if (!state)
            return;
        const data = ctx.callbackQuery.data;
        if (data.startsWith('GENDER_')) {
            const gender = data.replace('GENDER_', '');
            state.gender = gender;
            state.step = 'AWAITING_PURPOSE';
            ctx.reply(`Got it. Finally, what is the purpose of your visit?`, Markup.inlineKeyboard([
                [Markup.button.callback('🦷 Tooth Pain', 'PURP_Tooth Pain')],
                [Markup.button.callback('😬 Braces Consultation', 'PURP_Braces Consultation')],
                [Markup.button.callback('⚒️ Tooth Extraction', 'PURP_Tooth Extraction')],
                [Markup.button.callback('👶 Child Dental Checkup', 'PURP_Child Dental Checkup')],
                [Markup.button.callback('🪥 Routine Cleaning', 'PURP_Routine Cleaning')]
            ]));
        }
        else if (data.startsWith('PURP_')) {
            const purpose = data.replace('PURP_', '');
            state.purpose = purpose;
            await proceedToDoctorSelection(ctx, state);
        }
        else if (data.startsWith('UNAVAILABLE_')) {
            const docName = data.replace('UNAVAILABLE_', '');
            ctx.answerCbQuery(`👨‍⚕️ ${docName} is currently busy with another patient. Please choose an available doctor.`, { show_alert: true });
        }
        else if (data.startsWith('DOC_')) {
            const docName = data.replace('DOC_', '');
            const doctors = await getDoctors();
            const doctor = doctors.find(d => d.doctorName === docName);
            if (doctor) {
                state.doctorName = doctor.doctorName;
                state.doctorId = doctor.doctorName; // Using name as ID
                state.step = 'SELECTING_SLOT';
                const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
                const slotCounts = await getSlotCounts(doctor.doctorName, today);
                const slotButtons = doctor.slots.map(s => {
                    const count = slotCounts[s] || 0;
                    const capacity = doctor.slotCapacities[s] || doctor.slotCapacities.default || 3;
                    const remaining = capacity - count;
                    if (remaining <= 0) {
                        return [Markup.button.callback(`🚫 ${s} (Full)`, `FULL_SLOT`)];
                    }
                    const capacityMsg = remaining === 1 ? 'Last slot!' : `${remaining} slots left`;
                    return [Markup.button.callback(`⏰ ${s} (${capacityMsg})`, `SLOT_${s}`)];
                });
                ctx.reply(`📅 *Availability for ${doctor.doctorName}*\nPlease select a preferred time slot:`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(slotButtons)
                });
            }
            else {
                ctx.reply('Sorry, I couldn\'t find that doctor. Please select again.');
                await proceedToDoctorSelection(ctx, state);
            }
        }
        else if (data === 'FULL_SLOT') {
            ctx.answerCbQuery('This slot is fully booked. Please choose another time.', { show_alert: true });
        }
        else if (data.startsWith('SLOT_')) {
            const slot = data.replace('SLOT_', '');
            state.slot = slot;
            state.step = 'SELECTING_PAYMENT_MODE';
            ctx.reply('💳 *Choose Payment Method*\n\n1. *Pay Online:* Confirm and pay now via UPI.\n2. *Pay at Clinic:* Pay on arrival at the front desk.', {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Pay Online (UPI)', 'PAY_Online')],
                    [Markup.button.callback('🏥 Pay at Clinic', 'PAY_Clinic')]
                ])
            });
        }
        else if (data === 'REPORT_YES') {
            state.step = 'AWAITING_REPORT_UPLOAD';
            ctx.reply('📂 *Great!* Please upload your report as a PDF or common image (JPG/PNG).', { parse_mode: 'Markdown' });
        }
        else if (data === 'REPORT_NO') {
            state.step = 'IDLE';
            ctx.reply('Understood! See you at the clinic. Have a healthy day! 🦷');
        }
        else if (data.startsWith('PAY_')) {
            const mode = data.replace('PAY_', '');
            state.paymentMode = mode;
            state.step = 'AWAITING_PAYMENT';
            const appointmentId = `APT${Date.now()}`;
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const appointment = {
                appointmentId,
                patientName: state.patientName || 'Unknown',
                phone: state.phone || 'Unknown',
                age: state.age || 'Unknown',
                gender: state.gender || 'Unknown',
                doctorName: state.doctorName || 'Not Specified',
                date: today,
                slot: state.slot || 'Not Specified',
                purpose: state.purpose || 'Not Specified',
                paymentStatus: mode === 'Clinic' ? 'Pending' : 'Pending', // Online starts pending
                paymentMode: mode,
                reminderSent: false,
                telegramChatId: chatId.toString(),
            };
            try {
                await addAppointment(appointment);
                if (mode === 'Online') {
                    const paymentLink = await createPaymentLink(appointment);
                    state.lastAppointmentId = appointmentId;
                    state.step = 'IDLE'; // Wait for webhook
                    const sentMsg = await ctx.reply(`Your appointment has been booked! 🦷\nPlease complete the payment of ₹100 using this link to confirm:\n\n${paymentLink.short_url}`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[Markup.button.url('💳 Pay Now', paymentLink.short_url)]])
                    });
                    if (sentMsg) {
                        try {
                            await updateAppointmentPaymentMessageId(appointmentId, sentMsg.message_id);
                        }
                        catch (e) {
                            console.error('Failed to save payment message ID:', e);
                        }
                    }
                }
                else {
                    const confirmationMsg = `✅ *Appointment Confirmed!*
Your slot is reserved under the **Pay at Clinic** option.

🆔 *Appointment ID:* ${appointment.appointmentId}
👨‍⚕️ *Doctor:* ${appointment.doctorName}
📅 *Date:* ${appointment.date}
⏰ *Time:* ${appointment.slot}

📌 *Note:* Please pay ₹100 at the front desk when you arrive. See you soon! 🦷`;
                    state.lastAppointmentId = appointmentId;
                    state.step = 'AWAITING_REPORT_CHOICE';
                    await ctx.reply(confirmationMsg, { parse_mode: 'Markdown' });
                    // Send Invoice for Clinic Pay
                    const pdfBuffer = await generateInvoicePDF(appointment);
                    await ctx.replyWithDocument({
                        source: pdfBuffer,
                        filename: `Appointment_${appointment.appointmentId}.pdf`
                    }, {
                        caption: "📄 Here is your booking confirmation. Show this at the clinic!"
                    });
                    // Ask for report
                    setTimeout(() => {
                        ctx.reply('📄 *One last thing:* Do you have any previous dental reports or X-rays to share with the doctor?', {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('✅ Yes', 'REPORT_YES'), Markup.button.callback('❌ No', 'REPORT_NO')]
                            ])
                        });
                    }, 1000);
                }
            }
            catch (error) {
                console.error('BOOKING_ERROR:', error);
                ctx.reply('❌ Sorry, something went wrong. Please try again.');
            }
        }
        ctx.answerCbQuery();
    });
    const isAdmin = (ctx) => {
        const adminIds = (process.env.ADMIN_CHAT_ID || '').split(',').map(id => id.trim());
        const userId = ctx.from?.id.toString() || '';
        return adminIds.includes(userId);
    };
    bot.command('today', async (ctx) => {
        if (!isAdmin(ctx))
            return;
        ctx.reply('📊 *Fetching Today\'s Schedule...*', { parse_mode: 'Markdown' });
        const appointments = await getAppointmentsToday();
        const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        if (appointments.length === 0) {
            ctx.reply(`📭 *No appointments scheduled for today (${today}).*`, { parse_mode: 'Markdown' });
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
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });
    bot.command('stats', async (ctx) => {
        if (!isAdmin(ctx))
            return;
        const appointments = await getAppointmentsToday(); // Re-using today's for now, but conceptual
        const total = appointments.length;
        const paid = appointments.filter(a => a.paymentStatus === 'Paid').length;
        const revenue = paid * 100; // Assuming ₹100 per booking
        const msg = `📈 *Booking Statistics (Today)*\n\n` +
            `👥 *Total Bookings:* ${total}\n` +
            `💰 *Total Revenue:* ₹${revenue}\n` +
            `💳 *Completion Rate:* ${total > 0 ? Math.round((paid / total) * 100) : 0}%\n\n` +
            `_Keep up the good work!_ 🦷`;
        ctx.reply(msg, { parse_mode: 'Markdown' });
    });
    bot.command('cancel', async (ctx) => {
        const chatId = ctx.from.id;
        const appointments = await getAppointmentsByChatId(chatId.toString());
        if (appointments.length === 0) {
            return ctx.reply('📭 You don\'t have any active appointments to cancel.');
        }
        let msg = '🦷 *Your Active Appointments*\nSelect one to cancel:\n\n';
        const buttons = appointments.map(apt => {
            return [Markup.button.callback(`❌ ${apt.date} at ${apt.slot} (${apt.doctorName})`, `CONFIRM_CANCEL_${apt.appointmentId}`)];
        });
        ctx.reply(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    });
    bot.action(/CONFIRM_CANCEL_(.+)/, async (ctx) => {
        const appointmentId = ctx.match[1];
        if (!appointmentId)
            return;
        try {
            const appointment = await getAppointmentById(appointmentId);
            if (!appointment)
                return ctx.reply('❌ Appointment not found.');
            await updateAppointmentStatus(appointmentId, 'Failed'); // Mark as Failed/Cancelled
            ctx.editMessageText(`✅ *Cancelled Successfully*\nYour appointment on ${appointment.date} at ${appointment.slot} has been removed.`, { parse_mode: 'Markdown' });
            // Notify Admin
            const adminChatId = process.env.ADMIN_CHAT_ID;
            if (adminChatId) {
                const adminMsg = `⚠️ *Cancellation Alert*\n\nPatient *${appointment.patientName}* has cancelled their appointment.\n\n📅 Date: ${appointment.date}\n⏰ Slot: ${appointment.slot}\n👨‍⚕️ Doctor: ${appointment.doctorName}\n🆔 ID: \`${appointment.appointmentId}\``;
                await ctx.telegram.sendMessage(adminChatId, adminMsg, { parse_mode: 'Markdown' }).catch(e => console.error('Failed to notify admin of cancellation:', e));
            }
        }
        catch (error) {
            console.error('Cancellation error:', error);
            ctx.reply('❌ Failed to cancel appointment. Please contact support.');
        }
    });
    bot.command('simulate_pay', async (ctx) => {
        if (!isAdmin(ctx))
            return;
        const text = ctx.message.text;
        const appointmentId = text.split(' ')[1];
        if (!appointmentId) {
            ctx.reply('Usage: /simulate_pay APT123456');
            return;
        }
        ctx.reply(`🔄 Simulating successful payment for ${appointmentId}...`);
        try {
            await updateAppointmentStatus(appointmentId, 'Paid');
            const appointment = await getAppointmentById(appointmentId);
            if (appointment) {
                const confirmationMsg = `✅ *Payment Successful (SIMULATED)!*
Your appointment is confirmed.

🆔 *Appointment ID:* ${appointment.appointmentId}
👤 *Patient Name:* ${appointment.patientName}
👨‍⚕️ *Doctor:* ${appointment.doctorName}

Thank you for choosing our clinic! 🦷`;
                // Notify User
                await bot.telegram.sendMessage(appointment.telegramChatId, confirmationMsg, { parse_mode: 'Markdown' });
                // Send PDF
                const pdfBuffer = await generateInvoicePDF(appointment);
                await bot.telegram.sendDocument(appointment.telegramChatId, {
                    source: pdfBuffer,
                    filename: `Invoice_${appointment.appointmentId}.pdf`
                }, {
                    caption: "📄 Here is your simulated appointment invoice."
                });
                ctx.reply(`✅ Simulation complete for ${appointment.patientName}. Invoice sent.`);
            }
            else {
                ctx.reply('❌ Could not find appointment with that ID.');
            }
        }
        catch (err) {
            console.error('Simulation error:', err);
            ctx.reply('❌ Simulation failed. Check logs.');
        }
    });
    bot.command('reschedule', async (ctx) => {
        if (!isAdmin(ctx))
            return;
        const text = ctx.message.text;
        const parts = text.split(' ');
        const appointmentId = parts[1];
        if (!appointmentId) {
            ctx.reply('Please provide an appointment ID. Usage: /reschedule APT123');
            return;
        }
        ctx.reply(`Please contact the patient for appointment ${appointmentId} to reschedule.`);
    });
}
export function getStateForUser(chatId) {
    return userStates[chatId];
}
export function setUserState(chatId, state) {
    userStates[chatId] = { ...(userStates[chatId] || { step: 'IDLE' }), ...state };
}
//# sourceMappingURL=handlers.js.map