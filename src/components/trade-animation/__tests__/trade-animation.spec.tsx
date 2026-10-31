import { fireEvent, render, screen } from '@testing-library/react';
import { contract_stages } from '@/constants/contract-stage';
import TradeAnimation from '../trade-animation';

const mockOnRunButtonClick = jest.fn();
const mockOnStopBotClick = jest.fn();
const mockOnPauseBotClick = jest.fn();
const mockOnResumeBotClick = jest.fn();
const mockCheckForSavedBots = jest.fn().mockResolvedValue(undefined);

jest.mock('@deriv-com/ui', () => ({
    useDevice: jest.fn(() => ({ isMobile: true, isDesktop: false })),
}));

jest.mock('@deriv-com/translations', () => ({
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => <>{i18n_default_text}</>,
    localize: (text: string) => text,
}));

jest.mock('@deriv/quill-icons/LabelPaired', () => ({
    LabelPairedPlayLgFillIcon: () => <span data-testid='play-icon' />,
    LabelPairedSquareLgFillIcon: () => <span data-testid='stop-icon' />,
}));

jest.mock('@/components/contract-result-overlay', () => {
    const MockOverlay = () => <div data-testid='contract-result-overlay' />;
    return MockOverlay;
});

jest.mock('@/hooks/useStore', () => ({
    useStore: jest.fn(() => ({
        dashboard: { active_tab: 1 },
        blockly_store: {
            has_active_bot: true,
            has_saved_bots: true,
            checkForSavedBots: mockCheckForSavedBots,
        },
        summary_card: {
            is_contract_completed: false,
            profit: 0,
            contract_info: null,
        },
        run_panel: {
            contract_stage: contract_stages.PURCHASE_RECEIVED,
            is_stop_button_visible: true,
            is_stop_button_disabled: false,
            is_paused: false,
            onRunButtonClick: mockOnRunButtonClick,
            onStopBotClick: mockOnStopBotClick,
            onPauseBotClick: mockOnPauseBotClick,
            onResumeBotClick: mockOnResumeBotClick,
        },
        load_modal: {
            dashboard_strategies: [],
            is_delete_modal_open: false,
        },
    })),
}));

describe('TradeAnimation mobile bottom bar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.removeItem('tp_fast_execution');
    });

    it('renders clean mobile controls without duplicating wrapper class onto the status container', () => {
        const { container } = render(<TradeAnimation className='controls__animation' should_show_overlay />);

        const wrapper = container.querySelector('.animation__wrapper');
        const statusBox = container.querySelector('.animation__container');
        const progressBar = statusBox?.querySelector('.animation__progress');

        expect(wrapper).toHaveClass('controls__animation');
        expect(statusBox).not.toHaveClass('controls__animation');
        expect(statusBox).toHaveClass('animation--running');
        expect(progressBar).not.toBeNull();
        expect(screen.getByText('Contract bought')).toBeInTheDocument();
        expect(screen.getByText('Stop')).toBeInTheDocument();
        expect(screen.getByText('Pause')).toBeInTheDocument();
        expect(screen.getByText(/FAST/)).toBeInTheDocument();
    });

    it('toggles FAST execution mode and triggers Stop and Pause callbacks cleanly', () => {
        render(<TradeAnimation className='controls__animation' should_show_overlay />);

        const fastToggle = screen.getByTitle(/Toggle Fast Execution Mode/i);
        expect(fastToggle).not.toHaveClass('animation__fast-toggle--on');
        fireEvent.click(fastToggle);
        expect(fastToggle).toHaveClass('animation__fast-toggle--on');
        expect(localStorage.getItem('tp_fast_execution')).toBe('true');

        fireEvent.click(screen.getByText('Pause'));
        expect(mockOnPauseBotClick).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('Stop'));
        expect(mockOnStopBotClick).toHaveBeenCalledTimes(1);
    });
});
