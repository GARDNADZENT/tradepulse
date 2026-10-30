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
    TRADING_VIEW: 7,
    COPY_TRADING: 8,
    CALCULATOR: 9,
    RISK_CALCULATOR: 9,
    ANALYSIS_TOOL: 10,
    CHART: 10,
    DIGITS_ANALYSIS: 11,
    TRADEPULSE: 12,
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
    'id-trading-view',
    'id-copy-trading',
    'id-calculator',
    'id-analysis-tool',
    'id-digits-analysis',
    'id-tradepulse',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
