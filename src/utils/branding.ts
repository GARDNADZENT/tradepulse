import brandConfig from '../../brand.config.json';

// Candidate logo paths, in priority order. The BFF writes one of these to
// public/ at deploy time; the header mark and favicon probe them in turn.
export const LOGO_CANDIDATES = ['/logo.png', '/logo.jpg', '/logo.jpeg', '/logo.webp'];

export const APP_TAGLINE = 'Plan. Track. Perform.';

/**
 * Resolves the partner app name. The BFF injects NEXT_PUBLIC_DERIV_APP_NAME into
 * .env.production at deploy time (the same var the Next.js templates read); falls back
 * to brand.config.json platform.name, then TradePulse.
 */
export function getAppName(): string {
    return process.env.NEXT_PUBLIC_DERIV_APP_NAME || brandConfig?.platform?.name || 'TradePulse';
}
