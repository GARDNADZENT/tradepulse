import { compileAIBotToXml } from '@/utils/ai-bot-xml-builder';
import { validateSpec } from '../ai-strategy-validation';

describe('AI compiled Blockly XML', () => {
    it('emits the reviewed contract, entry, risk and settlement blocks without auto-execution or virtual hook', () => {
        const spec = { name: 'Review Bot', symbol: '1HZ10V', contractType: 'DIGITUNDER', barrier: 4, recoveryBarrier: 3, durationTicks: 2, baseStake: 1.25, martingaleMultiplier: 2, takeProfit: 10, stopLoss: 20, entryFilter: 'EXACT_DIGIT', entryDigit: 5, virtualHook: null };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const xml = compileAIBotToXml({ ...spec, virtualHookEnabled: false });
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        const field = (id: string, name: string) => doc.querySelector(`#${id} > field[name="${name}"]`)?.textContent;
        expect(field('td_market', 'SYMBOL_LIST')).toBe('1HZ10V');
        expect(field('bp_purchase', 'PURCHASE_LIST')).toBe('DIGITUNDER');
        expect(field('n_pb', 'NUM')).toBe('4'); expect(field('n_pa', 'NUM')).toBe('3');
        expect(field('cond_ld_num', 'NUM')).toBe('5');
        expect(field('n_bs', 'NUM')).toBe('1.25'); expect(field('n_mg', 'NUM')).toBe('2');
        expect(field('n_tp', 'NUM')).toBe('10'); expect(field('n_sl', 'NUM')).toBe('20');
        expect(doc.querySelector('#ap_again')).not.toBeNull();
        expect(doc.querySelector('block[type="virtual_hook_config"]')).toBeNull();
    });
    it('compiles the confirmed Over 2 virtual-hook rule and real stake recovery into Blockly XML', () => {
        const spec = { name: 'Over 2 Virtual', symbol: '1HZ10V', contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 2, durationTicks: 1, baseStake: 2, martingaleMultiplier: 2.1, takeProfit: 15, stopLoss: 30, entryFilter: 'INSTANT', entryDigit: 0, virtualHook: { virtualLosses: 2, virtualWins: 1 } };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml({ ...spec, assistantVirtualHook: spec.virtualHook }), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('#init_ai_vh')?.getAttribute('type')).toBe('ai_virtual_either_config');
        expect(doc.querySelector('#init_ai_vh > field[name="LOSSES"]')?.textContent).toBe('2');
        expect(doc.querySelector('#init_ai_vh > field[name="WINS"]')?.textContent).toBe('1');
        expect(doc.querySelector('#n_bs > field')?.textContent).toBe('2');
        expect(doc.querySelector('#n_mg > field')?.textContent).toBe('2.1');
        expect(doc.querySelector('#n_tp > field')?.textContent).toBe('15');
        expect(doc.querySelector('#n_sl > field')?.textContent).toBe('30');
        expect(doc.querySelector('#bp_purchase > field')?.textContent).toBe('DIGITOVER');
        expect(doc.querySelector('#l_set_s #l_mul')).not.toBeNull();
    });


    it('compiles alternating even/odd streak rules into ordered conditional purchases', () => {
        const spec = {
            name: 'Even Odd Streak', symbol: '1HZ10V', contractType: 'DIGITODD', barrier: 0, recoveryBarrier: 0,
            durationTicks: 1, baseStake: 0.35, martingaleMultiplier: 1.2, takeProfit: 10, stopLoss: 20,
            entryFilter: 'INSTANT', entryDigit: 0, virtualHook: { virtualLosses: 2, virtualWins: 1 },
            rules: [
                { name: 'Odd after 3 even', when: { type: 'PARITY_STREAK', parity: 'EVEN', count: 3 }, contractType: 'DIGITODD' },
                { name: 'Even after 3 odd', when: { type: 'PARITY_STREAK', parity: 'ODD', count: 3 }, contractType: 'DIGITEVEN' },
            ],
        };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml({ ...spec, assistantVirtualHook: spec.virtualHook }), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('#bp_rules')?.getAttribute('type')).toBe('controls_if');
        expect(doc.querySelector('#bp_rules > mutation')?.getAttribute('elseif')).toBe('1');
        expect(doc.querySelector('#cond_rule_0 field[name="CONDITION"]')?.textContent).toBe('ALL_EVEN');
        expect(doc.querySelector('#cond_rule_0 #cond_rule_0_n field[name="NUM"]')?.textContent).toBe('3');
        expect(doc.querySelector('#cond_rule_1 field[name="CONDITION"]')?.textContent).toBe('ALL_ODD');
        expect(doc.querySelector('#bp_rule_buy_0 field[name="PURCHASE_LIST"]')?.textContent).toBe('DIGITODD');
        expect(doc.querySelector('#bp_rule_buy_1 field[name="PURCHASE_LIST"]')?.textContent).toBe('DIGITEVEN');
        expect(doc.querySelector('#td_tradetype field[name="TRADETYPE_LIST"]')?.textContent).toBe('evenodd');
        expect(doc.querySelector('#n_bs > field')?.textContent).toBe('0.35');
        expect(doc.querySelector('#n_mg > field')?.textContent).toBe('1.2');
        expect(doc.querySelector('#init_ai_vh > field[name="LOSSES"]')?.textContent).toBe('2');
        expect(doc.querySelector('#init_ai_vh > field[name="WINS"]')?.textContent).toBe('1');
        expect(doc.querySelector('#bp_purchase')).toBeNull();
    });
    it('compiles AND groups and barrier purchases for multi-rule strategies', () => {
        const spec = {
            name: 'Filtered Over', symbol: 'R_50', contractType: 'DIGITOVER', barrier: 5, recoveryBarrier: 5,
            durationTicks: 2, baseStake: 1, martingaleMultiplier: 2, takeProfit: 10, stopLoss: 20,
            entryFilter: 'INSTANT', entryDigit: 0, virtualHook: null,
            rules: [
                {
                    name: 'Two even and above five',
                    when: { type: 'ALL', of: [{ type: 'PARITY_STREAK', parity: 'EVEN', count: 2 }, { type: 'DIGIT_STREAK', op: 'GT', barrier: 5, count: 2 }] },
                    contractType: 'DIGITOVER', barrier: 5,
                },
                { name: 'Falling run', when: { type: 'TICK_RUN', direction: 'FALL', count: 3 }, contractType: 'DIGITUNDER', barrier: 4 },
            ],
        };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml(spec), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('#cond_rule_0_op1 field[name="OP"]')?.textContent).toBe('AND');
        expect(doc.querySelector('#cond_rule_0_0 field[name="CONDITION"]')?.textContent).toBe('ALL_EVEN');
        expect(doc.querySelector('#cond_rule_0_1 field[name="OP"]')?.textContent).toBe('GT');
        expect(doc.querySelector('#cond_rule_1 field[name="DIR"]')?.textContent).toBe('FALL');
        expect(doc.querySelector('#bp_rule_buy_0 > field[name="PURCHASE_LIST"]')?.textContent).toBe('DIGITOVER');
        expect(doc.querySelector('#bp_rule_buy_0 #bp_rule_buy_0_p field[name="NUM"]')?.textContent).toBe('5');
        expect(doc.querySelector('#bp_rule_buy_1 > field[name="PURCHASE_LIST"]')?.textContent).toBe('DIGITUNDER');
        expect(doc.querySelector('block[type="virtual_hook_config"]')).toBeNull();
    });

    it('compiles a simultaneous Rise + Fall hedge with both leg predictions', () => {
        const spec = {
            name: 'Rise Fall Hedge', symbol: '1HZ100V', contractType: 'CALL', barrier: 0, recoveryBarrier: 0,
            durationTicks: 3, baseStake: 0.35, martingaleMultiplier: 2, takeProfit: 2.8, stopLoss: 10,
            entryFilter: 'INSTANT', entryDigit: 0, virtualHook: { virtualLosses: 2, virtualWins: 1 },
            hedge: { secondContractType: 'PUT' },
        };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml({ ...spec, assistantVirtualHook: spec.virtualHook }), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('#bp_purchase')?.getAttribute('type')).toBe('purchase_hedge');
        expect(doc.querySelector('#bp_purchase > field[name="PURCHASE_LIST_1"]')?.textContent).toBe('CALL');
        expect(doc.querySelector('#bp_purchase > field[name="PURCHASE_LIST_2"]')?.textContent).toBe('PUT');
        expect(doc.querySelector('#bp_purchase #bp_pred_1_n > field')?.textContent).toBe('0');
        expect(doc.querySelector('#bp_purchase #bp_pred_2_n > field')?.textContent).toBe('0');
        expect(doc.querySelector('#td_tradetype field[name="TRADETYPE_LIST"]')?.textContent).toBe('callput');
        expect(doc.querySelector('#td_options > mutation')?.getAttribute('has_prediction')).toBe('false');
        expect(doc.querySelector('#td_options #shad_dur > field')?.textContent).toBe('3');
        expect(doc.querySelector('#init_ai_vh > field[name="LOSSES"]')?.textContent).toBe('2');
        expect(doc.querySelector('block[type="purchase"]')).toBeNull();
    });
    it('compiles a digit hedge with an explicit second barrier', () => {
        const spec = {
            name: 'Digit Hedge', symbol: '1HZ10V', contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 2,
            durationTicks: 1, baseStake: 1, martingaleMultiplier: 2, takeProfit: 5, stopLoss: 20,
            entryFilter: 'INSTANT', entryDigit: 0, virtualHook: null,
            hedge: { secondContractType: 'DIGITUNDER', secondBarrier: 7 },
        };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml(spec), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('#bp_purchase')?.getAttribute('type')).toBe('purchase_hedge');
        expect(doc.querySelector('#bp_purchase #bp_pred_1_n > field')?.textContent).toBe('2');
        expect(doc.querySelector('#bp_purchase #bp_pred_2_n > field')?.textContent).toBe('7');
        expect(doc.querySelector('#td_options > mutation')?.getAttribute('has_prediction')).toBe('true');
        expect(doc.querySelector('block[type="virtual_hook_config"]')).toBeNull();
    });

    it('compiles market rotation after the virtual hook configuration', () => {
        const spec = {
            name: 'Over 2 All Markets', symbol: '1HZ10V', contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 0,
            durationTicks: 1, baseStake: 2, martingaleMultiplier: 1.5, takeProfit: 10, stopLoss: 10,
            entryFilter: 'INSTANT', entryDigit: 0, virtualHook: { virtualLosses: 2, virtualWins: 1 },
            marketRotation: { everyTrades: 1, markets: ['1HZ10V', 'R_10', '1HZ25V'] },
        };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const doc = new DOMParser().parseFromString(compileAIBotToXml({ ...spec, assistantVirtualHook: spec.virtualHook }), 'application/xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        const rotation = doc.querySelector('#init_mr');
        expect(rotation?.getAttribute('type')).toBe('ai_market_rotation');
        expect(rotation?.querySelector('field[name="EVERY"]')?.textContent).toBe('1');
        expect(rotation?.querySelector('field[name="MARKETS"]')?.textContent).toBe('1HZ10V,R_10,1HZ25V');
        // The rotation block chains after the virtual hook config, not replacing it.
        expect(rotation?.parentElement?.tagName).toBe('next');
        expect(doc.querySelector('#init_ai_vh')?.parentElement?.querySelector('next > #init_mr')).toBe(rotation);
        expect(doc.querySelector('#bp_purchase > field[name="PURCHASE_LIST"]')?.textContent).toBe('DIGITOVER');
    });
    it('omits the rotation block for a single-market strategy', () => {
        const spec = { name: 'Single', symbol: 'R_50', contractType: 'DIGITEVEN', barrier: 0, recoveryBarrier: 0, durationTicks: 1, baseStake: 1, martingaleMultiplier: 1, takeProfit: 5, stopLoss: 10, entryFilter: 'INSTANT', entryDigit: 0, virtualHook: null };
        if (!validateSpec(spec)) throw new Error('Test spec failed validation');
        const xml = compileAIBotToXml(spec);
        expect(xml).not.toContain('ai_market_rotation');
    });
});
