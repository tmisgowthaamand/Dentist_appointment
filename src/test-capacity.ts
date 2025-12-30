import { getDoctors } from './services/googleSheets.js';
import dotenv from 'dotenv';
dotenv.config();

async function testCapacity() {
    console.log('--- FETCHING DOCTOR DATA FROM GOOGLE SHEETS ---');
    const doctors = await getDoctors();

    if (doctors.length === 0) {
        console.log('No doctors found or error accessing sheet.');
        return;
    }

    doctors.forEach(d => {
        console.log(`Doctor: ${d.doctorName} | Slots: ${d.slots.join(', ')}`);
        console.log(`Capacities: ${JSON.stringify(d.slotCapacities)}`);
    });
}

testCapacity();
