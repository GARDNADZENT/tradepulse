import type { AIBotSpec } from '@/utils/ai-bot-xml-builder';
export type AIStrategy = Required<Pick<AIBotSpec, 'name' | 'symbol' | 'contractType' | 'barrier' | 'recoveryBarrier' | 'durationTicks' | 'baseStake' | 'martingaleMultiplier' | 'takeProfit' | 'stopLoss' | 'entryFilter' | 'entryDigit'>>;
export function validateSpec(value: unknown): value is AIStrategy;
export function validateAnswer(value: unknown): value is { reply: string; spec: AIStrategy | null };
export function sensitive(value: string): boolean;
