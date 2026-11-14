import React from 'react';
import type { VirtualTransaction as VirtualTransactionData } from '@/stores/transactions-store';
import { LegacyRadioOffIcon, LegacyRadioOnIcon } from '@deriv/quill-icons';
import { Localize } from '@deriv-com/translations';
import { MarketIcon } from '../market/market-icon';
import Money from '../shared_ui/money';
import { TradeTypeIcon } from '../trade-type/trade-type-icon';

/** A simulated trade has no contract or transaction ID and is never a real purchase. */
const VirtualTransaction = ({ trade }: { trade: VirtualTransactionData }) => (
    <div className='transactions__item-wrapper transactions__virtual-wrapper' data-testid='virtual-transaction'>
        <div className='transactions__item'>
            <div className='transactions__cell transactions__trade-type transactions__virtual-type'>
                <div className='transactions__virtual-icons' title={`${trade.display_name} · ${trade.contract_type === 'DIGITEVEN' ? 'Even' : 'Odd'}`}>
                    <MarketIcon type={trade.underlying_symbol} />
                    <TradeTypeIcon type={trade.contract_type} size='sm' />
                </div>
                <span className='transactions__virtual-badge'><Localize i18n_default_text='Virtual' /></span>
            </div>
            <div className='transactions__cell transactions__entry-spot' aria-label={`Entry spot ${trade.entry_spot}`}>
                <LegacyRadioOnIcon className='transactions__icon' height={10} width={10} />
                {trade.entry_spot}
            </div>
            <div className='transactions__cell transactions__exit-spot' aria-label={`Exit spot ${trade.exit_spot}`}>
                <LegacyRadioOffIcon className='transactions__icon' height={10} width={10} />
                {trade.exit_spot}
            </div>
            <div className='transactions__cell transactions__stake'>
                <Money amount={0} currency={trade.currency} show_currency />
            </div>
            <div className={`transactions__cell transactions__profit transactions__virtual-${trade.outcome}`}>
                {trade.outcome === 'won'
                    ? <Localize i18n_default_text='Virtual Win' />
                    : <Localize i18n_default_text='Virtual Loss' />}
            </div>
        </div>
    </div>
);

export default VirtualTransaction;
