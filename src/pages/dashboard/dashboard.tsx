import React, { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';

type TMobileIconGuide = {
    handleTabChange?: (active_number: number) => void;
};

type TActionCard = {
    id: string;
    accent: 'blue' | 'emerald' | 'cyan' | 'gold' | 'violet' | 'coral' | 'sky';
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    onClick: () => void;
};

type TTestimonial = {
    initial: string;
    name: string;
    role: string;
    quote: string;
    stars: number;
};

const TESTIMONIALS: TTestimonial[] = [
    {
        initial: 'A',
        name: 'Alex R.',
        role: 'Beginner Trader',
        quote: 'TradersPulse has completely changed the way I trade. The bot builder is simple yet powerful.',
        stars: 5,
    },
    {
        initial: 'D',
        name: 'Daniel K.',
        role: 'Algo Trader',
        quote: 'The AI bots are top quality. I was up and running in minutes and already seeing consistent results.',
        stars: 5,
    },
    {
        initial: 'S',
        name: 'Sophia L.',
        role: 'Technical Trader',
        quote: 'The analysis tool helps me catch trends early. Clean interface, powerful features, exactly what I needed.',
        stars: 5,
    },
    {
        initial: 'M',
        name: 'Marcus T.',
        role: 'Swing Trader',
        quote: 'Auto trades save me so much time. Set it up once and let it work. TradersPulse is a game changer.',
        stars: 5,
    },
    {
        initial: 'E',
        name: 'Emma J.',
        role: 'Part-time Trader',
        quote: 'The free bots are genuinely useful. Great community and solid strategies.',
        stars: 5,
    },
    {
        initial: 'R',
        name: 'Ryan P.',
        role: 'Pro Trader',
        quote: 'Clean dashboard, fast execution, and all the tools I need in one place. Highly recommend TradersPulse!',
        stars: 5,
    },
];

const DashboardComponent = observer((_props: TMobileIconGuide) => {
    const { load_modal, dashboard, quick_strategy, google_drive } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tour, setActiveTab, onCloseDialog, dialog_options, is_dialog_open, setPreviewOnPopup } =
        dashboard;
    const { setFormVisibility } = quick_strategy;
    const { isDesktop } = useDevice();
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(!isDesktop ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openQuickStrategy = () => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);
        setFormVisibility(true);
    };

    const openGoogleDriveDialog = () => {
        const googleDriveTabIndex = isDesktop ? 2 : 1;
        toggleLoadModal();
        setActiveTabIndex(googleDriveTabIndex);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const actionCards: TActionCard[] = [
        {
            id: 'load-bot',
            accent: 'blue',
            title: localize('Load Bot'),
            subtitle: localize('Import an XML strategy from your device.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2.2 2.2c.38.38.89.6 1.42.6H18.5A2.5 2.5 0 0 1 21 10.3v7.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z'
                        fill='currentColor'
                    />
                </svg>
            ),
            onClick: openFileLoader,
        },
        {
            id: 'quick-strategy',
            accent: 'emerald',
            title: localize('Quick Strategy'),
            subtitle: localize('Build a guided strategy quickly.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M14.5 3.5c3.2-.2 5.7.2 6 3.5.3 3.3-1.8 6.8-4.8 9.2l-1.5 3.8-2.8-2.8-3.4-3.4-2.8-2.8 3.8-1.5c2.4-3 5.9-5.1 9.5-6Z'
                        stroke='currentColor'
                        strokeWidth='1.9'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    />
                    <circle cx='15' cy='9' r='1.5' fill='currentColor' />
                    <path
                        d='M5.5 18.5c1-2.2 2.4-2.8 3.8-2.4.4 1.4-.2 2.8-2.4 3.8-.8.3-1.7-.6-1.4-1.4Z'
                        fill='currentColor'
                    />
                </svg>
            ),
            onClick: openQuickStrategy,
        },
        {
            id: 'auto-trades',
            accent: 'cyan',
            title: localize('Auto Trades'),
            subtitle: localize('Configure automated multi-condition setups.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M4 19.5h16M7 16v-5M11.5 16V7M16 16v-3.5'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                    />
                    <rect x='3' y='4' width='18' height='16' rx='3' stroke='currentColor' strokeWidth='1.6' />
                </svg>
            ),
            onClick: () => setActiveTab(DBOT_TABS.AUTO_TRADES),
        },
        {
            id: 'ai-bots',
            accent: 'gold',
            title: localize('AI Bots'),
            subtitle: localize('Open advanced ready-made AI bots.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M4 17L2.8 8.5l5.2 3.7L12 6l4 6.2 5.2-3.7L20 17H4Z'
                        fill='currentColor'
                    />
                    <rect x='4.5' y='18.5' width='15' height='2' rx='1' fill='currentColor' />
                </svg>
            ),
            onClick: () => setActiveTab(DBOT_TABS.AI_BOTS),
        },
        {
            id: 'free-bots',
            accent: 'violet',
            title: localize('Free Bots'),
            subtitle: localize('Browse free strategies to load and edit.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <rect x='5' y='7' width='14' height='11' rx='3' fill='currentColor' />
                    <path
                        d='M12 3.5V7M9.5 3.5h5M3 11.5h2M19 11.5h2'
                        stroke='currentColor'
                        strokeWidth='1.8'
                        strokeLinecap='round'
                    />
                    <circle cx='9.5' cy='12' r='1.3' fill='#07183c' />
                    <circle cx='14.5' cy='12' r='1.3' fill='#07183c' />
                    <rect x='9.2' y='14.8' width='5.6' height='1.3' rx='0.65' fill='#07183c' />
                </svg>
            ),
            onClick: () => setActiveTab(DBOT_TABS.FREE_BOTS),
        },
        {
            id: 'analysis-tool',
            accent: 'coral',
            title: localize('Analysis Tool'),
            subtitle: localize('Study signals before opening trades.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M4 19h16M7.5 16v-4.5M12 16V8M16.5 16v-6.5'
                        stroke='currentColor'
                        strokeWidth='2.1'
                        strokeLinecap='round'
                    />
                    <rect x='3.2' y='4.2' width='17.6' height='15.6' rx='3' stroke='currentColor' strokeWidth='1.5' />
                </svg>
            ),
            onClick: () => setActiveTab(DBOT_TABS.ANALYSIS_TOOL),
        },
        {
            id: 'dtrader',
            accent: 'sky',
            title: localize('DTrader'),
            subtitle: localize('Trade live ticks and digits instantly.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <rect x='3' y='4.5' width='18' height='12.5' rx='2.4' stroke='currentColor' strokeWidth='1.8' />
                    <path
                        d='M6.5 12.5l3-2.8 2.6 2.2 4.4-4.2M9 20h6M12 17v3'
                        stroke='currentColor'
                        strokeWidth='1.8'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    />
                </svg>
            ),
            onClick: () => setActiveTab(DBOT_TABS.DTRADER),
        },
    ];

    if (is_google_drive_configured) {
        actionCards.push({
            id: 'google-drive',
            accent: 'blue',
            title: localize('Google Drive'),
            subtitle: localize('Import or sync strategies from Google Drive.'),
            icon: (
                <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M9.2 4h5.6l5.7 9.8-2.8 4.8H6.3L3.5 13.8 9.2 4Z'
                        stroke='currentColor'
                        strokeWidth='1.8'
                        strokeLinejoin='round'
                    />
                    <path d='M6.5 14h11' stroke='currentColor' strokeWidth='1.6' />
                </svg>
            ),
            onClick: openGoogleDriveDialog,
        });
    }

    return (
        <React.Fragment>
            <div
                className={classNames('tab__dashboard tp-dash', {
                    'tab__dashboard--tour-active': active_tour,
                })}
            >
                <div className='tab__dashboard__content tp-dash__scroll'>
                    <div className='tp-dash__inner'>
                        {/* Simple Centered Hero */}
                        <section className='tp-dash__hero'>
                            <h1 className='tp-dash__hero-title'>{localize('Hello Trader!')}</h1>
                            <p className='tp-dash__hero-sub'>
                                {localize('Choose a workspace or launch an AI bot below')}
                            </p>
                        </section>

                        {/* Left-Accented Action Cards Grid */}
                        <section className='tp-dash__actions-section' aria-label='Quick Actions'>
                            <div className='tp-dash__actions-grid' id='tab__dashboard__table__tiles'>
                                {actionCards.map(card => (
                                    <button
                                        key={card.id}
                                        id={card.id}
                                        type='button'
                                        className={`tp-dash__card tp-dash__card--${card.accent}`}
                                        onClick={card.onClick}
                                    >
                                        <span className='tp-dash__card-icon'>{card.icon}</span>
                                        <span className='tp-dash__card-body'>
                                            <strong className='tp-dash__card-title'>{card.title}</strong>
                                            <span className='tp-dash__card-sub'>{card.subtitle}</span>
                                        </span>
                                        <span className='tp-dash__card-arrow' aria-hidden='true'>
                                            <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                                                <path
                                                    d='M5 12h14m-5-5 5 5-5 5'
                                                    stroke='currentColor'
                                                    strokeWidth='1.9'
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                />
                                            </svg>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Testimonials Section */}
                        <section className='tp-dash__reviews' aria-label='What Traders Are Saying'>
                            <h2 className='tp-dash__reviews-heading'>{localize('WHAT TRADERS ARE SAYING')}</h2>
                            <div className='tp-dash__reviews-grid'>
                                {TESTIMONIALS.map(item => (
                                    <article key={item.name} className='tp-dash__review-card'>
                                        <div className='tp-dash__stars' aria-label={`${item.stars} out of 5 stars`}>
                                            {Array.from({ length: 5 }).map((_, idx) => (
                                                <span
                                                    key={idx}
                                                    className={
                                                        idx < item.stars ? 'tp-dash__star is-filled' : 'tp-dash__star'
                                                    }
                                                >
                                                    ★
                                                </span>
                                            ))}
                                        </div>
                                        <p className='tp-dash__review-quote'>&ldquo;{item.quote}&rdquo;</p>
                                        <div className='tp-dash__reviewer'>
                                            <span className='tp-dash__avatar' aria-hidden='true'>
                                                {item.initial}
                                            </span>
                                            <div className='tp-dash__reviewer-meta'>
                                                <strong>{item.name}</strong>
                                                <span>{item.role}</span>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>

                        {/* Bottom Bar: Risk Disclaimer */}
                        <div className='tp-dash__bottom-bar'>
                            <button
                                type='button'
                                className='tp-dash__disclaimer-btn'
                                onClick={() => setIsDisclaimerOpen(true)}
                            >
                                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                                    <path
                                        d='M12 3.2 2.4 20h19.2L12 3.2Z'
                                        fill='#0b1120'
                                    />
                                    <path
                                        d='M12 9.5v4.5'
                                        stroke='#facc15'
                                        strokeWidth='2'
                                        strokeLinecap='round'
                                    />
                                    <circle cx='12' cy='16.8' r='1.1' fill='#facc15' />
                                </svg>
                                <span>{localize('Risk Disclaimer')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Google Drive Loader Modal */}
                {!isDesktop ? (
                    <Dialog
                        title={dialog_options.title}
                        is_visible={is_dialog_open}
                        onCancel={onCloseDialog}
                        is_mobile_full_width
                        className='dc-dialog__wrapper--google-drive'
                        has_close_icon
                    >
                        <GoogleDrive />
                    </Dialog>
                ) : (
                    <MobileFullPageModal
                        is_modal_open={is_dialog_open}
                        className='load-strategy__wrapper'
                        header={localize('Load strategy')}
                        onClickClose={() => {
                            setPreviewOnPopup(false);
                            onCloseDialog();
                        }}
                        height_offset='80px'
                    >
                        <div className='google-drive-label'>
                            <GoogleDrive />
                        </div>
                    </MobileFullPageModal>
                )}

                {/* Risk Disclaimer Modal */}
                {isDisclaimerOpen && (
                    <div
                        className='tp-dash__modal-backdrop'
                        role='dialog'
                        aria-modal='true'
                        aria-labelledby='tp-risk-disclaimer-title'
                        onClick={() => setIsDisclaimerOpen(false)}
                    >
                        <div className='tp-dash__modal' onClick={e => e.stopPropagation()}>
                            <div className='tp-dash__modal-head'>
                                <h3 id='tp-risk-disclaimer-title'>{localize('Risk Disclaimer')}</h3>
                                <button
                                    type='button'
                                    className='tp-dash__modal-close'
                                    onClick={() => setIsDisclaimerOpen(false)}
                                    aria-label='Close'
                                >
                                    ×
                                </button>
                            </div>
                            <div className='tp-dash__modal-body'>
                                <p>
                                    Deriv offers complex derivatives, such as options and contracts for difference
                                    (&ldquo;CFDs&rdquo;). These products may not be suitable for all clients, and
                                    trading them puts you at risk.
                                </p>
                                <p>
                                    Never trade with borrowed money or money that you cannot afford to lose. Always
                                    validate automated strategies and risk parameters on a Demo account before switching
                                    to live execution.
                                </p>
                            </div>
                            <div className='tp-dash__modal-foot'>
                                <button
                                    type='button'
                                    className='tp-dash__modal-ok'
                                    onClick={() => setIsDisclaimerOpen(false)}
                                >
                                    {localize('I Understand')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </React.Fragment>
    );
});

export default DashboardComponent;
