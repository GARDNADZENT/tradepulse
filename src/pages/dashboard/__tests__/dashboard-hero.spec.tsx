import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DBOT_TABS } from '@/constants/bot-contents';
import DashboardComponent from '../dashboard';

const mockSetActiveTab = jest.fn();
const mockToggleLoadModal = jest.fn();
const mockSetActiveTabIndex = jest.fn();
const mockSetFormVisibility = jest.fn();

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        load_modal: {
            toggleLoadModal: mockToggleLoadModal,
            setActiveTabIndex: mockSetActiveTabIndex,
            dashboard_strategies: [],
        },
        dashboard: {
            active_tab: 0,
            active_tour: '',
            setActiveTab: mockSetActiveTab,
            onCloseDialog: jest.fn(),
            dialog_options: { title: '' },
            is_dialog_open: false,
            setPreviewOnPopup: jest.fn(),
        },
        client: { is_logged_in: false },
        quick_strategy: { setFormVisibility: mockSetFormVisibility },
        google_drive: { is_google_drive_configured: false },
    }),
}));

jest.mock('@deriv-com/translations', () => ({
    localize: (str: string) => str,
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => <span>{i18n_default_text}</span>,
}));

jest.mock('@deriv-com/ui', () => ({
    useDevice: () => ({ isDesktop: true, isTablet: false }),
}));

jest.mock('@/components/load-modal/google-drive', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('@/components/shared_ui/dialog', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('@/components/shared_ui/mobile-full-page-modal', () => ({
    __esModule: true,
    default: () => null,
}));

describe('DashboardComponent Hello Trader Hero', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders Hello Trader hero, 7 quick-action cards, trader testimonials, Risk Disclaimer modal, and zero Deriv Bot info panel', () => {
        const { container } = render(<DashboardComponent handleTabChange={jest.fn()} />);

        expect(container.querySelector('.tab__dashboard__info-panel')).toBeNull();
        expect(container.querySelector('.db-info-panel')).toBeNull();
        expect(container.querySelector('.bot-list__container')).toBeNull();
        expect(screen.queryByText(/Welcome to Deriv Bot/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Your bots:/i)).not.toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'Hello Trader!' })).toBeInTheDocument();
        expect(screen.getByText('WHAT TRADERS ARE SAYING')).toBeInTheDocument();
        expect(screen.getByText('Alex R.')).toBeInTheDocument();
        expect(screen.getByText('Ryan P.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Load Bot/i }));
        expect(mockToggleLoadModal).toHaveBeenCalledTimes(1);
        expect(mockSetActiveTab).toHaveBeenCalledWith(DBOT_TABS.BOT_BUILDER);

        fireEvent.click(screen.getByRole('button', { name: /Quick Strategy/i }));
        expect(mockSetFormVisibility).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('button', { name: /Free Bots/i }));
        expect(mockSetActiveTab).toHaveBeenCalledWith(DBOT_TABS.FREE_BOTS);

        fireEvent.click(screen.getByRole('button', { name: /DTrader/i }));
        expect(mockSetActiveTab).toHaveBeenCalledWith(DBOT_TABS.DTRADER);

        fireEvent.click(screen.getByRole('button', { name: /Analysis Tool/i }));
        expect(mockSetActiveTab).toHaveBeenCalledWith(DBOT_TABS.ANALYSIS_TOOL);

        // Open & close Risk Disclaimer modal
        fireEvent.click(screen.getByRole('button', { name: /Risk Disclaimer/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /I Understand/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
