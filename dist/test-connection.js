import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    key: GOOGLE_PRIVATE_KEY || '',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
async function checkSheet() {
    try {
        console.log('--- DIAGNOSTIC START ---');
        console.log('Spreadsheet ID:', GOOGLE_SHEET_ID);
        console.log('Service Email:', GOOGLE_SERVICE_ACCOUNT_EMAIL);
        const metadata = await sheets.spreadsheets.get({
            spreadsheetId: GOOGLE_SHEET_ID,
        });
        console.log('--- ACCESS SUCCESSFUL ---');
        console.log('Tabs Found:');
        metadata.data.sheets?.forEach(s => {
            console.log(`- ${s.properties?.title}`);
        });
        const appointmentsSheet = metadata.data.sheets?.find(s => s.properties?.title === 'Appointments');
        const doctorSheet = metadata.data.sheets?.find(s => s.properties?.title === 'Doctor');
        if (!appointmentsSheet)
            console.error('❌ Tab "Appointments" NOT FOUND!');
        if (!doctorSheet)
            console.error('❌ Tab "Doctor" NOT FOUND!');
        if (appointmentsSheet && doctorSheet) {
            console.log('✅ All required tabs are present and accessible.');
        }
    }
    catch (error) {
        console.error('❌ FAILED to access spreadsheet:', error.message);
        if (error.response) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}
checkSheet();
//# sourceMappingURL=test-connection.js.map