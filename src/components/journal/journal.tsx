// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import classnames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { contract_stages } from '@/constants/contract-stage';
import { useStore } from '@/hooks/useStore';
import { DerivLightEmptyCardboardBoxIcon } from '@deriv/quill-icons/Illustration';
import { Localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import DataList from '../data-list';
import { TCheckedFilters, TFilterMessageValues, TJournalDataListArgs } from './journal.types';
import { JournalItem, JournalLoader, JournalTools } from './journal-components';

const formatShortContractLabel = (contract: any): string => {
    const ct = String(contract?.contract_type || '').toUpperCase();
    const barrier = contract?.barrier != null && contract?.barrier !== '' ? ` ${contract.barrier}` : '';
    switch (ct) {
        case 'DIGITOVER':
            return `Over${barrier}`;
        case 'DIGITUNDER':
            return `Under${barrier}`;
        case 'DIGITEVEN':
            return 'Even';
        case 'DIGITODD':
            return 'Odd';
        case 'DIGITMATCH':
            return `Match${barrier}`;
        case 'DIGITDIFF':
            return `Diff${barrier}`;
        case 'CALL':
            return 'Rise';
        case 'PUT':
            return 'Fall';
        case 'CALLE':
            return 'Rise=';
        case 'PUTE':
            return 'Fall=';
        case 'ONETOUCH':
            return `Touch${barrier}`;
        case 'NOTOUCH':
            return `NoTouch${barrier}`;
        default:
            return ct || 'Trade';
    }
};

const Journal = observer(() => {
    const { journal, run_panel, transactions } = useStore();
    const {
        checked_filters,
        filterMessage,
        filters,
        filtered_messages,
        is_filter_dialog_visible,
        toggleFilterDialog,
        unfiltered_messages,
    } = journal;
    const { is_stop_button_visible, contract_stage, setActiveTabIndex } = run_panel;

    const filtered_messages_length = Array.isArray(filtered_messages) && filtered_messages.length;
    const unfiltered_messages_length = Array.isArray(unfiltered_messages) && unfiltered_messages.length;
    const contract_rows = Array.isArray(transactions?.transactions)
        ? transactions.transactions.filter((row: any) => row?.type === 'contract' && row?.data)
        : [];
    const preview_rows = contract_rows.slice(0, 3);
    const { isDesktop } = useDevice();

    return (
        <div
            className={classnames('journal run-panel-tab__content--no-stat', {
                'run-panel-tab__content': isDesktop,
                'journal--has-preview': preview_rows.length > 0,
            })}
            data-testid='dt_mock_journal'
        >
            <JournalTools
                checked_filters={checked_filters}
                filters={filters}
                filterMessage={filterMessage}
                is_filter_dialog_visible={is_filter_dialog_visible}
                toggleFilterDialog={toggleFilterDialog}
            />
            <div className='journal__item-list'>
                {filtered_messages_length ? (
                    <DataList
                        className='journal'
                        data_source={filtered_messages}
                        rowRenderer={(args: TJournalDataListArgs) => <JournalItem {...args} />}
                        keyMapper={(row: TFilterMessageValues) => row.unique_id}
                    />
                ) : (
                    <>
                        {contract_stage >= contract_stages.STARTING &&
                        !!Object.keys(checked_filters as TCheckedFilters).length &&
                        !unfiltered_messages_length &&
                        is_stop_button_visible ? (
                            <JournalLoader is_mobile={!isDesktop} />
                        ) : (
                            <div className='journal-empty'>
                                <DerivLightEmptyCardboardBoxIcon
                                    height='64px'
                                    width='64px'
                                    className='journal-empty__icon icon-general-fill-g-path'
                                    color='secondary'
                                    fill='var(--text-general)'
                                />
                                <Text
                                    as='h4'
                                    size='xs'
                                    weight='bold'
                                    align='center'
                                    color='less-prominent'
                                    lineHeight='s'
                                    className='journal-empty__header'
                                >
                                    <Localize i18n_default_text='There are no messages to display' />
                                </Text>
                                <div className='journal-empty__message'>
                                    <Text size='xxs' color='less-prominent'>
                                        <Localize i18n_default_text='Here are the possible reasons:' />
                                    </Text>
                                    <ul className='journal-empty__list'>
                                        <li>
                                            <Text size='xxs' color='less-prominent'>
                                                <Localize i18n_default_text='No bot or live trade has executed yet' />
                                            </Text>
                                        </li>
                                        <li>
                                            <Text size='xxs' color='less-prominent'>
                                                <Localize i18n_default_text='The stats are cleared' />
                                            </Text>
                                        </li>
                                        <li>
                                            <Text size='xxs' color='less-prominent'>
                                                <Localize i18n_default_text='All messages are filtered out' />
                                            </Text>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            {preview_rows.length > 0 && (
                <div className='journal__tx-preview'>
                    <div className='journal__tx-preview-head'>
                        <span className='journal__tx-preview-title'>
                            <Localize i18n_default_text='Transactions (Preview)' />
                        </span>
                        <button
                            type='button'
                            className='journal__tx-preview-jump'
                            onClick={() => setActiveTabIndex(1)}
                        >
                            View All ({contract_rows.length}) ›
                        </button>
                    </div>
                    <div className='journal__tx-preview-cols'>
                        <span>Type</span>
                        <span>Entry/Exit spot</span>
                        <span>Buy price</span>
                        <span>Profit/Loss</span>
                    </div>
                    <div className='journal__tx-preview-rows'>
                        {preview_rows.map((row: any, idx: number) => {
                            const c = row.data;
                            const curr = c.currency || 'USD';
                            const buyAmt = Number(c.buy_price ?? 0).toFixed(2);
                            const pl = Number(c.profit ?? 0);
                            const isSettled =
                                Boolean(c.is_completed) ||
                                ['won', 'lost', 'sold', 'expired'].includes(String(c.status || ''));
                            const entrySpot = c.entry_spot ?? '—';
                            const exitSpot = c.exit_spot ?? (isSettled ? '—' : '…');
                            const sym = c.underlying_symbol || c.underlying || '';
                            const key = c.transaction_ids?.buy || c.contract_id || idx;
                            return (
                                <button
                                    key={key}
                                    type='button'
                                    className='journal__tx-preview-row'
                                    onClick={() => setActiveTabIndex(1)}
                                    title={c.longcode || formatShortContractLabel(c)}
                                >
                                    <span className='journal__tx-type'>
                                        <b>{formatShortContractLabel(c)}</b>
                                        {sym && <small>{sym}</small>}
                                    </span>
                                    <span className='journal__tx-spots'>
                                        <span>{entrySpot}</span>
                                        <small>{exitSpot}</small>
                                    </span>
                                    <span className='journal__tx-buy'>
                                        {buyAmt} <small>{curr}</small>
                                    </span>
                                    <span
                                        className={classnames('journal__tx-pl', {
                                            'is-win': isSettled && pl > 0,
                                            'is-loss': isSettled && pl < 0,
                                            'is-open': !isSettled,
                                        })}
                                    >
                                        {!isSettled
                                            ? 'OPEN'
                                            : `${pl > 0 ? '+' : ''}${pl.toFixed(2)} ${curr}`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type='button'
                        className='journal__tx-preview-foot'
                        onClick={() => setActiveTabIndex(1)}
                    >
                        Showing last {preview_rows.length} of {contract_rows.length} transactions ›
                    </button>
                </div>
            )}
        </div>
    );
});

export default Journal;
