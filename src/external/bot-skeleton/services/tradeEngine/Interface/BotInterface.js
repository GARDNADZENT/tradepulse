import { observer as globalObserver } from '../../../utils/observer';
import { createDetails } from '../utils/helpers';

const getBotInterface = tradeEngine => {
    const getDetail = i => {
        const contract = tradeEngine.data.contract;
        if (!contract || Object.keys(contract).length === 0) {
            return '';
        }
        return createDetails(contract)[i];
    };

    return {
        init: (...args) => tradeEngine.init(...args),
        start: (...args) => tradeEngine.start(...args),
        stop: (...args) => tradeEngine.stop(...args),
        purchase: contract_type => tradeEngine.purchase(contract_type),
        getAskPrice: contract_type => Number(getProposal(contract_type, tradeEngine).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type, tradeEngine).payout),
        getPurchaseReference: () => tradeEngine.getPurchaseReference(),
        isSellAvailable: () => tradeEngine.isSellAtMarketAvailable(),
        sellAtMarket: () => tradeEngine.sellAtMarket(),
        getSellPrice: () => getSellPrice(tradeEngine),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
        setVirtualHook: settings => {
            if (tradeEngine.vh_state && settings) {
                const startMode = settings.startMode === 'real' ? 'real' : 'virtual';
                if (typeof settings.enabled !== 'undefined') {
                    tradeEngine.vh_state.enabled = !!settings.enabled;
                    tradeEngine.vh_state.start_mode = startMode;
                    tradeEngine.vh_state.is_virtual = settings.enabled ? startMode === 'virtual' : false;
                    tradeEngine.vh_state.loss_count = 0;
                    tradeEngine.vh_state.virtual_win_count = 0;
                    tradeEngine.vh_state.real_loss_count = 0;
                    tradeEngine.vh_state.step_count = 0;
                    tradeEngine.vh_state.initial_stake = 0;
                    tradeEngine.vh_state.current_stake = 0;
                }
                if (typeof settings.enterAfterActualLosses !== 'undefined') {
                    tradeEngine.vh_state.enter_after_actual_losses = Math.max(
                        1,
                        Number(settings.enterAfterActualLosses) || 1
                    );
                }
                if (typeof settings.returnAfterVirtualWins !== 'undefined') {
                    tradeEngine.vh_state.return_after_virtual_wins = Math.max(
                        1,
                        Number(settings.returnAfterVirtualWins) || 1
                    );
                }
                if (typeof settings.threshold !== 'undefined')
                    tradeEngine.vh_state.threshold = Number(settings.threshold);
                if (typeof settings.martingaleFactor !== 'undefined')
                    tradeEngine.vh_state.martingaleFactor = Number(settings.martingaleFactor);
                if (typeof settings.maxSteps !== 'undefined')
                    tradeEngine.vh_state.maxSteps = Number(settings.maxSteps);
                if (typeof settings.minTradesOnReal !== 'undefined')
                    tradeEngine.vh_state.minTradesOnReal = Number(settings.minTradesOnReal);
                if (typeof settings.takeProfit !== 'undefined')
                    tradeEngine.vh_state.takeProfit = Number(settings.takeProfit);
                if (typeof settings.stopLoss !== 'undefined')
                    tradeEngine.vh_state.stopLoss = Number(settings.stopLoss);

                if (tradeEngine.vh_state.enabled) {
                    globalObserver.emit('ui.log.success', {
                        log_type: 'virtual_hook',
                        extra: {
                            event: 'configured',
                            mode: tradeEngine.vh_state.is_virtual ? 'VIRTUAL' : 'REAL',
                            enter_losses: tradeEngine.vh_state.enter_after_actual_losses,
                            return_wins: tradeEngine.vh_state.return_after_virtual_wins,
                        },
                    });
                }
            }
        },
        setJournalDigitWindow: count => {
            if (tradeEngine) {
                tradeEngine.journal_digit_window = Math.max(1, Math.min(10, Number(count) || 1));
            }
        },
        logBotCondition: (condition, digits, result, summary) => {
            if (tradeEngine && typeof tradeEngine.logBotCondition === 'function') {
                tradeEngine.logBotCondition(condition, digits, result, summary);
            }
        },
    };
};

const getProposal = (contract_type, tradeEngine) => {
    return tradeEngine.data.proposals.find(
        proposal =>
            proposal.contract_type === contract_type &&
            proposal.purchase_reference === tradeEngine.getPurchaseReference()
    );
};

const getSellPrice = tradeEngine => {
    return tradeEngine.getSellPrice();
};

export default getBotInterface;
