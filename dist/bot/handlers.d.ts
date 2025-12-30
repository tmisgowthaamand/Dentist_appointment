import { Telegraf, Context } from 'telegraf';
import type { UserState } from '../types/index.js';
export declare function setupBotHandlers(bot: Telegraf<Context>, adminBot: Telegraf<Context>): void;
export declare function getStateForUser(chatId: number): UserState | undefined;
export declare function setUserState(chatId: number, state: Partial<UserState>): void;
//# sourceMappingURL=handlers.d.ts.map