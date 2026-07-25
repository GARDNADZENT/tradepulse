import { useState, useEffect, useRef, useCallback } from 'react';
import { onNewSystemMessage, sendViaNewSystem } from '@/auth/NewDerivAuth';

export interface SymbolInfo {
    display_name: string;
    symbol: string;
    pip_size: number;
}

export interface TickInfo {
    quote: number;
    epoch: number;
}

export interface ProposalInfo {
    askPrice: number;
    payout: number;
    id: string;
}

export interface BuyResult {
    contract_id: number;
    buyPrice: number;
    payout: number;
    balanceAfter: number;
}

export interface ContractPosition {
    contract_id: number;
    symbol: string;
    contract_type: string;
    buy_price: number;
    payout: number;
    is_sold: boolean;
    sell_price: number | null;
    profit: number | null;
    entry_tick: number | null;
    date_start: number;
}

export type TradeType = 'matches-differs' | 'over-under' | 'even-odd';
export type ContractMode = 'DIGITMATCH' | 'DIGITDIFF' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';

const VOLATILITY_SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];

function getDigit(price: number, pip: number): number {
    return Number(Number(price).toFixed(pip).slice(-1));
}

function computeDigitCounts(prices: number[], pipSize: number): number[] {
    const counts = Array(10).fill(0);
    prices.slice(-1000).forEach(p => {
        const d = getDigit(p, pipSize);
        if (d >= 0 && d <= 9) counts[d]++;
    });
    return counts;
}

export function useManualTrade() {
    const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
    const [activeSymbol, setActiveSymbol] = useState('R_100');
    const [currentTick, setCurrentTick] = useState<TickInfo | null>(null);
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [digitCounts, setDigitCounts] = useState<number[]>(Array(10).fill(0));
    const [digitTotal, setDigitTotal] = useState(0);
    const [pipSize, setPipSize] = useState(2);
    const [tradeType, setTradeTypeState] = useState<TradeType>('matches-differs');
    const [contractMode, setContractMode] = useState<ContractMode>('DIGITMATCH');
    const [selectedDigit, setSelectedDigit] = useState(5);
    const [stake, setStake] = useState('10');
    const [duration, setDuration] = useState(5);
    const [proposal, setProposal] = useState<ProposalInfo | null>(null);
    const [isProposalLoading, setIsProposalLoading] = useState(false);
    const [isBuying, setIsBuying] = useState(false);
    const [buyResult, setBuyResult] = useState<BuyResult | null>(null);
    const [buyError, setBuyError] = useState<string | null>(null);
    const [positions, setPositions] = useState<ContractPosition[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error] = useState<string | null>(null);

    const subIdRef = useRef<string | null>(null);
    const proposalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    const pipRef = useRef(pipSize);
    const pricesRef = useRef<number[]>([]);

    pipRef.current = pipSize;

    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    // Subscribe to WS messages
    useEffect(() => {
        const unsub = onNewSystemMessage((event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.msg_type === 'tick' && data.tick) {
                    const quote = Number(data.tick.quote);
                    if (!isNaN(quote)) {
                        setCurrentTick({ quote, epoch: data.tick.epoch });
                        setLastDigit(getDigit(quote, pipRef.current));
                        pricesRef.current = [...pricesRef.current.slice(-999), quote];
                        if (pricesRef.current.length > 0) {
                            setDigitCounts(computeDigitCounts(pricesRef.current, pipRef.current));
                        }
                    }
                    return;
                }
                if (data.msg_type === 'history' && data.history?.prices) {
                    const p = data.history.prices.map(Number).filter((v: number) => !isNaN(v));
                    if (p.length > 0) {
                        pricesRef.current = p;
                        setDigitCounts(computeDigitCounts(p, pipRef.current));
                        setDigitTotal(p.length);
                        const sid = data.subscription?.id;
                        if (sid) subIdRef.current = sid;
                    }
                    return;
                }
                if (data.msg_type === 'proposal') {
                    setIsProposalLoading(false);
                    setProposal(data.proposal ? {
                        askPrice: Number(data.proposal.ask_price),
                        payout: Number(data.proposal.payout),
                        id: data.proposal.id,
                    } : null);
                    return;
                }
                if (data.msg_type === 'buy') {
                    setIsBuying(false);
                    if (data.buy) {
                        setBuyResult({
                            contract_id: data.buy.contract_id,
                            buyPrice: Number(data.buy.buy_price),
                            payout: Number(data.buy.payout),
                            balanceAfter: Number(data.buy.balance_after),
                        });
                        setBuyError(null);
                    } else if (data.error) {
                        setBuyError(data.error.message ?? 'Buy failed');
                    }
                    return;
                }
                if (data.msg_type === 'proposal_open_contract') {
                    const list = Array.isArray(data.proposal_open_contract)
                        ? data.proposal_open_contract
                        : [data.proposal_open_contract];
                    setPositions(list.map((poc: any) => ({
                        contract_id: poc.contract_id,
                        symbol: poc.underlying_symbol ?? poc.symbol,
                        contract_type: poc.contract_type,
                        buy_price: Number(poc.buy_price),
                        payout: Number(poc.payout),
                        is_sold: poc.is_sold,
                        sell_price: poc.sell_price ? Number(poc.sell_price) : null,
                        profit: poc.profit ? Number(poc.profit) : null,
                        entry_tick: poc.entry_tick ?? null,
                        date_start: poc.date_start,
                    })));
                    return;
                }
                if (data.msg_type === 'sell') {
                    sendViaNewSystem({ proposal_open_contract: 1, limit: 20 });
                    return;
                }
                if (data.msg_type === 'active_symbols' && data.active_symbols) {
                    const volidx = data.active_symbols
                        .filter((s: any) => s.symbol_type === 'volidx' && VOLATILITY_SYMBOLS.includes(s.symbol))
                        .map((s: any) => ({
                            display_name: s.display_name ?? s.symbol,
                            symbol: s.symbol,
                            pip_size: s.pip_size ?? 2,
                        }));
                    if (volidx.length > 0) setSymbols(volidx);
                    setIsLoading(false);
                    return;
                }
                if (data.error && data.msg_type === 'proposal') {
                    setIsProposalLoading(false);
                    setProposal(null);
                }
            } catch (_) {}
        });
        return unsub;
    }, []);

    // Connection check
    useEffect(() => {
        const check = setInterval(() => {
            setIsConnected(window._newSystemWS?.readyState === WebSocket.OPEN);
        }, 1000);
        return () => clearInterval(check);
    }, []);

    // Fetch symbols + positions on mount
    useEffect(() => {
        sendViaNewSystem({ active_symbols: 'brief', product_type: 'basic' });
        sendViaNewSystem({ proposal_open_contract: 1, limit: 20 });
        const t = setTimeout(() => setIsLoading(false), 10000);
        return () => clearTimeout(t);
    }, []);

    // Subscribe/Unsubscribe ticks on symbol change
    useEffect(() => {
        if (subIdRef.current) {
            sendViaNewSystem({ forget: subIdRef.current });
            subIdRef.current = null;
        }

        setCurrentTick(null);
        setLastDigit(null);
        setDigitCounts(Array(10).fill(0));
        setDigitTotal(0);

        const sym = symbols.find(s => s.symbol === activeSymbol);
        if (sym) setPipSize(sym.pip_size ?? 2);

        sendViaNewSystem({
            ticks_history: activeSymbol,
            count: 1000,
            end: 'latest',
            style: 'ticks',
            subscribe: 1,
        });

        return () => {
            if (subIdRef.current) {
                sendViaNewSystem({ forget: subIdRef.current });
                subIdRef.current = null;
            }
        };
    }, [activeSymbol]);

    // Request proposal when trade params change
    useEffect(() => {
        if (proposalTimerRef.current) clearTimeout(proposalTimerRef.current);
        setProposal(null);
        const amount = parseFloat(stake);
        if (!amount || amount <= 0 || !duration) { setIsProposalLoading(false); return; }
        setIsProposalLoading(true);
        proposalTimerRef.current = setTimeout(() => {
            const needsBarrier = contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';
            const params: any = {
                proposal: 1,
                amount,
                basis: 'stake',
                contract_type: contractMode,
                currency: 'USD',
                duration,
                duration_unit: 't',
                symbol: activeSymbol,
            };
            if (needsBarrier) params.barrier = selectedDigit;
            sendViaNewSystem(params);
            setTimeout(() => { if (mountedRef.current) setIsProposalLoading(false); }, 5000);
        }, 300);
        return () => { if (proposalTimerRef.current) clearTimeout(proposalTimerRef.current); };
    }, [contractMode, selectedDigit, stake, duration, activeSymbol]);

    const setTradeType = useCallback((type: TradeType) => {
        setTradeTypeState(type);
        switch (type) {
            case 'matches-differs': setContractMode('DIGITMATCH'); break;
            case 'over-under': setContractMode('DIGITOVER'); break;
            case 'even-odd': setContractMode('DIGITEVEN'); break;
        }
    }, []);

    const buyContract = useCallback(() => {
        if (!proposal || isBuying) return;
        setIsBuying(true);
        setBuyError(null);
        sendViaNewSystem({ buy: proposal.id, price: proposal.askPrice });
        setTimeout(() => { if (mountedRef.current) setIsBuying(false); }, 10000);
    }, [proposal, isBuying]);

    const fetchPositions = useCallback(() => {
        sendViaNewSystem({ proposal_open_contract: 1, limit: 20 });
    }, []);

    const sellContract = useCallback((contractId: number) => {
        sendViaNewSystem({ sell: contractId, price: 0 });
    }, []);

    const clearBuyResult = useCallback(() => {
        setBuyResult(null);
        setBuyError(null);
    }, []);

    return {
        symbols, activeSymbol, setActiveSymbol,
        currentTick, lastDigit, digitCounts, digitTotal, pipSize,
        tradeType, setTradeType,
        contractMode, setContractMode,
        selectedDigit, setSelectedDigit,
        stake, setStake, duration, setDuration,
        proposal, isProposalLoading,
        buyContract, isBuying, buyResult, buyError, clearBuyResult,
        positions, sellContract, fetchPositions,
        isConnected, isLoading, error,
    };
}
