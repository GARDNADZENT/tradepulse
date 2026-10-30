import classnames from 'classnames';
import { formatMoney, getCurrencyDisplayCode } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { LogTypes } from '@/external/bot-skeleton';
import { Localize, localize } from '@deriv-com/translations';
import { TFormatMessageProps } from '../journal.types';

const formatContractTypeLabel = (contractType?: string, barrier?: number | string | null) => {
    const map: Record<string, string> = {
        DIGITOVER: 'Over',
        DIGITUNDER: 'Under',
        DIGITMATCH: 'Matches',
        DIGITDIFF: 'Differs',
        DIGITEVEN: 'Even',
        DIGITODD: 'Odd',
        CALL: 'Rise',
        PUT: 'Fall',
    };
    const label = (contractType && map[contractType]) || contractType || 'Contract';
    if (barrier !== null && barrier !== undefined && barrier !== '' && !['DIGITEVEN', 'DIGITODD', 'CALL', 'PUT'].includes(contractType || '')) {
        return `${label} ${barrier}`;
    }
    return label;
};

const FormatMessage = ({ logType, className, extra }: TFormatMessageProps) => {
    const getLogMessage = () => {
        switch (logType) {
            case LogTypes.LOAD_BLOCK: {
                return localize('Blocks are loaded successfully');
            }
            case LogTypes.NOT_OFFERED: {
                return localize('Resale of this contract is not offered.');
            }
            case LogTypes.PURCHASE: {
                const { transaction_id } = extra;
                return (
                    <Localize
                        i18n_default_text='<0>Bought</0>: Contract purchased (ID: {{transaction_id}})'
                        values={{ transaction_id }}
                        components={[<Text key={0} size='xxs' styles={{ color: '#38bdf8', fontWeight: 600 }} />]}
                        options={{ interpolation: { escapeValue: false } }}
                    />
                );
            }
            case LogTypes.SELL: {
                const { sold_for } = extra;
                return (
                    <Localize
                        i18n_default_text='<0>Sold for</0>: {{sold_for}}'
                        values={{ sold_for }}
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-warning)' }} />]}
                    />
                );
            }
            case LogTypes.PROFIT: {
                const { currency, profit } = extra;
                return (
                    <Localize
                        i18n_default_text='Profit amount: <0>{{profit}}</0>'
                        values={{
                            profit: `${formatMoney(currency, profit, true)} ${getCurrencyDisplayCode(currency)}`,
                        }}
                        components={[<Text key={0} size='xxs' styles={{ color: '#10b981', fontWeight: 700 }} />]}
                    />
                );
            }
            case LogTypes.LOST: {
                const { currency, profit } = extra;
                return (
                    <Localize
                        i18n_default_text='Loss amount: <0>{{profit}}</0>'
                        values={{
                            profit: `${formatMoney(currency, profit, true)} ${getCurrencyDisplayCode(currency)}`,
                        }}
                        components={[<Text key={0} size='xxs' styles={{ color: '#ef4444', fontWeight: 700 }} />]}
                    />
                );
            }
            case LogTypes.WELCOME_BACK: {
                const { current_currency } = extra;
                if (current_currency)
                    return (
                        <Localize
                            i18n_default_text='Welcome back! Your messages have been restored. You are using your {{current_currency}} account.'
                            values={{
                                current_currency,
                            }}
                        />
                    );
                return <Localize i18n_default_text='Welcome back! Your messages have been restored.' />;
            }

            case LogTypes.WELCOME: {
                const { current_currency } = extra;
                if (current_currency)
                    return (
                        <Localize
                            i18n_default_text='You are using your {{current_currency}} account.'
                            values={{
                                current_currency,
                            }}
                        />
                    );
                break;
            }
            case LogTypes.TICK_DIGITS: {
                const digitsList = Array.isArray(extra?.digits) ? extra.digits : [];
                const count = extra?.window_size || digitsList.length || 2;
                return (
                    <span className='journal__tick-digits'>
                        {`Last ${count} digit${count === 1 ? '' : 's'}: ${digitsList.join(', ')}`}
                    </span>
                );
            }
            case LogTypes.DIGITS_ANALYSIS: {
                const { condition, digits = [], result } = extra;
                const conditionText =
                    condition === 'ALL_EVEN' ? 'all even' : condition === 'ALL_ODD' ? 'all odd' : condition;
                return (
                    <span className='journal__tick-digits'>
                        {`Last ${digits.length} digits: ${digits.join(', ')} (${conditionText}: `}
                        <strong style={{ color: result ? '#10b981' : '#f87171' }}>
                            {result ? 'TRUE' : 'FALSE'}
                        </strong>
                        {')'}
                    </span>
                );
            }
            case LogTypes.VIRTUAL_HOOK: {
                const event = extra?.event;
                if (event === 'configured') {
                    return (
                        <span className='journal__vh-entry journal__vh-entry--info'>
                            {`[VIRTUAL HOOK] Active · Start: ${extra?.mode || 'VIRTUAL'} · Enter after ${extra?.enter_losses ?? 2} loss(es) · Return after ${extra?.return_wins ?? 1} virtual win(s)`}
                        </span>
                    );
                }
                if (event === 'entered_virtual') {
                    return (
                        <span className='journal__vh-entry journal__vh-entry--warn'>
                            {`[VIRTUAL HOOK] ${extra?.enter_losses ?? 2} actual losses reached → Entering VIRTUAL mode`}
                        </span>
                    );
                }
                const contractDesc = formatContractTypeLabel(extra?.contract_type, extra?.barrier);
                if (extra?.is_win) {
                    return (
                        <span className='journal__vh-entry journal__vh-entry--win'>
                            {`[VIRTUAL] ${contractDesc} → Digit ${extra?.digit ?? '-'} (Virtual WIN ${extra?.win_progress || '1/1'}${
                                extra?.switched_to_real ? ' → Switching to REAL' : ''
                            })`}
                        </span>
                    );
                }
                return (
                    <span className='journal__vh-entry journal__vh-entry--loss'>
                        {`[VIRTUAL] ${contractDesc} → Digit ${extra?.digit ?? '-'} (Virtual LOSS — Staying in VIRTUAL)`}
                    </span>
                );
            }
            default:
                return null;
        }
    };

    return <div className={classnames('journal__text', className)}>{getLogMessage()}</div>;
};

export default FormatMessage;
