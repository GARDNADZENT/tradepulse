import React, { useEffect, useState } from 'react';
import {
    dismissTpSlModal,
    formatTpSlSignedAmount,
    getTpSlModalState,
    subscribeTpSlModal,
    TpSlModalPayload,
} from './tp-sl-modal-store';
import './tp-sl-result-modal.scss';

const TpSlResultModal: React.FC = () => {
    const [modal, setModal] = useState<TpSlModalPayload | null>(() => getTpSlModalState());

    useEffect(() => {
        return subscribeTpSlModal(setModal);
    }, []);

    useEffect(() => {
        if (!modal) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                dismissTpSlModal();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [modal]);

    if (!modal) return null;

    const isSl = modal.type === 'sl';
    const title = isSl ? 'Stop Loss Hit' : 'Take Profit Hit';
    const formattedAmount = formatTpSlSignedAmount(modal.amount, modal.currency, modal.type);

    return (
        <div
            className='tp-tpsl-overlay'
            role='dialog'
            aria-modal='true'
            aria-label={title}
            data-testid='tp-sl-result-modal'
            onClick={e => {
                if (e.target === e.currentTarget) {
                    dismissTpSlModal();
                }
            }}
        >
            <div className={`tp-tpsl-card${isSl ? ' tp-tpsl-card--sl' : ''}`}>
                <div
                    className={`tp-tpsl-card__icon-ring${isSl ? ' tp-tpsl-card__icon-ring--sl' : ''}`}
                    aria-hidden='true'
                >
                    {isSl ? (
                        <svg width='28' height='28' viewBox='0 0 24 24' fill='none'>
                            <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='1.75' opacity='0.85' />
                            <path
                                d='M15 9l-6 6M9 9l6 6'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                            />
                        </svg>
                    ) : (
                        <svg width='28' height='28' viewBox='0 0 24 24' fill='none'>
                            <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='1.75' opacity='0.85' />
                            <path
                                d='M8.5 12.3l2.3 2.4 4.8-5'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />
                        </svg>
                    )}
                </div>

                <h2 className='tp-tpsl-card__title' data-testid='tp-sl-modal-title'>
                    {title}
                </h2>

                <div
                    className={`tp-tpsl-card__amount${isSl ? ' tp-tpsl-card__amount--sl' : ''}`}
                    data-testid='tp-sl-modal-amount'
                >
                    {formattedAmount}
                </div>

                <button
                    type='button'
                    className={`tp-tpsl-card__btn${isSl ? ' tp-tpsl-card__btn--sl' : ''}`}
                    onClick={() => dismissTpSlModal()}
                    data-testid='tp-sl-modal-continue'
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default TpSlResultModal;
