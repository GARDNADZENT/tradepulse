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
    CHART: 2,
    TRADING_BOTS: 3,
    MANUAL_TRADE: 4,
    TRADEPULSE: 5,
    TUTORIAL: 999,
    AUTO_TRADES: 6,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-trading-bots',
    'id-manual-trade',
    'id-tradepulse',
    'id-tutorials',
    'id-auto-trades',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
