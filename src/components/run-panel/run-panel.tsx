// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Journal from '@/components/journal';
import Button from '@/components/shared_ui/button';
import Modal from '@/components/shared_ui/modal';
import Money from '@/components/shared_ui/money';
import Tabs from '@/components/shared_ui/tabs';
import Text from '@/components/shared_ui/text';
import Summary from '@/components/summary';
import TradeAnimation from '@/components/trade-animation';
import Transactions from '@/components/transactions';
import { DBOT_TABS } from '@/constants/bot-contents';
import { popover_zindex } from '@/constants/z-indexes';
import { useStore } from '@/hooks/useStore';
import { LabelPairedChevronsRightCaptionRegularIcon } from '@deriv/quill-icons';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import ThemedScrollbars from '../shared_ui/themed-scrollbars';

type TStatisticsTile = {
    content: React.ElementType | string;
    contentClassName: string;
    title: string;
};

type TStatisticsSummary = {
    currency: string;
    is_mobile: boolean;
    lost_contracts: number;
    number_of_runs: number;
    total_stake: number;
    total_payout: number;
    toggleStatisticsInfoModal: () => void;
    total_profit: number;
    won_contracts: number;
};

type TDrawerContent = {
    active_index: number;
    contract_count?: number;
    is_drawer_open: boolean;
    setActiveTabIndex: () => void;
};

type TStatisticsInfoModal = {
    is_mobile: boolean;
    is_statistics_info_modal_open: boolean;
    toggleStatisticsInfoModal: () => void;
};

const formatCompactMoney = (value: number | undefined | null, signed = false) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num === 0) return '0.00';
    const abs = Math.abs(num).toFixed(2);
    if (signed) return num > 0 ? `+${abs}` : `-${abs}`;
    return num.toFixed(2);
};

const StatisticsTile = ({ content, contentClassName, title }: TStatisticsTile) => (
    <div className='run-panel__tile'>
        <div className='run-panel__tile-title'>{title}</div>
        <div className={classNames('run-panel__tile-content', contentClassName)}>{content}</div>
    </div>
);

export const StatisticsSummary = ({
    currency,
    is_mobile,
    lost_contracts,
    number_of_runs,
    total_stake,
    total_payout,
    toggleStatisticsInfoModal,
    total_profit,
    won_contracts,
}: TStatisticsSummary) => (
    <div
        className={classNames('run-panel__stat', {
            'run-panel__stat--mobile': is_mobile,
        })}
    >
        <div className='run-panel__stat--info' onClick={toggleStatisticsInfoModal}>
            <div className='run-panel__stat--info-item'>
                <Localize i18n_default_text="What's this?" />
            </div>
        </div>
        <div className='run-panel__stat--tiles'>
            <StatisticsTile
                title={localize('Total stake')}
                alignment='top'
                content={<Money amount={total_stake} currency={currency} show_currency />}
            />
            <StatisticsTile
                title={localize('Total payout')}
                alignment='top'
                content={<Money amount={total_payout} currency={currency} show_currency />}
            />
            <StatisticsTile title={localize('No. of runs')} alignment='top' content={number_of_runs} />
            <StatisticsTile title={localize('Contracts lost')} alignment='bottom' content={lost_contracts} />
            <StatisticsTile title={localize('Contracts won')} alignment='bottom' content={won_contracts} />
            <StatisticsTile
                title={localize('Total profit/loss')}
                content={<Money amount={total_profit} currency={currency} has_sign show_currency />}
                alignment='bottom'
                contentClassName={classNames('run-panel__stat-amount', {
                    'run-panel__stat-amount--positive': total_profit > 0,
                    'run-panel__stat-amount--negative': total_profit < 0,
                })}
            />
        </div>
    </div>
);

const CompactStatsBar = ({
    total_stake,
    total_payout,
    number_of_runs,
    won_contracts,
    lost_contracts,
    total_profit,
}: {
    total_stake: number;
    total_payout: number;
    number_of_runs: number;
    won_contracts: number;
    lost_contracts: number;
    total_profit: number;
}) => (
    <div className='tp-global-run-drawer__stats-shell' data-testid='global-run-drawer-stats'>
        <div className='tp-global-run-drawer__stats'>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('Stake')}</span>
                <span className='tp-global-run-drawer__stat-val'>{formatCompactMoney(total_stake)}</span>
            </div>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('Payout')}</span>
                <span className='tp-global-run-drawer__stat-val'>{formatCompactMoney(total_payout)}</span>
            </div>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('Runs')}</span>
                <span className='tp-global-run-drawer__stat-val'>{number_of_runs}</span>
            </div>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('Won')}</span>
                <span
                    className={classNames('tp-global-run-drawer__stat-val', {
                        'tp-global-run-drawer__stat-val--pos': won_contracts > 0,
                    })}
                >
                    {won_contracts}
                </span>
            </div>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('Lost')}</span>
                <span
                    className={classNames('tp-global-run-drawer__stat-val', {
                        'tp-global-run-drawer__stat-val--neg': lost_contracts > 0,
                    })}
                >
                    {lost_contracts}
                </span>
            </div>
            <div className='tp-global-run-drawer__stat-box'>
                <span className='tp-global-run-drawer__stat-label'>{localize('P/L')}</span>
                <span
                    className={classNames('tp-global-run-drawer__stat-val', {
                        'tp-global-run-drawer__stat-val--pos': total_profit > 0,
                        'tp-global-run-drawer__stat-val--neg': total_profit < 0,
                    })}
                >
                    {formatCompactMoney(total_profit, true)}
                </span>
            </div>
        </div>
    </div>
);

const DrawerContent = ({
    active_index,
    contract_count = 0,
    is_drawer_open,
    setActiveTabIndex,
}: TDrawerContent) => {
    const { isDesktop } = useDevice();

    React.useEffect(() => {
        if (!isDesktop && is_drawer_open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [is_drawer_open, isDesktop]);

    return (
        <Tabs active_index={active_index} onTabItemClick={setActiveTabIndex} top>
            <div id='db-run-panel-tab__summary' label={<Localize i18n_default_text='Summary' />}>
                <Summary is_drawer_open={is_drawer_open} />
            </div>
            <div
                id='db-run-panel-tab__transactions'
                label={<Localize i18n_default_text='Transactions' />}
                data-count={contract_count > 0 ? contract_count : undefined}
            >
                <Transactions is_drawer_open={is_drawer_open} />
            </div>
            <div id='db-run-panel-tab__journal' label={<Localize i18n_default_text='Journal' />}>
                <Journal />
            </div>
        </Tabs>
    );
};

const MobileDrawerFooter = () => {
    return (
        <div className='controls__section'>
            <div className='controls__buttons'>
                <TradeAnimation className='controls__animation' should_show_overlay />
            </div>
        </div>
    );
};

const StatisticsInfoModal = ({
    is_mobile,
    is_statistics_info_modal_open,
    toggleStatisticsInfoModal,
}: TStatisticsInfoModal) => {
    return (
        <Modal
            className={classNames('statistics__modal', { 'statistics__modal--mobile': is_mobile })}
            title={localize("What's this?")}
            is_open={is_statistics_info_modal_open}
            toggleModal={toggleStatisticsInfoModal}
            width={'440px'}
        >
            <Modal.Body>
                <div className={classNames('statistics__modal-body', { 'statistics__modal-body--mobile': is_mobile })}>
                    <ThemedScrollbars className='statistics__modal-scrollbar'>
                        <Text as='p' weight='bold' className='statistics__modal-body--content no-margin'>
                            <Localize i18n_default_text='Total stake' />
                        </Text>
                        <Text as='p'>
                            <Localize i18n_default_text='Total stake since you last cleared your stats.' />
                        </Text>
                        <Text as='p' weight='bold' className='statistics__modal-body--content'>
                            <Localize i18n_default_text='Total payout' />
                        </Text>
                        <Text as='p'>{localize('Total payout since you last cleared your stats.')}</Text>
                        <Text as='p' weight='bold' className='statistics__modal-body--content'>
                            <Localize i18n_default_text='No. of runs' />
                        </Text>
                        <Text as='p'>
                            <Localize i18n_default_text='The number of times your bot has run since you last cleared your stats. Each run includes the execution of all the root blocks.' />
                        </Text>
                        <Text as='p' weight='bold' className='statistics__modal-body--content'>
                            <Localize i18n_default_text='Contracts lost' />
                        </Text>
                        <Text as='p'>
                            <Localize i18n_default_text='The number of contracts you have lost since you last cleared your stats.' />
                        </Text>
                        <Text as='p' weight='bold' className='statistics__modal-body--content'>
                            <Localize i18n_default_text='Contracts won' />
                        </Text>
                        <Text as='p'>
                            <Localize i18n_default_text='The number of contracts you have won since you last cleared your stats.' />
                        </Text>
                        <Text as='p' weight='bold' className='statistics__modal-body--content'>
                            <Localize i18n_default_text='Total profit/loss' />
                        </Text>
                        <Text as='p'>
                            <Localize i18n_default_text='Your total profit/loss since you last cleared your stats. It is the difference between your total payout and your total stake.' />
                        </Text>
                    </ThemedScrollbars>
                </div>
            </Modal.Body>
        </Modal>
    );
};

const RunPanel = observer(() => {
    const { run_panel, dashboard, transactions, quick_strategy } = useStore();
    const { isDesktop } = useDevice();
    const {
        active_index,
        is_drawer_open,
        is_statistics_info_modal_open,
        is_clear_stat_disabled,
        onClearStatClick,
        onMount,
        onUnmount,
        setActiveTabIndex,
        toggleDrawer,
        toggleStatisticsInfoModal,
    } = run_panel;
    const { statistics, transactions: transaction_list } = transactions;
    const { active_tour, active_tab } = dashboard;
    const { total_payout, total_profit, total_stake, won_contracts, lost_contracts, number_of_runs } = statistics;
    const { BOT_BUILDER, FREE_BOTS, DTRADER } = DBOT_TABS;
    const isMobileExecSurface = [BOT_BUILDER, FREE_BOTS].includes(active_tab);
    const isDesktopExecSurface = [BOT_BUILDER, FREE_BOTS, DTRADER].includes(active_tab);

    const contract_count = Array.isArray(transaction_list)
        ? transaction_list.filter(item => item?.type === 'contract').length
        : 0;

    React.useEffect(() => {
        onMount();
        return () => onUnmount();
    }, [onMount, onUnmount]);

    if (active_tour === 'bot_builder') return null;

    const showEmbeddedStatsFooter = !isDesktop || !isDesktopExecSurface;

    return (
        <>
            <aside
                data-testid='drawer'
                className={classNames('tp-global-run-drawer', {
                    'tp-global-run-drawer--open': is_drawer_open,
                    'tp-global-run-drawer--exec-surface': isDesktopExecSurface && isDesktop,
                    'tp-global-run-drawer--mobile-exec': isMobileExecSurface && !isDesktop,
                    'run-panel__container--tour-active': isDesktop && active_tour,
                })}
                style={{ zIndex: popover_zindex.RUN_PANEL }}
                aria-label={localize('Transactions and trade records')}
            >
                <button
                    type='button'
                    className={classNames('tp-global-run-drawer__handle', {
                        'tp-global-run-drawer__handle--open': is_drawer_open,
                    })}
                    onClick={() => toggleDrawer(!is_drawer_open)}
                    title={
                        is_drawer_open
                            ? localize('Dock / Hide panel')
                            : localize('Open Summary, Transactions & Journal')
                    }
                    aria-expanded={is_drawer_open}
                    data-testid='global-run-drawer-toggle'
                >
                    <LabelPairedChevronsRightCaptionRegularIcon
                        className={classNames('tp-global-run-drawer__handle-icon', {
                            'tp-global-run-drawer__handle-icon--open': is_drawer_open,
                        })}
                    />
                    {!is_drawer_open && contract_count > 0 && (
                        <span className='tp-global-run-drawer__handle-badge'>{contract_count}</span>
                    )}
                </button>

                <div className='tp-global-run-drawer__panel'>
                    <div className='tp-global-run-drawer__topbar'>
                        <span className='tp-global-run-drawer__topbar-title'>
                            {active_index === 0
                                ? localize('Summary')
                                : active_index === 1
                                  ? localize('Transactions')
                                  : localize('Journal')}
                        </span>
                        <div className='tp-global-run-drawer__topbar-actions'>
                            {(!isDesktop || !isDesktopExecSurface) && (
                                <Button
                                    id='db-run-panel__clear-button'
                                    className='tp-global-run-drawer__reset-btn'
                                    disabled={is_clear_stat_disabled}
                                    text={localize('Reset')}
                                    onClick={onClearStatClick}
                                    secondary
                                />
                            )}
                            <button
                                type='button'
                                className='tp-global-run-drawer__close-btn'
                                onClick={() => toggleDrawer(false)}
                                title={localize('Hide panel')}
                                aria-label={localize('Hide panel')}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div className='tp-global-run-drawer__body run-panel__content'>
                        <DrawerContent
                            active_index={active_index}
                            contract_count={contract_count}
                            is_drawer_open={is_drawer_open}
                            setActiveTabIndex={setActiveTabIndex}
                        />
                    </div>

                    {showEmbeddedStatsFooter && (
                        <CompactStatsBar
                            total_stake={total_stake}
                            total_payout={total_payout}
                            number_of_runs={number_of_runs}
                            won_contracts={won_contracts}
                            lost_contracts={lost_contracts}
                            total_profit={total_profit}
                        />
                    )}
                </div>
            </aside>

            {!isDesktop && isMobileExecSurface && !quick_strategy?.is_open && <MobileDrawerFooter />}

            <StatisticsInfoModal
                is_mobile={!isDesktop}
                is_statistics_info_modal_open={is_statistics_info_modal_open}
                toggleStatisticsInfoModal={toggleStatisticsInfoModal}
            />
        </>
    );
});

export default RunPanel;
