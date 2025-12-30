export declare function transcribeAudio(filePath: string): Promise<string>;
export declare function analyzeIntent(text: string): Promise<{
    language: string;
    intent: 'BOOK_APPOINTMENT' | 'OTHER';
    extractedInfo?: {
        name?: string;
        phone?: string;
        age?: string;
        gender?: string;
        purpose?: string;
    };
}>;
export declare function generateReply(text: string, language: string, context: string): Promise<string>;
//# sourceMappingURL=ai.d.ts.map