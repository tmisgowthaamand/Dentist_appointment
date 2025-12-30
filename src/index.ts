import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { setupBotHandlers } from './bot/handlers.js';
import { setupAdminBotHandlers } from './bot/adminHandlers.js';
import { setupRazorpayWebhook } from './webhooks/razorpay.js';
import { setupReminderService } from './services/reminders.js';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const bot = new Telegraf(token);
const adminToken = process.env.ADMIN_BOT_TOKEN || '';
const adminBot = adminToken ? new Telegraf(adminToken) : bot;

const pollingLocks: Array<{ fd: number; lockPath: string }> = [];

const isPidRunning = (pid: number): boolean => {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e: any) {
        if (e?.code === 'ESRCH') return false;
        return true;
    }
};

const tryAcquirePollingLock = (botToken: string, label: string, attempt = 0): boolean => {
    if (!botToken) return false;
    const hash = crypto.createHash('sha1').update(botToken).digest('hex');
    const lockPath = path.join(os.tmpdir(), `telegraf-polling-${hash}.lock`);
    try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeFileSync(fd, `${process.pid}\n${label}\n`);
        pollingLocks.push({ fd, lockPath });
        console.log(`Acquired Telegram polling lock (${label}). Lock file: ${lockPath}. PID: ${process.pid}`);
        return true;
    } catch (e: any) {
        if (e?.code === 'EEXIST') {
            let existingPid = NaN;
            let existingLabel = '';
            try {
                const contents = fs.readFileSync(lockPath, 'utf8');
                const [pidLine, labelLine] = contents.split(/\r?\n/);
                existingPid = parseInt((pidLine || '').trim(), 10);
                existingLabel = (labelLine || '').trim();
            } catch {
            }

            if (!isPidRunning(existingPid) && attempt < 1) {
                try {
                    fs.unlinkSync(lockPath);
                } catch {
                }
                return tryAcquirePollingLock(botToken, label, attempt + 1);
            }

            console.error(`Failed to acquire Telegram polling lock (${label}). Lock file: ${lockPath}. PID: ${Number.isFinite(existingPid) ? existingPid : 'unknown'} ${existingLabel ? `(${existingLabel})` : ''}`);
            return false;
        }
        throw e;
    }
};

const releasePollingLocks = () => {
    for (const lock of pollingLocks) {
        try {
            fs.closeSync(lock.fd);
        } catch {
        }
        try {
            fs.unlinkSync(lock.lockPath);
        } catch {
        }
    }
    pollingLocks.length = 0;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Middleware
// Middleware to capture raw body for webhook verification
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.static(path.join(__dirname, '../public')));

// Setup Patient and Admin Bot Handlers
setupBotHandlers(bot, adminBot);
if (adminToken) {
    setupAdminBotHandlers(adminBot as any);
}
setupReminderService(bot);

const razorpayRouter = setupRazorpayWebhook(bot, adminBot);
app.use('/webhooks', razorpayRouter);

// Redirect back to Telegram after payment
// Redirect back to Telegram after payment with a success page
app.get('/callback', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Payment Successful</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f4fdf4; color: #155724; }
                    .container { max-width: 400px; margin: auto; padding: 20px; border: 1px solid #c3e6cb; border-radius: 10px; background: white; }
                    h1 { color: #28a745; }
                    p { font-size: 18px; }
                    .btn { display: inline-block; padding: 10px 20px; background-color: #0088cc; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
                <script>
                    setTimeout(function() {
                        window.location.href = 'https://t.me/Dentist01Bot';
                    }, 3000);
                </script>
            </head>
            <body>
                <div class="container">
                    <h1>✅ Payment Successful!</h1>
                    <p>Your appointment is confirmed.</p>
                    <p>Redirecting you back to the bot...</p>
                    <a href="https://t.me/Dentist01Bot" class="btn">Return to Bot Now</a>
                </div>
            </body>
        </html>
    `);
});

// Start Patient Bot
if (token && token !== 'your_bot_token') {
    console.log('Launching Patient Bot...');
    const acquired = tryAcquirePollingLock(token, 'patient');
    if (!acquired) {
        console.error('Failed to launch Patient Bot: polling is already running for this token (another process is using getUpdates).');
    } else {
        bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => {
            bot.launch({ dropPendingUpdates: true }).then(() => {
                console.log('Patient Bot is running...');
            }).catch(err => {
                console.error('Failed to launch Patient Bot:', err.message);
            });
        }).catch(e => console.error('Failed to delete patient bot webhook:', e));
    }
}

// Start Admin Bot (separate bot token)
if (adminToken && adminToken !== 'your_bot_token') {
    console.log('Launching Admin Bot...');
    const acquired = tryAcquirePollingLock(adminToken, 'admin');
    if (!acquired) {
        console.error('Failed to launch Admin Bot: polling is already running for this token (another process is using getUpdates).');
    } else {
        (async () => {
            try {
                await adminBot.telegram.deleteWebhook({ drop_pending_updates: true });
            } catch (e) {
                console.error('Failed to delete admin bot webhook:', e);
            }

            try {
                await adminBot.telegram.getMe();
            } catch (e: any) {
                console.error('Admin bot token seems invalid or Telegram is unreachable:', e?.message || e);
            }

            try {
                await adminBot.launch({ dropPendingUpdates: true });
                console.log('Admin Bot is running...');
            } catch (e: any) {
                const msg = e?.response?.description || e?.message || String(e);
                console.error('Failed to launch Admin Bot:', msg);

                // Retry once for the common 409 conflict.
                if (msg.includes('409') || msg.includes('Conflict')) {
                    try {
                        await adminBot.telegram.deleteWebhook({ drop_pending_updates: true });
                    } catch {
                    }
                    await sleep(1000);
                    try {
                        await adminBot.launch({ dropPendingUpdates: true });
                        console.log('Admin Bot is running (after retry)...');
                        return;
                    } catch (e2: any) {
                        const msg2 = e2?.response?.description || e2?.message || String(e2);
                        console.error('Failed to launch Admin Bot after retry:', msg2);
                    }
                }
            }
        })();
    }
}

// Start Express Server
app.listen(PORT, () => {
    console.log(`Express server is listening on port ${PORT}`);
    console.log(`Webhook URL configured as: ${process.env.RAZORPAY_WEBHOOK_URL}`);
});

// Enable graceful stop
process.once('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    bot.stop('SIGINT');
    if (adminToken) adminBot.stop('SIGINT');
    releasePollingLocks();
});
process.once('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    bot.stop('SIGTERM');
    if (adminToken) adminBot.stop('SIGTERM');
    releasePollingLocks();
});

process.once('exit', releasePollingLocks);
process.once('beforeExit', releasePollingLocks);
