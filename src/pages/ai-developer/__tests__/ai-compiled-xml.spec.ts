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

});
