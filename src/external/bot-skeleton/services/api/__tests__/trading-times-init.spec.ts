import TradingTimes from '@/external/bot-skeleton/services/api/trading-times';

/**
 * `TradingTimes.initialise()` is the first await inside
 * `ActiveSymbols.retrieveActiveSymbols()`, so a failure here blocked the whole
 * startup gate. A throw used to leave `is_initialised = true` with a pending
 * `init_promise`, which meant every later attempt (including the user pressing
 * Retry) awaited a promise that could never settle.
 */
describe('TradingTimes.initialise failure recovery', () => {
    const makeInstance = () => {
        const instance = new TradingTimes({
            ws: null,
            server_time: { clone: () => ({ local: () => ({}) }) },
        });
        return instance;
    };

    it('stays retryable after a failed load', async () => {
        const instance = makeInstance();
        const failure = new Error('trading_times socket request failed');
        const load = jest.spyOn(instance, 'load').mockRejectedValueOnce(failure);

        await expect(instance.initialise()).rejects.toThrow('trading_times socket request failed');
        expect(instance.is_initialised).toBe(false);
        expect(instance.init_promise.isPending).toBe(true);

        // Second attempt: the retry must actually run the load again.
        load.mockImplementationOnce(async () => {
            instance.init_promise.resolve();
        });
        await instance.initialise();

        expect(load).toHaveBeenCalledTimes(2);
        expect(instance.is_initialised).toBe(true);
        expect(instance.init_promise.isPending).toBe(false);
    });

    it('reuses the pending promise for concurrent callers instead of loading twice', async () => {
        const instance = makeInstance();
        const load = jest.spyOn(instance, 'load').mockImplementationOnce(async () => {
            instance.init_promise.resolve();
        });

        const [first, second] = await Promise.all([instance.initialise(), instance.initialise()]);

        expect(load).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });
});
