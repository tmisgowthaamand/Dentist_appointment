import { google } from 'googleapis';
import type { Doctor, Appointment } from '../types/index.js';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!GOOGLE_SHEET_ID || GOOGLE_SHEET_ID === 'your_sheet_id') {
    console.error('ERROR: GOOGLE_SHEET_ID is missing or has placeholder value in .env file.');
}

const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    key: GOOGLE_PRIVATE_KEY || '',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

function parsePaymentMeta(raw: unknown): { paymentMessageId?: number; paidEventId?: string } {
    if (typeof raw !== 'string') return {};
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const [msgIdPart, paidEventIdPart] = trimmed.split('|');
    const msgId = msgIdPart ? parseInt(msgIdPart.trim(), 10) : NaN;
    const paidEventId = paidEventIdPart ? paidEventIdPart.trim() : '';

    const out: { paymentMessageId?: number; paidEventId?: string } = {};
    if (Number.isFinite(msgId)) out.paymentMessageId = msgId;
    if (paidEventId) out.paidEventId = paidEventId;
    return out;
}

async function updateAppointmentPaymentMeta(appointmentId: string, meta: { paymentMessageId?: number; paidEventId?: string }) {
    if (!GOOGLE_SHEET_ID) return;
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Appointments!A2:O',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any[]) => row[11] === appointmentId);
    if (rowIndex === -1) return;

    const actualRowIndex = rowIndex + 2;
    const existing = parsePaymentMeta(rows[rowIndex]?.[14]);
    const paymentMessageId = meta.paymentMessageId ?? existing.paymentMessageId;
    const paidEventId = meta.paidEventId ?? existing.paidEventId;
    const cellValue = `${paymentMessageId ?? ''}${paidEventId ? `|${paidEventId}` : ''}`.trim();

    await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `Appointments!O${actualRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[cellValue]],
        },
    });
}

function parseSlotCapacities(raw: string): Record<string, number> {
    const capacities: Record<string, number> = { default: 3 };
    if (!raw) return capacities;

    // Case 1: Just a number (global limit)
    if (!isNaN(Number(raw.trim()))) {
        capacities.default = parseInt(raw.trim());
        return capacities;
    }

    // Case 2: Slot-specific like "09:00:2, 10:00:3"
    raw.split(',').forEach((part: string) => {
        const pair = part.trim().split(':');
        const first = pair[0];
        const second = pair[1];
        if (first !== undefined && second !== undefined) {
            const slot = first.trim();
            const cap = parseInt(second.trim());
            if (slot && !isNaN(cap)) {
                capacities[slot] = cap;
            }
        }
    });

    return capacities;
}

export async function getDoctors(): Promise<Doctor[]> {
    if (!GOOGLE_SHEET_ID) return [];
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Doctor!A1:E', // Fetching headers too
        });

        const rows = response.data.values || [];
        if (rows.length === 0) return [];

        const dataRows = rows.slice(1);

        return dataRows.map((row: any[]) => ({
            doctorId: row[0] || '',
            doctorName: row[0] || '',
            specialty: row[1] || '',
            slots: row[2] ? row[2].split(',').map((s: string) => s.trim()) : [],
            status: (row[3] as 'Available' | 'Not Available') || 'Available',
            slotCapacities: parseSlotCapacities(row[4] || ''), // Capacity in Column E
        }));
    } catch (error) {
        console.error('Error fetching doctors:', error);
        return [];
    }
}

export async function addAppointment(appointment: Appointment) {
    if (!GOOGLE_SHEET_ID) return;
    try {
        // Step 1: Find the first empty row (fill gaps if any)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A:A', // Check Column A
        });

        const rows = response.data.values || [];
        let nextRowIndex = rows.findIndex((row: any[] | undefined, index: number) => index > 0 && (!row || row.length === 0 || !row[0]));

        if (nextRowIndex === -1) {
            nextRowIndex = rows.length;
        }

        const nextRow = nextRowIndex + 1; // Convert to 1-based sheet row

        // Step 2: Write specific data to that row using update, not append
        await sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: `Appointments!A${nextRow}:N${nextRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [
                    [
                        appointment.patientName,    // A (0)
                        appointment.age,            // B (1)
                        appointment.gender,         // C (2)
                        appointment.phone,          // D (3)
                        appointment.doctorName,     // E (4)
                        appointment.date,           // F (5)
                        appointment.slot,           // G (6)
                        appointment.purpose,        // H (7)
                        appointment.paymentStatus,  // I (8)
                        appointment.paymentMode,    // J (9)
                        appointment.reminderSent ? 'YES' : 'NO', // K (10)
                        appointment.appointmentId,  // L (11)
                        appointment.telegramChatId, // M (12)
                        appointment.medicalReportLink || '', // N (13)
                    ],
                ],
            },
        });
    } catch (error) {
        console.error('Error adding appointment:', error);
        throw error;
    }
}

// Consolidated Request: Update entire appointment row (A-N)
export async function updateAppointmentDetails(appointment: Appointment) {
    if (!GOOGLE_SHEET_ID) return;
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:N',
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex((row: any[]) => row[11] === appointment.appointmentId); // Column L (ID)

        if (rowIndex !== -1) {
            const actualRowIndex = rowIndex + 2;
            await sheets.spreadsheets.values.update({
                spreadsheetId: GOOGLE_SHEET_ID,
                range: `Appointments!A${actualRowIndex}:N${actualRowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[
                        appointment.patientName,    // A
                        appointment.age,            // B
                        appointment.gender,         // C
                        appointment.phone,          // D
                        appointment.doctorName,     // E
                        appointment.date,           // F
                        appointment.slot,           // G
                        appointment.purpose,        // H
                        appointment.paymentStatus,  // I
                        appointment.paymentMode,    // J
                        appointment.reminderSent ? 'YES' : 'NO', // K
                        appointment.appointmentId,  // L
                        appointment.telegramChatId, // M
                        appointment.medicalReportLink || '' // N
                    ]],
                },
            });
        }
    } catch (error) {
        console.error('Error updating appointment details:', error);
    }
}

export async function updateAppointmentStatus(appointmentId: string, status: 'Paid' | 'Failed') {
    // Re-implemented to use the consolidated update for "A to N" consistency if needed, 
    // but for performance, we fetch, modify, and write back (to ensure row consistency as requested).
    const apt = await getAppointmentById(appointmentId);
    if (apt) {
        apt.paymentStatus = status;
        await updateAppointmentDetails(apt);
    }
}

export async function getAppointmentsToday(): Promise<Appointment[]> {
    if (!GOOGLE_SHEET_ID) return [];
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:O',
        });

        const rows = response.data.values || [];
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

        return rows
            .filter((row: any[]) => row[5] === today) // Column F is Date (index 5)
            .map((row: any[]) => ({
                patientName: row[0],
                age: row[1],
                gender: row[2],
                phone: row[3],
                doctorName: row[4],
                date: row[5],
                slot: row[6],
                purpose: row[7],
                paymentStatus: row[8],
                paymentMode: row[9] || 'Online',
                reminderSent: row[10] === 'YES', // Column K (10)
                appointmentId: row[11],         // Column L (11)
                telegramChatId: row[12],        // Column M (12)
                medicalReportLink: row[13],     // Column N (13)
                ...parsePaymentMeta(row[14]), // Column O (14)
            }));
    } catch (error) {
        console.error('Error fetching today\'s appointments:', error);
        return [];
    }
}

export async function getAppointmentById(appointmentId: string): Promise<Appointment | undefined> {
    if (!GOOGLE_SHEET_ID) return;
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:O',
        });

        const rows = response.data.values || [];
        const row = rows.find((r: any[]) => r[11] === appointmentId); // Column L (ID)

        if (row) {
            const paymentMeta = parsePaymentMeta(row[14]);
            return {
                patientName: row[0],
                age: row[1],
                gender: row[2],
                phone: row[3],
                doctorName: row[4],
                date: row[5],
                slot: row[6],
                purpose: row[7],
                paymentStatus: row[8],
                paymentMode: row[9] || 'Online',
                reminderSent: row[10] === 'YES',
                appointmentId: row[11],
                telegramChatId: row[12],
                medicalReportLink: row[13],
                ...paymentMeta,
            };
        }
    } catch (error) {
        console.error('Error fetching appointment by ID:', error);
    }
    return undefined;
}

export async function markReminderSent(appointmentId: string) {
    if (!GOOGLE_SHEET_ID) return;
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:O',
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex((row: any[]) => row[11] === appointmentId); // Column L (ID)

        if (rowIndex !== -1) {
            const actualRowIndex = rowIndex + 2;
            await sheets.spreadsheets.values.update({
                spreadsheetId: GOOGLE_SHEET_ID,
                range: `Appointments!K${actualRowIndex}`, // Column K (Reminder)
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['YES']],
                },
            });
        }
    } catch (error) {
        console.error('Error marking reminder sent:', error);
    }
}
export async function getSlotCounts(doctorName: string, date: string): Promise<Record<string, number>> {
    if (!GOOGLE_SHEET_ID) return {};
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:O',
        });

        const rows = response.data.values || [];
        const counts: Record<string, number> = {};

        rows.forEach((row: any[]) => {
            const rowDoctor = row[4];
            const rowDate = row[5];
            const rowSlot = row[6];
            const rowStatus = row[8];

            // Only count if it matches doctor, date and is NOT Failed
            if (rowDoctor === doctorName && rowDate === date && rowStatus !== 'Failed') {
                counts[rowSlot] = (counts[rowSlot] || 0) + 1;
            }
        });

        return counts;
    } catch (error) {
        console.error('Error fetching slot counts:', error);
        return {};
    }
}

export async function getAppointmentsByChatId(chatId: string): Promise<Appointment[]> {
    if (!GOOGLE_SHEET_ID) return [];
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Appointments!A2:O',
        });

        const rows = response.data.values || [];
        return rows
            .filter((row: any[]) => row[12] === chatId && row[8] !== 'Failed') // Column M is Chat ID, I is Status
            .map((row: any[]) => ({
                patientName: row[0],
                age: row[1],
                gender: row[2],
                phone: row[3],
                doctorName: row[4],
                date: row[5],
                slot: row[6],
                purpose: row[7],
                paymentStatus: row[8],
                paymentMode: row[9] || 'Online',
                reminderSent: row[10] === 'YES',
                appointmentId: row[11],
                telegramChatId: row[12],
                medicalReportLink: row[13],
                ...parsePaymentMeta(row[14]),
            }));
    } catch (error) {
        console.error('Error fetching appointments by chat ID:', error);
        return [];
    }
}
export async function updateAppointmentReport(appointmentId: string, reportLink: string) {
    const apt = await getAppointmentById(appointmentId);
    if (apt) {
        apt.medicalReportLink = reportLink;
        await updateAppointmentDetails(apt);
    }
}

export async function updateAppointmentPaymentMessageId(appointmentId: string, messageId: number) {
    await updateAppointmentPaymentMeta(appointmentId, { paymentMessageId: messageId });
}

export async function updateAppointmentPaidEventId(appointmentId: string, paidEventId: string) {
    await updateAppointmentPaymentMeta(appointmentId, { paidEventId });
}
