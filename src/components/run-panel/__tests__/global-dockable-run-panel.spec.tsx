import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { observable, runInAction } from 'mobx';
import { DBOT_TABS } from '@/constants/bot-contents';
import RunPanelStore from '@/stores/run-panel-store';
import RunPanel from '../run-panel';

let mockIsDesktop = true;

const mockDashboard = observable({
    active_tab: DBOT_TABS.AI_BOTS,
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
const mockSetActiveTabIndex = jest.fn();
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

describe('Global Dockable RunPanel (Summary / Transactions / Journal + Stats)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsDesktop = true;
        runInAction(() => {
            mockDashboard.active_tab = DBOT_TABS.AI_BOTS;
            mockRunPanelState.is_drawer_open = false;
        });
    });

    it('defaults RunPanelStore.is_drawer_open to false so the drawer starts docked/hidden everywhere', () => {
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
        store.disposeReactionsFn?.();
    });

    it('renders docked by default on non-builder tabs (AI Bots, TradePulse, Dashboard) and toggles open/closed on demand', () => {
        for (const tab of [DBOT_TABS.DASHBOARD, DBOT_TABS.AI_BOTS, DBOT_TABS.AUTO_TRADES, DBOT_TABS.TRADEPULSE]) {
            runInAction(() => {
                mockDashboard.active_tab = tab;
                mockRunPanelState.is_drawer_open = false;
            });

            const { unmount } = render(<RunPanel />);

            const drawer = screen.getByTestId('drawer');
            expect(drawer).not.toHaveClass('tp-global-run-drawer--open');

            // Dock handle shows live contract badge count (221) while hidden
            const handleBtn = screen.getByTestId('global-run-drawer-toggle');
            expect(handleBtn).toHaveTextContent('221');

            // Click dock handle -> opens drawer via MobX observable update
            fireEvent.click(handleBtn);
            expect(mockToggleDrawer).toHaveBeenCalledWith(true);
            expect(screen.getByTestId('drawer')).toHaveClass('tp-global-run-drawer--open');

            // Shows embedded 6-column Stake / Payout / Runs / Won / Lost / P/L strip matching image-11.png
            const statsBar = screen.getByTestId('global-run-drawer-stats');
            expect(statsBar).toHaveTextContent('131.60');
            expect(statsBar).toHaveTextContent('136.35');
            expect(statsBar).toHaveTextContent('221');
            expect(statsBar).toHaveTextContent('152');
            expect(statsBar).toHaveTextContent('69');
            expect(statsBar).toHaveTextContent('+4.75');

            // Click Hide (×) button -> docks/hides drawer back
            fireEvent.click(screen.getByRole('button', { name: 'Hide panel' }));
            expect(mockToggleDrawer).toHaveBeenCalledWith(false);
            expect(screen.getByTestId('drawer')).not.toHaveClass('tp-global-run-drawer--open');

            unmount();
        }
    });

    it('keeps the mobile horizontal bottom control bar scoped only to Bot Builder and Free Bots', () => {
        mockIsDesktop = false;
        runInAction(() => {
            mockDashboard.active_tab = DBOT_TABS.AI_BOTS;
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
