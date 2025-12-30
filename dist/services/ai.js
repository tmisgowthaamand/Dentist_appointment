import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey.startsWith('AIzaSy') === false) {
    console.error('ERROR: GEMINI_API_KEY is missing or invalid in .env file.');
}
const genAI = new GoogleGenerativeAI(apiKey || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });
async function callWithRetry(fn, retries = 3, delay = 5000) {
    try {
        return await fn();
    }
    catch (error) {
        if (error.status === 429 && retries > 0) {
            console.log(`Rate limit hit. Retrying in ${delay / 1000}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callWithRetry(fn, retries - 1, delay + 5000);
        }
        throw error;
    }
}
export async function transcribeAudio(filePath) {
    try {
        const audioData = fs.readFileSync(filePath);
        const result = await callWithRetry(() => model.generateContent([
            "Transcribe this audio to text. Return only the transcription.",
            {
                inlineData: {
                    data: audioData.toString('base64'),
                    mimeType: 'audio/ogg',
                },
            },
        ]));
        return result.response.text();
    }
    catch (error) {
        console.error('Error transcribing audio with Gemini:', error);
        return '';
    }
}
export async function analyzeIntent(text) {
    const prompt = `You are an AI assistant for a Dentist Booking Bot.
    Detect the language (English, Hindi, Tamil, Telugu).
    Determine the intent: is the user trying to book an appointment?
    If they provide a name, phone number, age, gender (Male/Female/Other), or the reason/purpose for the visit (e.g., pain, checkup, cleaning), extract them.
    Return ONLY a JSON object:
    {
      "language": "string",
      "intent": "BOOK_APPOINTMENT" | "OTHER",
      "extractedInfo": { "name": "string", "phone": "string", "age": "string", "gender": "string", "purpose": "string" }
    }
    
    User text: "${text}"`;
    try {
        console.log('Analyzing intent for:', text);
        const result = await callWithRetry(() => model.generateContent(prompt));
        const responseText = result.response.text();
        console.log('Gemini Intent Response:', responseText);
        const jsonMatch = responseText.match(/\{.*\}/s);
        return JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    }
    catch (error) {
        console.error('Error analyzing intent with Gemini:', error);
        throw error;
    }
}
export async function generateReply(text, language, context) {
    const prompt = `You are a helpful Dentist Receptionist Bot.
    Respond in the user's language: ${language}.
    Current context: ${context}.
    Keep the response professional, short, and friendly.
    
    User message: "${text}"`;
    try {
        console.log('Generating reply for:', text);
        const result = await callWithRetry(() => model.generateContent(prompt));
        const reply = result.response.text();
        console.log('Gemini Reply:', reply);
        return reply;
    }
    catch (error) {
        console.error('Error generating reply with Gemini:', error);
        throw error;
    }
}
//# sourceMappingURL=ai.js.map