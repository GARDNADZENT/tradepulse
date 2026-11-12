import { getRoundedNumber } from '@/components/shared';
import { api_base } from '../../api/api-base';
import { contract as broadcastContract, contractStatus } from '../utils/broadcast';
import { openContractReceived, sell } from './state/actions';

export default Engine =>
    class OpenContract extends Engine {
        observeOpenContract() {
            if (!api_base.api) return;
            const subscription = api_base.api.onMessage().subscribe(msg => {
                const data = msg?.data;
                if (!data) return;
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;

                    if (!contract || !this.expectedContractId(contract?.contract_id)) {
                        return;
                    }

                    // Multi-leg simultaneous hedge settlement tracking
                    if (this.expectedHedgeIds && this.expectedHedgeIds.size > 0 && this.expectedHedgeIds.has(contract.contract_id)) {
                        broadcastContract({ accountID: api_base.account_info.loginid, ...contract });

                        if (Boolean(contract.is_sold)) {
                            this.expectedHedgeIds.delete(contract.contract_id);
                            if (!Array.isArray(this.hedgeSettledContracts)) {
                                this.hedgeSettledContracts = [];
                            }
                            this.hedgeSettledContracts.push(contract);

                            this.updateTotals(contract);
                            this.onRealContractSettled?.(contract);

                            if (this.expectedHedgeIds.size === 0) {
                                this.isSold = true;
                                this.contractId = '';
                                clearTimeout(this.transaction_recovery_timeout);

                                const settledLegs = this.hedgeSettledContracts;
                                const totalBuy = settledLegs.reduce((sum, c) => sum + Number(c.buy_price || 0), 0);
                                const totalSell = settledLegs.reduce((sum, c) => sum + Number(c.sell_price || 0), 0);
                                const combinedProfit = getRoundedNumber(totalSell - totalBuy, contract.currency);

                                this.data.contract = {
                                    ...contract,
                                    buy_price: totalBuy,
                                    sell_price: totalSell,
                                    profit: combinedProfit,
                                };
                                this.hedgeSettledContracts = [];

                                contractStatus({
                                    id: 'contract.sold',
                                    data: contract.transaction_ids?.sell,
                                    contract: this.data.contract,
                                });

                                if (this.afterPromise) {
                                    this.afterPromise();
                                }

                                this.store.dispatch(sell());
                            } else {
                                this.contractId = Array.from(this.expectedHedgeIds)[0] || '';
                            }
                        } else {
                            this.data.contract = contract;
                            this.store.dispatch(openContractReceived());
                        }
                        return;
                    }

                    this.setContractFlags(contract);

                    this.data.contract = contract;

                    broadcastContract({ accountID: api_base.account_info.loginid, ...contract });

                    if (this.isSold) {
                        this.contractId = '';
                        clearTimeout(this.transaction_recovery_timeout);
                        this.updateTotals(contract);
                        contractStatus({
                            id: 'contract.sold',
                            data: contract.transaction_ids.sell,
                            contract,
                        });

                        if (this.afterPromise) {
                            this.afterPromise();
                        }

                        this.onRealContractSettled?.(contract);

                        this.store.dispatch(sell());
                    } else {
                        this.store.dispatch(openContractReceived());
                    }
                }
            });
            api_base.pushSubscription(subscription);
        }

        waitForAfter() {
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

            this.isSold = Boolean(is_sold);
            this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
            this.isExpired = Boolean(is_expired);
            this.hasEntryTick = Boolean(entry_tick);
        }

        expectedContractId(contractId) {
            if (this.expectedHedgeIds && this.expectedHedgeIds.size > 0 && this.expectedHedgeIds.has(contractId)) {
                return true;
            }
            return this.contractId && contractId === this.contractId;
        }

        getSellPrice() {
            const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract;
            return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
        }
    };
