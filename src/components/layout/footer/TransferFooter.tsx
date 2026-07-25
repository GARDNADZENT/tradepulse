import { useCallback } from 'react';
import { useStore } from '@/hooks/useStore';
import { navigateToTransfer } from '@/utils/transfer-utils';
import { LegacyTransferIcon } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';
import { Tooltip } from '@deriv-com/ui';

const TransferFooter = () => {
    const { client } = useStore() ?? {};

    const handleTransfer = useCallback(() => {
        const accounts = client?.all_accounts_balance?.accounts ?? {};
        const loginid = client?.activeLoginid ?? '';
        const currency = accounts[loginid]?.currency;
        if (currency) {
            navigateToTransfer(currency);
        }
    }, [client]);

    return (
        <Tooltip as='button' className='app-footer__icon' onClick={handleTransfer} tooltipContent={localize('Transfer')}>
            <LegacyTransferIcon iconSize='xs' fill='var(--text-general)' />
        </Tooltip>
    );
};

export default TransferFooter;
