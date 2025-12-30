import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

async function test(modelName: string) {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        await model.generateContent("test");
        console.log(`Model ${modelName} -> SUCCESS`);
        return true;
    } catch (e: any) {
        console.log(`Model ${modelName} -> FAILED: ${e.message}`);
        return false;
    }
}

async function run() {
    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-exp',
        'gemini-2.0-pro-exp',
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash-002',
        'gemini-1.5-pro-002'
    ];

    for (const m of models) {
        if (await test(m)) {
            console.log(`\nFound working combination: ${m}`);
            process.exit(0);
        }
    }
    console.log("\nNo working combination found.");
}

run();
