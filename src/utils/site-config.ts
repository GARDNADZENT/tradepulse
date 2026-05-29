import { isTradePulseHost, TRADEPULSE_BRAND } from './tradepulse-brand';

/** Deriv API / OAuth brand slug — always `deriv`, even on TradePulse hosts. */
export const website_name = 'Deriv';

export const getDisplayBrandName = () => (isTradePulseHost() ? TRADEPULSE_BRAND.name : 'Deriv');

export const getDocumentTitle = () =>
    isTradePulseHost() ? `${TRADEPULSE_BRAND.productName} | ${TRADEPULSE_BRAND.tagline}` : 'Deriv Bot';

export const website_domain = () => (isTradePulseHost() ? window.location.hostname : 'app.deriv.com');

export const default_title = getDisplayBrandName();

export const TRACKING_STATUS_KEY = 'tracking_status';
