import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import {
    buildRiskManagerAIBotXml,
    RISK_MANAGER_AI_BOTS,
} from '../ai-bot-presets';
import AIBots from '../ai-bots';

const mockLoadXmlIntoBotBuilder = jest.fn().mockResolvedValue(undefined);
const mockSetActiveTab = jest.fn();
const mockLoadStrategyToBuilder = jest.fn();

jest.mock('@/utils/ai-bot-xml-builder', () => ({
    loadXmlIntoBotBuilder: (...args: unknown[]) => mockLoadXmlIntoBotBuilder(...args),
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        dashboard: { setActiveTab: mockSetActiveTab },
        load_modal: { loadStrategyToBuilder: mockLoadStrategyToBuilder },
        run_panel: { is_running: false, onRunButtonClick: jest.fn() },
    }),
}));

describe('AI Bots (riskmanagers.site 7-card suite & XML engine)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders all 7 riskmanagers.site AI Bot cards with exact numbers, titles, descriptions, and accents', () => {
        render(<AIBots />);

        expect(screen.getByTestId('rm-ai-bots-page')).toBeInTheDocument();
        expect(screen.queryByText(/Multi-Market Scanner/i)).not.toBeInTheDocument();

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
        ];

        for (const item of expectedCards) {
            const cardEl = screen.getByTestId(`ai-bot-card-${item.num}`);
            expect(cardEl).toHaveClass(item.accent);
            expect(cardEl).toHaveTextContent(item.num);
            expect(cardEl).toHaveTextContent(item.title);
            expect(cardEl).toHaveTextContent(item.desc);
        }

        expect(screen.getAllByRole('button', { name: /Load AI Bot/i })).toHaveLength(7);
    });

    it('loads the selected AI Bot XML into Bot Builder when Load AI Bot is clicked', async () => {
        render(<AIBots />);

        const loadButtons = screen.getAllByRole('button', { name: /Load AI Bot/i });
        fireEvent.click(loadButtons[3]); // Card 04: Over 2 Recovery -> Even-Odd

        await waitFor(() => {
            expect(mockLoadXmlIntoBotBuilder).toHaveBeenCalledTimes(1);
        });

        const payload = mockLoadXmlIntoBotBuilder.mock.calls[0][0] as {
            name: string;
            xml: string;
            runNow: boolean;
        };
        expect(payload.name).toBe('Over 2 Recovery → Even–Odd');
        expect(payload.runNow).toBe(false);
        expect(payload.xml).toContain('type="ai_purchase_barrier"');
        expect(payload.xml).toContain('type="last_digits_condition"');
    });

    it('generates valid, conflict-free Blockly XML with declared variables and purchase blocks for all 7 bots', () => {
        const recognizedPurchaseTypes = new Set([
            'purchase',
            'mon_purchase',
            'apollo_purchase',
            'apollo_purchase2',
            'ai_purchase_barrier',
        ]);

        for (const bot of RISK_MANAGER_AI_BOTS) {
            const xml = buildRiskManagerAIBotXml(bot.id);
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            expect(doc.querySelector('parsererror')).toBeNull();

            // Verify all block & shadow IDs are strictly unique
            const seenIds = new Set<string>();
            doc.querySelectorAll('block, shadow').forEach(el => {
                const id = el.getAttribute('id');
                expect(id).toBeTruthy();
                expect(seenIds.has(id!)).toBe(false);
                seenIds.add(id!);
            });

            // Verify every variable reference is declared in <variables>
            const declaredVarIds = new Set<string>();
            doc.querySelectorAll('variables > variable').forEach(v => {
                const vid = v.getAttribute('id');
                if (vid) declaredVarIds.add(vid);
            });
            doc.querySelectorAll('field[name="VAR"]').forEach(f => {
                const vid = f.getAttribute('id');
                expect(declaredVarIds.has(vid || '')).toBe(true);
            });

            // Verify mandatory DBot root & purchase blocks exist
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
