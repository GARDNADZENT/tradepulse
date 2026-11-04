import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { observable, runInAction } from 'mobx';
import { DBOT_TABS } from '@/constants/bot-contents';
import { popover_zindex } from '@/constants/z-indexes';
import RunPanelStore from '@/stores/run-panel-store';
import RunPanel from '../run-panel';

let mockIsDesktop = true;

const mockDashboard = observable({
    active_tab: DBOT_TABS.AUTO_TRADES,
    active_tour: '',
});

const mockRunPanelState = observable({
    active_index: 1,
    is_drawer_open: false,
    is_statistics_info_modal_open: false,
    is_clear_stat_disabled: false,
});

const mockToggleDrawer = jest.fn((next: boolean) => {
    runInAction(() => {
        mockRunPanelState.is_drawer_open = next;
    });
});
const mockSetActiveTabIndex = jest.fn((idx: number) => {
    runInAction(() => {
        mockRunPanelState.active_index = idx;
    });
});
const mockOnClearStatClick = jest.fn();

jest.mock('@deriv-com/ui', () => ({
    useDevice: () => ({
        isDesktop: mockIsDesktop,
        isMobile: !mockIsDesktop,
        isTablet: false,
    }),
}));

jest.mock('@deriv-com/translations', () => ({
    localize: (str: string) => str,
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => <>{i18n_default_text}</>,
    getInitialLanguage: () => 'EN',
}));

jest.mock('@/components/summary', () => ({
    __esModule: true,
    default: () => <div data-testid='mock-summary-tab'>Summary Content</div>,
}));

jest.mock('@/components/transactions', () => ({
    __esModule: true,
    default: () => <div data-testid='mock-transactions-tab'>Transactions Content</div>,
}));

jest.mock('@/components/journal', () => ({
    __esModule: true,
    default: () => <div data-testid='mock-journal-tab'>Journal Content</div>,
}));

jest.mock('@/components/trade-animation', () => ({
    __esModule: true,
    default: () => <div data-testid='mock-mobile-exec-bar'>Mobile Exec Bar</div>,
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        client: { currency: 'USD' },
        dashboard: mockDashboard,
        quick_strategy: {
            is_open: false,
        },
        run_panel: {
            get active_index() {
                return mockRunPanelState.active_index;
            },
            get is_drawer_open() {
                return mockRunPanelState.is_drawer_open;
            },
            get is_statistics_info_modal_open() {
                return mockRunPanelState.is_statistics_info_modal_open;
            },
            get is_clear_stat_disabled() {
                return mockRunPanelState.is_clear_stat_disabled;
            },
            onClearStatClick: mockOnClearStatClick,
            onMount: jest.fn(),
            onUnmount: jest.fn(),
            setActiveTabIndex: mockSetActiveTabIndex,
            toggleDrawer: mockToggleDrawer,
            toggleStatisticsInfoModal: jest.fn(),
        },
        transactions: {
            statistics: {
                total_stake: 131.6,
                total_payout: 136.35,
                number_of_runs: 221,
                won_contracts: 152,
                lost_contracts: 69,
                total_profit: 4.75,
            },
            transactions: Array.from({ length: 221 }, (_, idx) => ({
                type: 'contract',
                data: { contract_id: idx + 1 },
            })),
        },
    }),
}));

describe('Global Bot-Builder-Exact RunPanel Drawer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsDesktop = true;
        runInAction(() => {
            mockDashboard.active_tab = DBOT_TABS.AUTO_TRADES;
            mockRunPanelState.active_index = 1;
            mockRunPanelState.is_drawer_open = false;
        });
    });

    it('defaults RunPanelStore.is_drawer_open to false and elevates RUN_PANEL z-index above page sticky bars', () => {
        const mockRoot: any = {
            dbot: { getStrategySounds: () => [] },
            journal: { unfiltered_messages: [] },
            transactions: { transactions: [] },
            summary_card: {},
        };
        const mockCore: any = {
            client: { is_logged_in: true },
            common: { is_socket_opened: true },
            ui: {},
        };

        const store = new RunPanelStore(mockRoot, mockCore);
        expect(store.is_drawer_open).toBe(false);
        expect(popover_zindex.RUN_PANEL).toBeGreaterThan(30);
        store.disposeReactionsFn?.();
    });

    it('renders the exact Bot Builder dc-drawer across Auto Trades, AI Bots, Dashboard, and TradePulse with tab switching and stats footer', () => {
        for (const tab of [DBOT_TABS.DASHBOARD, DBOT_TABS.AI_BOTS, DBOT_TABS.AUTO_TRADES, DBOT_TABS.TRADEPULSE]) {
            runInAction(() => {
                mockDashboard.active_tab = tab;
                mockRunPanelState.active_index = 1;
                mockRunPanelState.is_drawer_open = false;
            });

            const { container, unmount } = render(<RunPanel />);

            const drawer = screen.getByTestId('drawer');
            expect(drawer).toHaveClass('dc-drawer', 'dc-drawer--right', 'run-panel__container', 'run-panel__container--full-height');
            expect(drawer).not.toHaveClass('dc-drawer--open');

            // Click exact Bot Builder dc-drawer__toggle bar -> opens drawer
            const toggleBar = container.querySelector('.dc-drawer__toggle') as HTMLElement;
            expect(toggleBar).toBeTruthy();
            fireEvent.click(toggleBar);
            expect(mockToggleDrawer).toHaveBeenCalledWith(true);
            expect(screen.getByTestId('drawer')).toHaveClass('dc-drawer--open');

            // Can freely switch between Summary, Transactions (221), and Journal tabs inside the panel
            expect(screen.getByTestId('mock-transactions-tab')).toBeInTheDocument();
            fireEvent.click(screen.getByText('Journal'));
            expect(mockSetActiveTabIndex).toHaveBeenCalledWith(2);
            expect(screen.getByTestId('mock-journal-tab')).toBeInTheDocument();

            // Shows embedded 6-column Stake / Payout / Runs / Won / Lost / P/L strip matching Bot Builder
            const statsBar = screen.getByTestId('global-run-drawer-stats');
            expect(statsBar).toHaveTextContent('131.60');
            expect(statsBar).toHaveTextContent('136.35');
            expect(statsBar).toHaveTextContent('221');
            expect(statsBar).toHaveTextContent('152');
            expect(statsBar).toHaveTextContent('69');
            expect(statsBar).toHaveTextContent('+4.75');

            // Click dc-drawer__toggle again -> docks/hides drawer back
            fireEvent.click(toggleBar);
            expect(mockToggleDrawer).toHaveBeenCalledWith(false);
            expect(screen.getByTestId('drawer')).not.toHaveClass('dc-drawer--open');

            unmount();
        }
    });

    it('keeps the mobile horizontal bottom control bar scoped only to Bot Builder and Free Bots', () => {
        mockIsDesktop = false;
        runInAction(() => {
            mockDashboard.active_tab = DBOT_TABS.AUTO_TRADES;
        });

        render(<RunPanel />);
        expect(screen.queryByTestId('mock-mobile-exec-bar')).not.toBeInTheDocument();

        act(() => {
            runInAction(() => {
                mockDashboard.active_tab = DBOT_TABS.FREE_BOTS;
            });
        });
        expect(screen.getByTestId('mock-mobile-exec-bar')).toBeInTheDocument();
    });
});
