import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import {
    AI_SCANNER_MARKETS,
    buildRiskManagerAIBotXml,
    evaluateAIScannerMarket,
    RISK_MANAGER_AI_BOTS,
} from '../ai-bot-presets';
import AIBots from '../ai-bots';

const mockExecuteLiveDerivTrade = jest.fn();
const mockSetActiveTab = jest.fn();
const mockJournalPush = jest.fn();
const mockJournal = { pushMessage: mockJournalPush };
const mockPushVirtualTransaction = jest.fn();
const mockTransactions = { pushVirtualTransaction: mockPushVirtualTransaction };
const mockSummary = {};
const mockRunPanel = {};
let mockTickListener: ((symbol: string, tick: { t: number; price: number }) => void) | null = null;
let mockAccountSerial = 0;
let mockLoginId = '';

const mockTickBuffers: Record<string, Array<{ t: number; price: number }>> = {};

jest.mock('@/lib/deriv/tick-bus', () => ({
    derivBus: {
        subscribe: jest.fn(() => () => undefined),
        onTick: jest.fn((callback: (symbol: string, tick: { t: number; price: number }) => void) => {
            mockTickListener = callback;
            return () => { if (mockTickListener === callback) mockTickListener = null; };
        }),
        onHistory: jest.fn(() => () => undefined),
        getTicks: (sym: string) => mockTickBuffers[sym] || [],
        getPipSize: () => 2,
    },
}));

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        is_authorized: true,
    },
    MessageTypes: { NOTIFY: 'notify' },
}));

jest.mock('@/utils/ai-bot-xml-builder', () => ({
    executeLiveDerivTrade: (...args: unknown[]) => mockExecuteLiveDerivTrade(...args),
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        client: { is_logged_in: true, currency: 'USD', loginid: mockLoginId },
        dashboard: { setActiveTab: mockSetActiveTab },
        journal: mockJournal,
        transactions: mockTransactions,
        summary_card: mockSummary,
        run_panel: mockRunPanel,
    }),
}));

describe('AI Bots (8-card suite & in-page AI Scanner workspace)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTickListener = null;
        mockLoginId = `VRTC_TEST_${++mockAccountSerial}`;
        Object.keys(mockTickBuffers).forEach(k => delete mockTickBuffers[k]);
    });

    it('renders all 8 AI Bot cards with their numbers, titles, descriptions, and accents', () => {
        render(<AIBots />);

        expect(screen.getByTestId('rm-ai-bots-page')).toBeInTheDocument();

        const expectedCards = [
            {
                num: '01',
                title: 'Even–Odd AI',
                desc: 'All Even digits trigger Odd. All Odd digits trigger Even.',
                accent: 'rm-ai-bots__card--blue',
            },
            {
                num: '02',
                title: 'Over 4–Under 5 AI',
                desc: 'Digits below 4 trigger Over 4. Digits above 5 trigger Under 5.',
                accent: 'rm-ai-bots__card--teal',
            },
            {
                num: '03',
                title: 'Rise–Fall AI',
                desc: 'A rising run triggers Fall. A falling run triggers Rise.',
                accent: 'rm-ai-bots__card--purple',
            },
            {
                num: '04',
                title: 'Over 2 Recovery → Even–Odd',
                desc: 'The selected digit count below 2 triggers Over 2, followed by Even–Odd recovery after a loss.',
                accent: 'rm-ai-bots__card--amber',
            },
            {
                num: '05',
                title: 'Over 2 Recovery → Over 4–Under 5',
                desc: 'The selected digit count below 2 triggers Over 2, followed by range recovery after a loss.',
                accent: 'rm-ai-bots__card--amber',
            },
            {
                num: '06',
                title: 'Under 7 Recovery → Even–Odd',
                desc: 'The selected digit count above 7 triggers Under 7, followed by Even–Odd recovery after a loss.',
                accent: 'rm-ai-bots__card--pink',
            },
            {
                num: '07',
                title: 'Under 7 Recovery → Over 4–Under 5',
                desc: 'The selected digit count above 7 triggers Under 7, followed by range recovery after a loss.',
                accent: 'rm-ai-bots__card--pink',
            },
            {
                num: '08',
                title: 'Under 7 Recovery → Even–Odd Virtual',
                desc: 'After a real loss, simulate Even–Odd signals until a virtual loss, then resume real trading.',
                accent: 'rm-ai-bots__card--pink',
            },
        ];

        for (const item of expectedCards) {
            const cardEl = screen.getByTestId(`ai-bot-card-${item.num}`);
            expect(cardEl).toHaveClass(item.accent);
            expect(cardEl).toHaveTextContent(item.num);
            expect(cardEl).toHaveTextContent(item.title);
            expect(cardEl).toHaveTextContent(item.desc);
        }

        expect(screen.getAllByRole('button', { name: /Load AI Bot/i })).toHaveLength(8);
    });

    it('opens the in-page AI Scanner workspace when Load AI Bot is clicked without navigating to Bot Builder, and returns via Strategies', () => {
        mockTickBuffers.R_10 = [
            { t: 1001, price: 6332.09 },
            { t: 1002, price: 6332.19 },
            { t: 1003, price: 6332.29 },
            { t: 1004, price: 6332.39 },
            { t: 1005, price: 6332.49 },
        ];
        mockTickBuffers.R_25 = [
            { t: 1001, price: 2973.01 },
            { t: 1002, price: 2973.04 },
            { t: 1003, price: 2973.03 },
            { t: 1004, price: 2973.06 },
            { t: 1005, price: 2973.05 },
        ];

        render(<AIBots />);

        const loadButtons = screen.getAllByRole('button', { name: /Load AI Bot/i });
        fireEvent.click(loadButtons[0]); // Card 01: Even–Odd AI

        // Stays in AI Bots tab (never jumps to Bot Builder)
        expect(mockSetActiveTab).not.toHaveBeenCalled();

        // In-page AI Scanner workspace rendered
        expect(screen.getByTestId('rm-ai-scanner-workspace')).toBeInTheDocument();
        expect(screen.getByText('Scanner setup')).toBeInTheDocument();
        expect(screen.getByText('CONFIGURE ENTRY CONFIRMATION')).toBeInTheDocument();
        expect(screen.getByTestId('ai-scanner-toggle-btn')).toHaveTextContent('START AI SCANNER');
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('SCANNER IDLE');
        expect(screen.getByTestId('ai-scanner-trading-rule')).toHaveTextContent('TRADING RULE');
        expect(screen.getByText('Live market scan')).toBeInTheDocument();

        // All 10 Volatility markets rendered
        for (const m of AI_SCANNER_MARKETS) {
            expect(screen.getByTestId(`scanner-row-${m.symbol}`)).toHaveTextContent(m.label);
        }

        // R_10 has 5 odd digits (9,9,9,9,9) -> Trade Even + 1 SIGNAL READY
        expect(screen.getByTestId('scanner-row-R_10')).toHaveTextContent('Trade Even');
        expect(screen.getByTestId('scanner-row-R_10')).toHaveTextContent('Last 5 ticks matched');
        expect(screen.getByTestId('ai-scanner-signals-ready')).toHaveTextContent('1 SIGNAL READY');

        // R_25 is mixed -> Scanning + Initial · 5/5 checked
        expect(screen.getByTestId('scanner-row-R_25')).toHaveTextContent('Scanning');
        expect(screen.getByTestId('scanner-row-R_25')).toHaveTextContent('Initial · 5/5 checked');

        // Clicking <- Strategies returns to the card grid
        fireEvent.click(screen.getByRole('button', { name: /Strategies/i }));
        expect(screen.getByTestId('rm-ai-bots-page')).toBeInTheDocument();
    });

    it('executes live automated trades and transitions into cross-strategy recovery after a loss', async () => {
        mockTickBuffers.R_10 = [
            { t: 2001, price: 6332.10 },
            { t: 2002, price: 6332.21 },
        ];

        let capturedOnContractUpdate: ((poc: any, isTerminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            capturedOnContractUpdate = params.onContractUpdate;
            return { contractId: 9001, buyPrice: params.stake, payout: params.stake * 1.2, longcode: 'test' };
        });

        render(<AIBots />);

        // Open Card 04: Over 2 Recovery -> Even-Odd (default entryCount = 2, recoveryCount = 3)
        const loadButtons = screen.getAllByRole('button', { name: /Load AI Bot/i });
        fireEvent.click(loadButtons[3]);

        expect(screen.getByTestId('scanner-row-R_10')).toHaveTextContent('Trade Over 2');

        // Start AI Scanner -> fires initial DIGITOVER barrier 2 trade on R_10
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));

        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        });

        expect(mockExecuteLiveDerivTrade.mock.calls[0][0]).toMatchObject({
            symbol: 'R_10',
            contractType: 'DIGITOVER',
            barrier: 2,
            stake: 0.5,
            duration: 1,
            stores: expect.objectContaining({
                journal: expect.any(Object),
                transactions: expect.any(Object),
                summary_card: expect.any(Object),
                run_panel: expect.any(Object),
            }),
        });

        // Simulate contract loss (-0.50) -> switches to Recovery mode & updates Total P/L
        act(() => {
            capturedOnContractUpdate?.({ profit: -0.5 }, true);
        });

        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('RECOVERY SCANNING');
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Total P/L -0.50');
    });

    it('uses virtual recovery signals until a virtual loss, then waits for a new real signal', async () => {
        mockTickBuffers.R_10 = [{ t: 1000, price: 100.08 }, { t: 2000, price: 100.09 }];
        const settlements: Array<(poc: any, terminal: boolean) => void> = [];
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            settlements.push(params.onContractUpdate);
            return { contractId: 9000 + settlements.length, buyPrice: params.stake, payout: 1, longcode: 'test' };
        });
        const tick = (t: number, digit: number, sym = 'R_10') => {
            const item = { t, price: Number((100 + digit / 100).toFixed(2)) };
            mockTickBuffers[sym] = [...(mockTickBuffers[sym] || []), item];
            act(() => mockTickListener?.(sym, item));
        };
        render(<AIBots />);
        fireEvent.click(screen.getAllByRole('button', { name: /Load AI Bot/i })[7]);
        expect(screen.getByTestId('ai-scanner-trading-rule')).toHaveTextContent('Virtual results do not change real P/L');
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1));
        expect(mockExecuteLiveDerivTrade.mock.calls[0][0]).toMatchObject({ contractType: 'DIGITUNDER', barrier: 7, stake: 0.5 });

        act(() => settlements[0]({ profit: -0.5 }, true));
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Total P/L -0.50');

        tick(3000, 2); tick(4000, 4); tick(5000, 6); // Even streak → virtual Odd
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        expect(mockPushVirtualTransaction).not.toHaveBeenCalled();
        tick(6000, 1, 'R_25'); // other market must not settle the virtual contract
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        tick(6000, 1); // virtual Odd wins; stay virtual, no money wagered
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        expect(mockPushVirtualTransaction).toHaveBeenCalledTimes(1);
        expect(mockPushVirtualTransaction).toHaveBeenCalledWith({
            display_name: 'Volatility 10 Index', underlying_symbol: 'R_10', contract_type: 'DIGITODD',
            entry_spot: '100.06', exit_spot: '100.01', currency: 'USD', outcome: 'won',
        }, mockLoginId);
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Total P/L -0.50');

        tick(7000, 2); tick(8000, 4); tick(9000, 6); // next virtual Odd
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        tick(10000, 3); // a second virtual win must also remain virtual
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
        tick(11000, 2); tick(12000, 4); tick(13000, 6);
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        tick(14000, 8); // virtual Odd loses, but no real order on this settlement tick
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Wait for the next real recovery signal');
        expect(mockPushVirtualTransaction).toHaveBeenCalledTimes(3);
        expect(mockPushVirtualTransaction).toHaveBeenLastCalledWith(expect.objectContaining({
            entry_spot: '100.06', exit_spot: '100.08', outcome: 'lost',
        }), mockLoginId);
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        expect(mockJournalPush).toHaveBeenCalledWith(expect.stringContaining('[VIRTUAL]'), 'notify', '');
        tick(15000, 2); // new even streak → real Odd recovery, same martingale step as real loss
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(2));
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({ contractType: 'DIGITODD', stake: 1 });
        act(() => settlements[1]({ profit: 0.9 }, true));
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Total P/L +0.40');
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('SCANNER ACTIVE');
        tick(16000, 8); tick(17000, 9); // back to Under 7 at base stake
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(3));
        expect(mockExecuteLiveDerivTrade.mock.calls[2][0]).toMatchObject({ contractType: 'DIGITUNDER', barrier: 7, stake: 0.5 });
        act(() => settlements[2]({ profit: 0.2 }, true));
    });

    it('cancels pending virtual trades on stop and never places a real trade from their later ticks', async () => {
        mockTickBuffers.R_10 = [{ t: 1000, price: 100.08 }, { t: 2000, price: 100.09 }];
        let settle: ((poc: any, terminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            settle = params.onContractUpdate;
            return { contractId: 9001, buyPrice: params.stake, payout: 1, longcode: 'test' };
        });
        const tick = (t: number, digit: number) => {
            const item = { t, price: Number((100 + digit / 100).toFixed(2)) };
            mockTickBuffers.R_10.push(item);
            act(() => mockTickListener?.('R_10', item));
        };
        render(<AIBots />);
        fireEvent.click(screen.getAllByRole('button', { name: /Load AI Bot/i })[7]);
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1));
        act(() => settle?.({ profit: -0.5 }, true));
        tick(3000, 2); tick(4000, 4); tick(5000, 6);
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        tick(6000, 8); tick(7000, 2);
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('SCANNER IDLE');
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        expect(mockPushVirtualTransaction).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        tick(8000, 4); // next new tick triggers a new virtual Odd
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        tick(9000, 6); // virtual loss permits a later real signal
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        tick(10000, 8);
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(2));
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({ stake: 1, contractType: 'DIGITODD' });
        act(() => settle?.({ profit: 0.9 }, true));
    });

    it('blocks restart while a real contract remains unsettled', async () => {
        mockTickBuffers.R_10 = [{ t: 1000, price: 100.08 }, { t: 2000, price: 100.09 }];
        let settle: ((poc: any, terminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            settle = params.onContractUpdate;
            return { contractId: 9001, buyPrice: params.stake, payout: 1, longcode: 'test' };
        });
        render(<AIBots />);
        fireEvent.click(screen.getAllByRole('button', { name: /Load AI Bot/i })[7]);
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('still unsettled');
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        act(() => settle?.({ profit: -0.5 }, true));
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('SCANNER IDLE');
    });

    it('settles virtual trades using the configured tick duration', async () => {
        mockTickBuffers.R_10 = [{ t: 1000, price: 100.08 }, { t: 2000, price: 100.09 }];
        let settle: ((poc: any, terminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            settle = params.onContractUpdate;
            return { contractId: 9001, buyPrice: params.stake, payout: 1, longcode: 'test' };
        });
        const tick = (t: number, digit: number) => {
            const item = { t, price: Number((100 + digit / 100).toFixed(2)) };
            mockTickBuffers.R_10.push(item);
            act(() => mockTickListener?.('R_10', item));
        };
        render(<AIBots />);
        fireEvent.click(screen.getAllByRole('button', { name: /Load AI Bot/i })[7]);
        fireEvent.change(screen.getByLabelText('TICKS'), { target: { value: '2' } });
        fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
        await waitFor(() => expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1));
        expect(mockExecuteLiveDerivTrade.mock.calls[0][0].duration).toBe(2);
        act(() => settle?.({ profit: -0.5 }, true));
        tick(3000, 2); tick(4000, 4); tick(5000, 6);
        tick(6000, 8);
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL TRADE');
        expect(mockPushVirtualTransaction).not.toHaveBeenCalled();
        tick(7000, 1); // Odd wins on the second tick, not the first
        expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
        expect(mockPushVirtualTransaction).toHaveBeenCalledWith(expect.objectContaining({
            entry_spot: '100.06', exit_spot: '100.01', outcome: 'won',
        }), mockLoginId);
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
    });

    it('stops on a real settlement timeout, retains the lock, and resumes recovery after a late loss', async () => {
        mockTickBuffers.R_10 = [{ t: 1000, price: 100.08 }, { t: 2000, price: 100.09 }];
        let settle: ((poc: any, terminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            settle = params.onContractUpdate;
            return { contractId: 9001, buyPrice: params.stake, payout: 1, longcode: 'test' };
        });
        jest.useFakeTimers();
        try {
            render(<AIBots />);
            fireEvent.click(screen.getAllByRole('button', { name: /Load AI Bot/i })[7]);
            fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
            await act(async () => { jest.advanceTimersByTime(25000); });
            expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('settlement timed out');
            fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
            expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('still unsettled');
            act(() => settle?.({ profit: -0.5 }, true));
            fireEvent.click(screen.getByTestId('ai-scanner-toggle-btn'));
            expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
            expect(screen.getByTestId('ai-scanner-footer')).toHaveTextContent('Total P/L -0.50');
            // Duplicate or malformed late terminal updates cannot stop a restarted run.
            act(() => settle?.({}, true));
            expect(screen.getByTestId('ai-scanner-status-pill')).toHaveTextContent('VIRTUAL SCANNING');
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('evaluates all 7 scanner strategies accurately across Initial and Recovery modes', () => {
        const makeTicks = (decimals: number[]) =>
            decimals.map((d, idx) => ({ t: 1000 + idx, price: Number((100 + d / 100).toFixed(2)) }));

        // 01: Even-Odd AI
        expect(
            evaluateAIScannerMarket({
                botId: 'even-odd-ai',
                rawTicks: makeTicks([2, 4, 6, 8, 0]),
                pipSize: 2,
                entryCount: 5,
                recoveryCount: 5,
                inRecovery: false,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITODD', actionLabel: 'Trade Odd' });

        // 02: Over 4-Under 5 AI
        expect(
            evaluateAIScannerMarket({
                botId: 'over4-under5-ai',
                rawTicks: makeTicks([1, 2, 3]),
                pipSize: 2,
                entryCount: 3,
                recoveryCount: 3,
                inRecovery: false,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITOVER', barrier: 4, actionLabel: 'Trade Over 4' });

        // 03: Rise-Fall AI (4 rising moves -> Trade Fall)
        expect(
            evaluateAIScannerMarket({
                botId: 'rise-fall-ai',
                rawTicks: [
                    { t: 1, price: 100.01 },
                    { t: 2, price: 100.02 },
                    { t: 3, price: 100.05 },
                    { t: 4, price: 100.09 },
                    { t: 5, price: 100.14 },
                ],
                pipSize: 2,
                entryCount: 4,
                recoveryCount: 4,
                inRecovery: false,
            })
        ).toMatchObject({ matched: true, contractType: 'PUT', actionLabel: 'Trade Fall' });

        // 04: Over 2 Recovery -> Even-Odd (Initial vs Recovery)
        expect(
            evaluateAIScannerMarket({
                botId: 'over2-rec-evenodd',
                rawTicks: makeTicks([0, 1]),
                pipSize: 2,
                entryCount: 2,
                recoveryCount: 3,
                inRecovery: false,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITOVER', barrier: 2, actionLabel: 'Trade Over 2' });
        expect(
            evaluateAIScannerMarket({
                botId: 'over2-rec-evenodd',
                rawTicks: makeTicks([1, 3, 5]),
                pipSize: 2,
                entryCount: 2,
                recoveryCount: 3,
                inRecovery: true,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITEVEN', actionLabel: 'Trade Even' });

        // 07: Under 7 Recovery -> Over 4-Under 5 (Initial vs Recovery)
        expect(
            evaluateAIScannerMarket({
                botId: 'under7-rec-range',
                rawTicks: makeTicks([8, 9]),
                pipSize: 2,
                entryCount: 2,
                recoveryCount: 2,
                inRecovery: false,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITUNDER', barrier: 7, actionLabel: 'Trade Under 7' });
        expect(
            evaluateAIScannerMarket({
                botId: 'under7-rec-range',
                rawTicks: makeTicks([6, 8]),
                pipSize: 2,
                entryCount: 2,
                recoveryCount: 2,
                inRecovery: true,
            })
        ).toMatchObject({ matched: true, contractType: 'DIGITUNDER', barrier: 5, actionLabel: 'Trade Under 5' });
    });

    it('generates valid, conflict-free Blockly XML with declared variables and purchase blocks for all 7 bots', () => {
        const recognizedPurchaseTypes = new Set([
            'purchase',
            'mon_purchase',
            'apollo_purchase',
            'apollo_purchase2',
            'ai_purchase_barrier',
        ]);

        expect(() => buildRiskManagerAIBotXml('under7-rec-evenodd-virtual')).toThrow(/AI Scanner only/);
        for (const bot of RISK_MANAGER_AI_BOTS.filter(item => item.id !== 'under7-rec-evenodd-virtual')) {
            const xml = buildRiskManagerAIBotXml(bot.id);
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            expect(doc.querySelector('parsererror')).toBeNull();

            const seenIds = new Set<string>();
            doc.querySelectorAll('block, shadow').forEach(el => {
                const id = el.getAttribute('id');
                expect(id).toBeTruthy();
                expect(seenIds.has(id!)).toBe(false);
                seenIds.add(id!);
            });

            const declaredVarIds = new Set<string>();
            doc.querySelectorAll('variables > variable').forEach(v => {
                const vid = v.getAttribute('id');
                if (vid) declaredVarIds.add(vid);
            });
            doc.querySelectorAll('field[name="VAR"]').forEach(f => {
                const vid = f.getAttribute('id');
                expect(declaredVarIds.has(vid || '')).toBe(true);
            });

            const allBlockTypes = Array.from(doc.querySelectorAll('block')).map(b => b.getAttribute('type') || '');
            expect(allBlockTypes).toContain('trade_definition');
            expect(allBlockTypes).toContain('trade_definition_tradeoptions');
            expect(allBlockTypes).toContain('before_purchase');
            expect(allBlockTypes).toContain('after_purchase');
            expect(allBlockTypes.some(t => recognizedPurchaseTypes.has(t))).toBe(true);
        }
    });

    it('keeps barrier only on digit-barrier contracts and strips barrier/selected_tick on cross-type Even/Odd or Rise/Fall recovery', () => {
        const baseTradeOption = {
            amount: 1,
            basis: 'stake',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: '1HZ10V',
            prediction: 2,
            limit_order: {},
        };

        const overBuy = tradeOptionToBuy('DIGITOVER', baseTradeOption);
        expect(overBuy.parameters.barrier).toBe(2);
        expect(overBuy.parameters.selected_tick).toBeUndefined();

        const evenRecoveryBuy = tradeOptionToBuy('DIGITEVEN', baseTradeOption);
        expect(evenRecoveryBuy.parameters.barrier).toBeUndefined();
        expect(evenRecoveryBuy.parameters.selected_tick).toBeUndefined();

        const oddRecoveryBuy = tradeOptionToBuy('DIGITODD', baseTradeOption);
        expect(oddRecoveryBuy.parameters.barrier).toBeUndefined();
        expect(oddRecoveryBuy.parameters.selected_tick).toBeUndefined();

        const fallBuy = tradeOptionToBuy('PUT', baseTradeOption);
        expect(fallBuy.parameters.barrier).toBeUndefined();
        expect(fallBuy.parameters.selected_tick).toBeUndefined();
    });
});
