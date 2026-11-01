// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation } from 'react-router-dom';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradeTypeConfirmationModal from '@/components/trade-type-confirmation-modal';
import TradingViewComponent from '@/components/trading-view-chart/trading-view';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { api_base, updateWorkspaceName } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import {
    disableUrlParameterApplication,
    enableUrlParameterApplication,
    setupTradeTypeChangeListener,
} from '@/utils/blockly-url-param-handler';
import {
    checkAndShowTradeTypeModal,
    getModalState,
    handleTradeTypeCancel,
    handleTradeTypeConfirm,
    resetUrlParamProcessing,
    setModalStateChangeCallback,
} from '@/utils/trade-type-modal-handler';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPlayLgFillIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import './main.scss';

const AIDeveloper = React.lazy(() => import('../ai-developer'));
const AIBots = React.lazy(() => import('../ai-bots'));
const AnalysisTool = React.lazy(() => import('../analysis-tool'));
const AutoTrades = React.lazy(() => import('../auto-trades/auto-trades'));
const Calculator = React.lazy(() => import('../calculator'));
const CopyTrading = React.lazy(() => import('../copy-trading/copy-trading'));
const DigitsAnalysis = React.lazy(() => import('../digits-analysis/digits-analysis'));
const DTrader = React.lazy(() => import('../dtrader'));
const FreeBots = React.lazy(() => import('../free-bots/free-bots'));
const TradePulse = React.lazy(() =>
    import('../tradepulse').then(mod => ({ default: mod.TradePulse }))
);

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const { dashboard, load_modal, run_panel, quick_strategy, summary_card, blockly_store } = useStore();
    const { is_loading } = blockly_store;
    const {
        active_tab,
        active_tour,
        setActiveTab,
        setWebSocketState,
        setActiveTour,
        setTourDialogVisibility,
    } = dashboard;
    const { dashboard_strategies } = load_modal;
    const {
        is_dialog_open,
        is_drawer_open,
        dialog_options,
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot,
    } = run_panel;
    const { is_open } = quick_strategy;
    const { cancel_button_text, ok_button_text, title, message, dismissable, is_closed_on_cancel } = dialog_options as {
        [key: string]: string;
    };
    const { clear } = summary_card;
    const { DASHBOARD, BOT_BUILDER, FREE_BOTS } = DBOT_TABS;
    const init_render = React.useRef(true);

    const hash = [
        'dashboard',
        'bot_builder',
        'ai_developer',
        'free_bots',
        'dtrader',
        'ai_bots',
        'auto_trades',
        'trading_view',
        'copy_trading',
        'calculator',
        'analysis_tool',
        'digits_analysis',
        'tradepulse',
    ];

    const { isDesktop } = useDevice();
    const location = useLocation();
    const [left_tab_shadow, setLeftTabShadow] = useState<boolean>(false);
    const [right_tab_shadow, setRightTabShadow] = useState<boolean>(false);
    const [tradeTypeModalState, setTradeTypeModalState] = useState(getModalState());

    const getTradeTypeModalProps = () => {
        const { tradeTypeData } = tradeTypeModalState;
        return {
            is_visible: tradeTypeModalState.isVisible,
            trade_type_display_name: tradeTypeData?.displayName || '',
            current_trade_type: tradeTypeData?.currentTradeType
                ? `${tradeTypeData.currentTradeType.tradeTypeCategory}/${tradeTypeData.currentTradeType.tradeType}`
                : 'N/A',
            current_trade_type_display_name: tradeTypeData?.currentTradeTypeDisplayName || 'N/A',
            onConfirm: handleTradeTypeConfirm,
            onCancel: handleTradeTypeCancel,
        };
    };

    const is_preview_mode = window.location.pathname.includes('/preview');
    const GetHashedValue = (tab: number) => {
        const tab_value = location.hash?.split('#')[1];
        if (!tab_value) return is_preview_mode ? BOT_BUILDER : tab;
        const idx = hash.indexOf(String(tab_value));
        return idx >= 0 ? idx : DASHBOARD;
    };
    const active_hash_tab = GetHashedValue(active_tab);

    React.useEffect(() => {
        setModalStateChangeCallback(new_state => {
            setTradeTypeModalState(new_state);
        });
    }, [is_loading]);

    React.useEffect(() => {
        resetUrlParamProcessing();
    }, [location.search]);

    React.useEffect(() => {
        const el_dashboard = document.getElementById('id-dbot-dashboard');
        const el_last = document.getElementById('id-tradepulse');
        if (!el_dashboard || !el_last) return;

        const observer_dashboard = new window.IntersectionObserver(
            ([entry]) => setLeftTabShadow(!entry.isIntersecting),
            { root: null, threshold: 0.5 }
        );
        const observer_last = new window.IntersectionObserver(
            ([entry]) => setRightTabShadow(!entry.isIntersecting),
            { root: null, threshold: 0.5 }
        );
        observer_dashboard.observe(el_dashboard);
        observer_last.observe(el_last);

        return () => {
            observer_dashboard.disconnect();
            observer_last.disconnect();
        };
    }, []);

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    const updateTabShadowsHeight = () => {
        const botBuilderEl = document.getElementById('id-bot-builder');
        const leftShadow = document.querySelector('.tabs-shadow--left') as HTMLElement;
        const rightShadow = document.querySelector('.tabs-shadow--right') as HTMLElement;
        if (botBuilderEl && leftShadow && rightShadow) {
            const height = botBuilderEl.offsetHeight;
            leftShadow.style.height = `${height}px`;
            rightShadow.style.height = `${height}px`;
        }
    };

    React.useEffect(() => {
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
        if (active_tab === BOT_BUILDER) {
            requestAnimationFrame(() => {
                disableUrlParameterApplication();
                setupTradeTypeChangeListener();
                const handleTradeTypeModal = () => {
                    checkAndShowTradeTypeModal(
                        () => {
                            enableUrlParameterApplication();
                        },
                        () => {}
                    );
                };

                if (!blockly_store.is_loading) {
                    setTimeout(() => {
                        handleTradeTypeModal();
                    }, 500);
                } else {
                    let pollAttempts = 0;
                    const maxPollAttempts = 10;
                    const checkBlocklyLoaded = () => {
                        if (!blockly_store.is_loading) {
                            handleTradeTypeModal();
                            return;
                        }
                        if (pollAttempts < maxPollAttempts) {
                            pollAttempts++;
                            pollTimeoutId = setTimeout(checkBlocklyLoaded, 500);
                        }
                    };
                    checkBlocklyLoaded();
                }
            });
        }
        return () => {
            if (pollTimeoutId) clearTimeout(pollTimeoutId);
        };
    }, [active_tab, is_loading]);

    React.useEffect(() => {
        const idlePreload = () => {
            void import('../ai-developer');
            void import('../free-bots/free-bots');
            void import('../dtrader');
            void import('../ai-bots');
            void import('../analysis-tool');
        };
        const timer = window.setTimeout(idlePreload, 900);
        return () => window.clearTimeout(timer);
    }, []);

    React.useEffect(() => {
        const rafId = requestAnimationFrame(() => {
            updateTabShadowsHeight();
        });
        if (is_open) setTourDialogVisibility(false);

        if (init_render.current) {
            setActiveTab(Number(active_hash_tab));
            if (!isDesktop) handleTabChange(Number(active_hash_tab));
            init_render.current = false;
        } else {
            const targetHash = hash[active_tab] || hash[0];
            if (window.location.hash !== `#${targetHash}`) {
                window.history.replaceState(
                    null,
                    '',
                    `${window.location.pathname}${window.location.search}#${targetHash}`
                );
            }
        }
        if (active_tour !== '') setActiveTour('');

        document.body.style.overflow = '';
        const mainElement = document.querySelector('.main__container');
        if (mainElement instanceof HTMLElement) {
            mainElement.classList.remove('no-scroll');
        }
        return () => cancelAnimationFrame(rafId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            const blocklyGlobal = (window as any).Blockly;
            if (active_tab === BOT_BUILDER && blocklyGlobal?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                const trashcanX = is_drawer_open
                    ? isDbotRTL()
                        ? 380
                        : window.innerWidth - 460
                    : isDbotRTL()
                      ? 20
                      : window.innerWidth - 100;
                blocklyGlobal?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);
        return () => clearTimeout(trashcan_init_id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab, is_drawer_open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (dashboard_strategies.length > 0) {
            timer = setTimeout(() => {
                updateWorkspaceName();
            });
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [dashboard_strategies, active_tab]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            React.startTransition(() => {
                setActiveTab(tab_index);
            });
            const el_id = TAB_IDS[tab_index];
            if (el_id) {
                requestAnimationFrame(() => {
                    const el_tab = document.getElementById(el_id);
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                });
            }
        },
        [setActiveTab]
    );

    const handleLoginGeneration = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        }
    };

    const scrollMainTabs = (dir: 'left' | 'right') => {
        const listEl = document.querySelector('.dc-tabs__list--header--main__tabs') as HTMLElement | null;
        if (!listEl) return;
        listEl.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' });
    };

    const isExecSurface = [BOT_BUILDER, FREE_BOTS].includes(active_tab);
    const isExecScrollTab = active_tab === FREE_BOTS;

    return (
        <React.Fragment>
            <div
                className={classNames('main', {
                    'main--has-exec-dock': isExecSurface,
                    'main--exec-scroll-tab': isExecScrollTab,
                    'main--drawer-open': isExecScrollTab && is_drawer_open && isDesktop,
                    'main--full-page-tab': !isExecSurface,
                })}
            >
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                    })}
                >
                    <div className='main__nav-shell'>
                        {isDesktop && (
                            <button
                                type='button'
                                className='main__nav-arrow main__nav-arrow--left'
                                onClick={() => scrollMainTabs('left')}
                                aria-label='Scroll navigation left'
                            >
                                ‹
                            </button>
                        )}
                        {!isDesktop && left_tab_shadow && <span className='tabs-shadow tabs-shadow--left' />}{' '}
                        <Tabs
                            active_index={active_tab}
                            className='main__tabs'
                            header_fit_content
                            onTabItemClick={handleTabChange}
                            top
                        >
                            {/* 0: Dashboard */}
                            <div
                                label={
                                    <>
                                        <LabelPairedObjectsColumnCaptionRegularIcon
                                            height='15px'
                                            width='15px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Dashboard' />
                                    </>
                                }
                                id='id-dbot-dashboard'
                            >
                                <Dashboard handleTabChange={handleTabChange} />
                            </div>

                            {/* 1: Bot Builder */}
                            <div
                                label={
                                    <>
                                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                                            height='15px'
                                            width='15px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Bot Builder' />
                                    </>
                                }
                                id='id-bot-builder'
                            />

                            {/* 2: AI Developer */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4zm-2 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' />
                                        </svg>
                                        <Localize i18n_default_text='AI Developer' />
                                    </>
                                }
                                id='id-ai-developer'
                            >
                                <AIDeveloper />
                            </div>

                            {/* 3: Free Bots */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M12 2.5l2.85 5.77 6.37.93-4.61 4.49 1.09 6.34L12 17.04l-5.7 2.99 1.09-6.34L2.78 9.2l6.37-.93L12 2.5z' />
                                        </svg>
                                        <Localize i18n_default_text='Free Bots' />
                                    </>
                                }
                                id='id-trading-bots'
                            >
                                <FreeBots />
                            </div>

                            {/* 4: DTrader */}
                            <div
                                label={
                                    <>
                                        <LabelPairedPlayLgFillIcon
                                            height='14px'
                                            width='14px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='DTrader' />
                                    </>
                                }
                                id='id-dtrader'
                            >
                                <DTrader />
                            </div>

                            {/* 5: AI Bots */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M12 2a1.75 1.75 0 1 1 0 3.5V7h4.5A3.5 3.5 0 0 1 20 10.5V12h1.5v3H20v2.5A3.5 3.5 0 0 1 16.5 21h-9A3.5 3.5 0 0 1 4 17.5V15H2.5v-3H4v-1.5A3.5 3.5 0 0 1 7.5 7H11V5.5A1.75 1.75 0 0 1 12 2zm-3 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8.5 17h7v1.5h-7V17z' />
                                        </svg>
                                        <Localize i18n_default_text='AI Bots' />
                                    </>
                                }
                                id='id-ai-bots'
                            >
                                <AIBots />
                            </div>

                            {/* 6: Auto Trades */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z' />
                                        </svg>
                                        <Localize i18n_default_text='Auto Trades' />
                                    </>
                                }
                                id='id-auto-trades'
                            >
                                <AutoTrades />
                            </div>

                            {/* 7: TradingView */}
                            <div
                                label={
                                    <>
                                        <LabelPairedChartLineCaptionRegularIcon
                                            height='15px'
                                            width='15px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='TradingView' />
                                    </>
                                }
                                id='id-trading-view'
                            >
                                <div style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 9.6rem)' }}>
                                    <TradingViewComponent />
                                </div>
                            </div>

                            {/* 8: Copy Trading */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' />
                                        </svg>
                                        <Localize i18n_default_text='Copy Trading' />
                                    </>
                                }
                                id='id-copy-trading'
                            >
                                <CopyTrading />
                            </div>

                            {/* 9: Calculator */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 4v4h10V6H7zm0 6v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 16v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z' />
                                        </svg>
                                        <Localize i18n_default_text='Calculator' />
                                    </>
                                }
                                id='id-calculator'
                            >
                                <Calculator />
                            </div>

                            {/* 10: Analysis Tool */}
                            <div
                                label={
                                    <>
                                        <LabelPairedChartLineCaptionRegularIcon
                                            height='15px'
                                            width='15px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Analysis Tool' />
                                    </>
                                }
                                id='id-analysis-tool'
                            >
                                <AnalysisTool />
                            </div>

                            {/* 11: Digits Analysis */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M3 3h4v18H3V3zm7 6h4v12h-4V9zm7-4h4v16h-4V5z' />
                                        </svg>
                                        <Localize i18n_default_text='Digits Analysis' />
                                    </>
                                }
                                id='id-digits-analysis'
                            >
                                <DigitsAnalysis />
                            </div>

                            {/* 12: TradePulse */}
                            <div
                                label={
                                    <>
                                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                            <path d='M3 13h4l2.8-7 4.4 12 2.8-5H21v-2h-5.2l-1.6 3-4.4-12L6 11H3v2z' />
                                        </svg>
                                        <Localize i18n_default_text='TradePulse' />
                                    </>
                                }
                                id='id-tradepulse'
                            >
                                <TradePulse />
                            </div>
                        </Tabs>
                        {isDesktop && (
                            <button
                                type='button'
                                className='main__nav-arrow main__nav-arrow--right'
                                onClick={() => scrollMainTabs('right')}
                                aria-label='Scroll navigation right'
                            >
                                ›
                            </button>
                        )}
                        {!isDesktop && right_tab_shadow && <span className='tabs-shadow tabs-shadow--right' />}{' '}
                    </div>
                </div>
            </div>

            {isExecSurface && (
                <DesktopWrapper>
                    <div className='main__run-strategy-wrapper'>
                        <RunStrategy />
                        <RunPanel />
                    </div>
                    <ChartModal />
                    <TradingViewModal />
                </DesktopWrapper>
            )}
            {isExecSurface && <MobileWrapper>{!is_open && <RunPanel />}</MobileWrapper>}

            <Dialog
                cancel_button_text={cancel_button_text || localize('Cancel')}
                className='dc-dialog__wrapper--fixed'
                confirm_button_text={ok_button_text || localize('Ok')}
                has_close_icon
                is_mobile_full_width={false}
                is_visible={is_dialog_open}
                onCancel={onCancelButtonClick}
                onClose={onCloseDialog}
                onConfirm={onOkButtonClick || onCloseDialog}
                portal_element_id='modal_root'
                title={title}
                login={handleLoginGeneration}
                dismissable={dismissable}
                is_closed_on_cancel={is_closed_on_cancel}
            >
                {message}
            </Dialog>

            {(() => {
                const modalProps = getTradeTypeModalProps();
                return (
                    <TradeTypeConfirmationModal
                        is_visible={modalProps.is_visible}
                        trade_type_display_name={modalProps.trade_type_display_name}
                        current_trade_type={modalProps.current_trade_type}
                        current_trade_type_display_name={modalProps.current_trade_type_display_name}
                        onConfirm={modalProps.onConfirm}
                        onCancel={modalProps.onCancel}
                    />
                );
            })()}
        </React.Fragment>
    );
});

export default AppWrapper;
