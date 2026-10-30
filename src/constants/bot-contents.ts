type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    TRADING_BOTS: 2,
    DIGITS_ANALYSIS: 3,
    COPY_TRADING: 4,
    RISK_CALCULATOR: 5,
    TRADING_VIEW: 6,
    CHART: 7,
    MANUAL_TRADE: 8,
    TRADEPULSE: 9,
    AUTO_TRADES: 10,
    TUTORIAL: 11,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-trading-bots',
    'id-digits-analysis',
    'id-copy-trading',
    'id-risk-calculator',
    'id-trading-view',
    'id-charts',
    'id-manual-trade',
    'id-tradepulse',
    'id-auto-trades',
    'id-tutorials',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
