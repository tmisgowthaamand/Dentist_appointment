# Dentist Appointment Booking Bot 🦷

A production-ready Telegram Bot for Dentist Appointment Booking with Voice Support, Razorpay Payments, and Google Sheets integration.

## Features
- **Voice Support**: Send voice notes in English, Hindi, Tamil, or Telugu. Automatically transcribed using OpenAI Whisper.
- **AI Intent Detection**: Detects booking intentions and extracts names/phones using GPT-4o.
- **Dynamic Availability**: Fetches doctors and slots from Google Sheets.
- **Razorpay Integration**: Collects ₹100 appointment fee via Payment Links.
- **Admin Commands**: `/today`, `/cancel <id>`, `/reschedule <id>`.

## Tech Stack
- **Backend**: Node.js + TypeScript + Express
- **Bot Framework**: Telegraf
- **AI**: OpenAI (Whisper + GPT-4o)
- **Database**: Google Sheets API
- **Payments**: Razorpay API

## Setup Instructions

### 1. Requirements
- Node.js (v18+)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- OpenAI API Key
- Razorpay API Key & Secret
- Google Cloud Service Account (with Sheets API enabled)

### 2. Google Sheets Setup
1. Create a new Google Sheet.
2. Create two tabs: `Doctors` and `Appointments`.
3. **Doctors Tab** headers (Row 1):
   `doctorId`, `doctorName`, `slots`, `status`
   *Example:* `D1`, `Dr. Kumar`, `09:00, 10:00, 11:00`, `Available`
4. **Appointments Tab** headers (Row 1):
   `appointmentId`, `patientName`, `phone`, `language`, `doctorId`, `doctorName`, `slot`, `paymentStatus`, `telegramChatId`
5. Share the sheet with your Service Account Email (Editor access).

### 3. Environment Variables
Copy `.env.example` to `.env` and fill in the values:
- `TELEGRAM_BOT_TOKEN`: Your bot token.
- `OPENAI_API_KEY`: Your OpenAI key.
- `GOOGLE_SHEET_ID`: The ID from the sheet URL.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Your service account email.
- `GOOGLE_PRIVATE_KEY`: Your service account private key (include `\n`).
- `RAZORPAY_KEY_ID`: Razorpay key ID.
- `RAZORPAY_KEY_SECRET`: Razorpay key secret.
- `RAZORPAY_WEBHOOK_SECRET`: Secret for Razorpay webhooks.
- `ADMIN_CHAT_ID`: Your Telegram ID (get it from [@userinfobot](https://t.me/userinfobot)).
- `BASE_URL`: Public URL for webhooks (e.g., using `ngrok`).

### 4. Running the App
```bash
npm install
npm run dev
```

### 5. Webhook Setup (Razorpay)
1. Go to Razorpay Dashboard > Settings > Webhooks.
2. Add a new webhook:
   - URL: `https://your-domain.com/webhooks/razorpay-webhook`
   - Secret: Same as `RAZORPAY_WEBHOOK_SECRET` in `.env`.
   - Events: `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`.

## Folder Structure
- `src/index.ts`: Entry point.
- `src/bot/handlers.ts`: Telegram bot logic and state machine.
- `src/services/`: Integration with OpenAI, Google Sheets, and Razorpay.
- `src/webhooks/`: Express routes for Razorpay notifications.
- `src/types/`: TypeScript interfaces.
