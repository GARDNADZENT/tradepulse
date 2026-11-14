import { classifyBotAlertForTpSl, triggerTpSlModal } from '@/components/tp-sl-modal';
import { observer as globalObserver } from '../../../utils/observer';
import TradeEngine from '../trade';
import getBotInterface from './BotInterface';
import getTicksInterface from './TicksInterface';
import getToolsInterface from './ToolsInterface';

const sleep = (observer, arg = 1) => {
    const isFast =
        typeof window !== 'undefined' && window.localStorage?.getItem('tp_fast_execution') === 'true';
    const delayMs = isFast ? Math.min(Math.max(Number(arg) || 0, 0) * 1000, 60) : arg * 1000;
    return new Promise(
        r =>
            // eslint-disable-next-line no-promise-executor-return
            setTimeout(() => {
                r();
                setTimeout(() => observer.emit('CONTINUE'), 0);
            }, delayMs),
        () => {}
    );
};

const Interface = $scope => {
    const tradeEngine = new TradeEngine($scope);
    const { observer } = $scope;
    const getInterface = () => {
        return {
            ...getBotInterface(tradeEngine),
            ...getToolsInterface(tradeEngine),
            getTicksInterface: getTicksInterface(tradeEngine),
            watch: (...args) => tradeEngine.watch(...args),
            sleep: (...args) => sleep(observer, ...args),
            alert: (...args) => {
                const rawMsg = args[0];
                const sessionRuns = Number(tradeEngine?.sessionRuns || 0);
                const sessionProfit = Number(tradeEngine?.sessionProfit || 0);
                const currency = tradeEngine?.accountInfo?.currency || 'USD';
                const kind = classifyBotAlertForTpSl(rawMsg, sessionProfit, sessionRuns);

                if (kind) {
                    triggerTpSlModal({
                        type: kind,
                        amount: sessionProfit,
                        currency,
                        source: 'dbot-alert',
                    });
                    return;
                }

                if (rawMsg !== undefined && rawMsg !== null && String(rawMsg).trim()) {
                    globalObserver.emit('Notify', ['info', String(rawMsg)]);
                }
            },
            prompt: (...args) => prompt(...args), // eslint-disable-line no-alert
            console: {
                log(...args) {
                    // eslint-disable-next-line no-console
                    console.log(new Date().toLocaleTimeString(), ...args);
                },
            },
        };
    };
    return { tradeEngine, observer, getInterface };
};

export default Interface;
