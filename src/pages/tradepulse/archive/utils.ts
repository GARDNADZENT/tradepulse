// @ts-nocheck

export function buildSchedule({ initial, days, rate, startDate }) {
    const rows = [];
    let start = Number(initial);
    const r = Number(rate) / 100;
    const base = new Date(startDate);
    for (let i = 1; i <= Number(days); i++) {
        const end = start * (1 + r);
        const profit = end - start;
        const date = new Date(base);
        date.setDate(base.getDate() + (i - 1));
        rows.push({
            day: i,
            date: date.toISOString().slice(0, 10),
            start,
            end,
            profit,
            rate: Number(rate),
            actual: null,
            diff: null,
            status: 'pending',
        });
        start = end;
    }
    return { initial: Number(initial), days: Number(days), rate: Number(rate), startDate, rows };
}

export function normalizeJourneyDays(rawDays, rate) {
    if (!Array.isArray(rawDays)) return [];
    return rawDays.map(d => {
        const day = d.day || d.day_number;
        const date = d.date;
        const start = Number(d.start != null ? d.start : d.expected_start) || 0;
        const end = Number(d.end != null ? d.end : d.expected_end) || 0;
        return { day, date, start, end, profit: end - start, rate: Number(rate) };
    });
}

export function getCurrentJourneyDay(startDate) {
    if (!startDate) return 1;
    const start = new Date(startDate + 'T00:00:00');
    const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const msPerDay = 24 * 60 * 60 * 1000;
    const day = Math.floor((now - start) / msPerDay) + 1;
    return day >= 1 ? day : 1;
}

export function computeJourneyDay(r, live, journeyDay) {
    const isToday = r.day === journeyDay;
    const isPast = r.day < journeyDay;
    let actual = null;
    let status = 'pending';

    if (isToday) {
        actual = live;
        status = (live - r.end) >= 0 ? 'complete' : 'behind';
    } else if (isPast) {
        if (live - r.end >= 0) {
            actual = r.end;
            status = 'complete';
        } else {
            actual = live > 0 ? live : null;
            status = 'missed';
        }
    } else {
        actual = null;
        status = 'pending';
    }

    const diff = actual != null ? actual - r.end : null;
    return { ...r, actual, diff, status };
}

export function formatCurrency(value, currency = 'USD') {
    return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function computeStats(contracts) {
    const total = contracts.length;
    const wins = contracts.filter(c => c.isWin).length;
    const losses = contracts.filter(c => c.isLoss).length;
    const net = contracts.reduce((s, c) => s + Number(c.profit || 0), 0);
    const winRate = total ? (wins / total * 100) : 0;
    const avgProfit = wins ? contracts.filter(c => c.isWin).reduce((s, c) => s + Number(c.profit), 0) / wins : 0;
    const avgLoss = losses ? contracts.filter(c => c.isLoss).reduce((s, c) => s + Number(c.profit), 0) / losses : 0;
    const largestWin = contracts.reduce((m, c) => Math.max(m, Number(c.profit || 0)), 0);
    const largestLoss = contracts.reduce((m, c) => Math.min(m, Number(c.profit || 0)), 0);

    const byDay = {};
    contracts.forEach(c => {
        const t = c.closeTime || c.purchaseTime || c.date_start;
        if (!t) return;
        const day = new Date(Number(t) * 1000).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + Number(c.profit || 0);
    });
    const dayEntries = Object.entries(byDay);
    const bestDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null;
    const worstDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] < a[1] ? b : a) : null;

    const bySymbol = {};
    const byType = {};
    contracts.forEach(c => {
        const sym = c.symbol || 'Unknown';
        const type = c.contractType || 'Unknown';
        bySymbol[sym] = (bySymbol[sym] || 0) + 1;
        byType[type] = (byType[type] || 0) + 1;
    });
    const mostTradedMarket = Object.keys(bySymbol).sort((a, b) => bySymbol[b] - bySymbol[a])[0] || '—';
    const mostTradedContract = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0] || '—';

    let winStreak = 0, lossStreak = 0;
    const sorted = [...contracts].sort((a, b) =>
        (Number(b.closeTime || b.purchaseTime || b.date_start) || 0) -
        (Number(a.closeTime || a.purchaseTime || a.date_start) || 0)
    );
    let curWin = 0, curLoss = 0;
    for (const c of sorted) {
        const p = Number(c.profit) || 0;
        if (p > 0) { curWin++; curLoss = 0; }
        else if (p < 0) { curLoss++; curWin = 0; }
        else { curWin = 0; curLoss = 0; }
        if (curWin > winStreak) winStreak = curWin;
        if (curLoss > lossStreak) lossStreak = curLoss;
    }

    return {
        total, wins, losses, net, winRate, avgProfit, avgLoss,
        largestWin, largestLoss, mostTradedMarket, mostTradedContract,
        winStreak, lossStreak, bestDay, worstDay,
    };
}

export function getTodayStats(contracts) {
    const today = new Date().toISOString().slice(0, 10);
    const todayContracts = contracts.filter(c => {
        const t = c.closeTime || c.purchaseTime || c.date_start;
        if (!t) return false;
        return new Date(Number(t) * 1000).toISOString().slice(0, 10) === today;
    });
    return computeStats(todayContracts);
}

export function getContractPerformance(contracts) {
    const groups = {};
    contracts.forEach(c => {
        const type = c.contractType || 'Unknown';
        if (!groups[type]) groups[type] = { type, trades: 0, wins: 0, losses: 0, net: 0, totalStake: 0, totalReturn: 0 };
        groups[type].trades++;
        if (c.isWin) groups[type].wins++;
        else if (c.isLoss) groups[type].losses++;
        groups[type].net += Number(c.profit || 0);
        groups[type].totalStake += Number(c.stake || 0);
        groups[type].totalReturn += Number(c.payout || 0);
    });
    return Object.values(groups).sort((a, b) => b.trades - a.trades);
}
