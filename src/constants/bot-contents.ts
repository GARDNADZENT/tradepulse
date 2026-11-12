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
    AI_DEVELOPER: 2,
    FREE_BOTS: 3,
    TRADING_BOTS: 3,
    DTRADER: 4,
    MANUAL_TRADE: 4,
    AI_BOTS: 5,
    AUTO_TRADES: 6,
    TICK_PULSE: 7,
    TRADING_VIEW: 8,
    COPY_TRADING: 9,
    CALCULATOR: 10,
    RISK_CALCULATOR: 10,
    ANALYSIS_TOOL: 11,
    CHART: 11,
    DIGITS_ANALYSIS: 12,
    TRADEPULSE: 13,
    TUTORIAL: 99,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-ai-developer',
    'id-trading-bots',
    'id-dtrader',
    'id-ai-bots',
    'id-auto-trades',
    'id-tick-pulse',
    'id-trading-view',
    'id-copy-trading',
    'id-calculator',
    'id-analysis-tool',
    'id-digits-analysis',
    'id-tradepulse',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
