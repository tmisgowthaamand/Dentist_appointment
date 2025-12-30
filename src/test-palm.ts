import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

async function run() {
    const models = ['chat-bison-001', 'text-bison-001', 'embedding-001'];
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("test");
            console.log(`SUCCESS: ${m} works!`);
            process.exit(0);
        } catch (e: any) {
            console.log(`FAILED: ${m} -> ${e.message}`);
        }
    }
}

run();
