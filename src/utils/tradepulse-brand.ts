import { isCustomOAuthHost } from '@/components/shared/utils/config/config';

/** Hosts running the TradePulse-branded build (not official dbot.deriv.com). */
export const isTradePulseHost = (): boolean => {
    const hostname = window.location.hostname;
    return isCustomOAuthHost() || /\.sytes\.net$/i.test(hostname) || hostname.includes('tradepulse');
};

export const TRADEPULSE_BRAND = {
    name: 'TradePulse',
    tagline: 'Automated trading at your fingertips',
    productName: 'TradePulse Bot',
} as const;
