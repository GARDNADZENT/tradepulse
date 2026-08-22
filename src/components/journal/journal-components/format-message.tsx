import classnames from 'classnames';
import { formatMoney, getCurrencyDisplayCode } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { LogTypes } from '@/external/bot-skeleton';
import { Localize, localize } from '@deriv-com/translations';
import { TFormatMessageProps } from '../journal.types';

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
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-info)' }} />]}
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
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-success)' }} />]}
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
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-danger)' }} />]}
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
            case LogTypes.DIGITS_ANALYSIS: {
                const { condition, digits, result } = extra;
                const conditionText = condition === 'ALL_EVEN' ? 'all even' : condition === 'ALL_ODD' ? 'all odd' : condition;
                const resultText = result ? '✅ TRUE' : '❌ FALSE';
                const resultColor = result ? 'var(--status-success)' : 'var(--status-danger)';
                return (
                    <Localize
                        i18n_default_text='Last Digits Analysis Condition: <0>{{condition}}</0> Digits: [{{digits}}] Result: <1>{{result}}</1>'
                        values={{
                            condition: conditionText,
                            digits: digits.join(', '),
                            result: resultText,
                        }}
                        components={[
                            <Text key={0} size='xxs' styles={{ color: 'var(--status-info)' }} />,
                            <Text key={1} size='xxs' styles={{ color: resultColor }} />,
                        ]}
                        options={{ interpolation: { escapeValue: false } }}
                    />
                );
            }
            default:
                return null;
        }
    };

    return <div className={classnames('journal__text', className)}>{getLogMessage()}</div>;
};

export default FormatMessage;
