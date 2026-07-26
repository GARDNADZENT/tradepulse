import React from 'react';
import classNames from 'classnames';
import Text from '@/components/shared_ui/text';
import {
    LabelPairedCircleCheckMdRegularIcon,
    LabelPairedCircleXmarkMdRegularIcon,
} from '@deriv/quill-icons/LabelPaired';
import { Localize, localize } from '@deriv-com/translations';

type TContractResultOverlayProps = {
    profit: number;
    display_name?: string;
};

const ContractResultOverlay = ({ profit, display_name }: TContractResultOverlayProps) => {
    const has_won_contract = profit >= 0;
    const is_virtual = display_name === 'Virtual Win' || display_name === 'Virtual Loss';
    const label = is_virtual ? display_name : (has_won_contract ? localize('Won') : localize('Lost'));

    return (
        <div
            className={classNames('db-contract-card__result', {
                'db-contract-card__result--won': has_won_contract,
                'db-contract-card__result--lost': !has_won_contract,
            })}
        >
            <Text weight='bold' className='db-contract-card__result-caption'>
                {has_won_contract ? (
                    <React.Fragment>
                        <span>{label}</span>
                        <LabelPairedCircleCheckMdRegularIcon className='db-contract-card__result-icon' color='green' />
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <span>{label}</span>
                        <LabelPairedCircleXmarkMdRegularIcon className='db-contract-card__result-icon' color='red' />
                    </React.Fragment>
                )}
            </Text>
        </div>
    );
};

export default ContractResultOverlay;
