import type { AIBotSpec } from '@/utils/ai-bot-xml-builder';
export type AIStrategy = Required<Pick<AIBotSpec, 'name' | 'symbol' | 'contractType' | 'barrier' | 'recoveryBarrier' | 'durationTicks' | 'baseStake' | 'martingaleMultiplier' | 'takeProfit' | 'stopLoss' | 'entryFilter' | 'entryDigit'>> & { virtualHook: { virtualLosses: number; virtualWins: number } | null };
export function validateSpec(value: unknown): value is AIStrategy;
export function validateAnswer(value: unknown): value is { reply: string; spec: AIStrategy | null };
export function specProblem(value: unknown): string | null;
export function answerProblem(value: unknown): string | null;
export function sensitive(value: string): boolean;
