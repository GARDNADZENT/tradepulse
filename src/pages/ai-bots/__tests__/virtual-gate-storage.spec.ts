import { clearVirtualGate, readVirtualGate, writeVirtualGate } from '../virtual-gate-storage';

/**
 * Bot 08's gate must survive a reload: sessionStorage is the only state a page
 * reload keeps, and losing it let the bot resume recovery and buy real with zero
 * virtual losses (the reported bug).
 */
describe('AI Bot 08 virtual gate persistence', () => {
    const accountKey = 'VRTC_PERSIST';

    beforeEach(() => {
        window.sessionStorage.clear();
    });

    it('round-trips the gate so a reload can restore the owed virtual losses', () => {
        writeVirtualGate(accountKey, { virtualLossesRequired: 2, inRecovery: true, virtualLosses: 1 });
        expect(readVirtualGate(accountKey)).toEqual({
            virtualLossesRequired: 2,
            inRecovery: true,
            virtualLosses: 1,
        });
    });

    it('keeps gates separate per account', () => {
        writeVirtualGate('VRTC_A', { virtualLossesRequired: 2, inRecovery: true, virtualLosses: 1 });
        writeVirtualGate('VRTC_B', { virtualLossesRequired: 3, inRecovery: false, virtualLosses: 0 });
        expect(readVirtualGate('VRTC_A')?.virtualLossesRequired).toBe(2);
        expect(readVirtualGate('VRTC_B')?.virtualLossesRequired).toBe(3);
    });

    it('returns nothing for an account with no stored gate', () => {
        expect(readVirtualGate('VRTC_UNKNOWN')).toBeUndefined();
        expect(readVirtualGate('')).toBeUndefined();
    });

    it('ignores corrupt or nonsensical stored values instead of locking the bot', () => {
        window.sessionStorage.setItem(`tp_ai_bot08_virtual_gate:${accountKey}`, 'not json');
        expect(readVirtualGate(accountKey)).toBeUndefined();

        window.sessionStorage.setItem(
            `tp_ai_bot08_virtual_gate:${accountKey}`,
            JSON.stringify({ virtualLossesRequired: 0, inRecovery: true, virtualLosses: 1 })
        );
        expect(readVirtualGate(accountKey)).toBeUndefined();

        window.sessionStorage.setItem(
            `tp_ai_bot08_virtual_gate:${accountKey}`,
            JSON.stringify({ virtualLossesRequired: 2, inRecovery: true, virtualLosses: -1 })
        );
        expect(readVirtualGate(accountKey)).toBeUndefined();
    });

    it('clears the gate when the trader resets it', () => {
        writeVirtualGate(accountKey, { virtualLossesRequired: 2, inRecovery: true, virtualLosses: 2 });
        clearVirtualGate(accountKey);
        expect(readVirtualGate(accountKey)).toBeUndefined();
    });
});
