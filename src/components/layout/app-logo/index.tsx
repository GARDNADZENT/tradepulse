import { standalone_routes } from '@/components/shared';
import { isTradePulseHost, TRADEPULSE_BRAND } from '@/utils/tradepulse-brand';
import { DerivLogo, useDevice } from '@deriv-com/ui';
import './app-logo.scss';

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    if (!isDesktop) return null;

    if (isTradePulseHost()) {
        return (
            <a className='app-header__logo tradepulse-logo' href={standalone_routes.bot} title={TRADEPULSE_BRAND.name}>
                <span className='tradepulse-logo__mark' aria-hidden>
                    TP
                </span>
                <span className='tradepulse-logo__wordmark'>
                    <span className='tradepulse-logo__trade'>Trade</span>
                    <span className='tradepulse-logo__pulse'>Pulse</span>
                </span>
            </a>
        );
    }

    return (
        <DerivLogo className='app-header__logo' href={standalone_routes.deriv_com} target='_blank' variant='wallets' />
    );
};
