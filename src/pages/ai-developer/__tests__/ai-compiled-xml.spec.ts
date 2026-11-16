import { compileAIBotToXml } from '@/utils/ai-bot-xml-builder';
import { validateSpec } from '../ai-strategy-validation';

describe('AI compiled Blockly XML', () => {
    it('emits the reviewed contract, entry, risk and settlement blocks without auto-execution or virtual hook', () => {
        const spec = { name: 'Review Bot', symbol: '1HZ10V', contractType: 'DIGITUNDER', barrier: 4, recoveryBarrier: 3, durationTicks: 2, baseStake: 1.25, martingaleMultiplier: 2, takeProfit: 10, stopLoss: 20, entryFilter: 'EXACT_DIGIT', entryDigit: 5 };
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
});
