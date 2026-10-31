import brandConfig from '../../brand.config.json';
import { isPreviewMode, PREVIEW_BASE_PATH } from './is-preview-mode';

// Candidate logo paths, in priority order. The BFF writes one of these to public/ at
// deploy time; /traderpulse-logo.jpg is the built-in official TradersPulse brand logo.
export const LOGO_CANDIDATES = ['/traderpulse-logo.jpg', '/logo.png', '/logo.jpg', '/logo.jpeg', '/logo.webp'];

/**
 * Resolves the built-in official TradersPulse logo URL for both standalone ('/') and
 * static preview ('/bot/preview') builds.
 */
export function getTradersPulseLogoSrc(): string {
    return isPreviewMode() ? `${PREVIEW_BASE_PATH}/traderpulse-logo.jpg` : '/traderpulse-logo.jpg';
}

/**
 * Resolves the partner app name. The BFF injects NEXT_PUBLIC_DERIV_APP_NAME into
 * .env.production at deploy time (the same var the Next.js templates read); falls back
 * to brand.config.json platform.name, then a sensible default. The live App Builder
 * preview name (PREVIEW_BRANDING) is handled separately via the preview-app-name store.
 */
export function getAppName(): string {
    return process.env.NEXT_PUBLIC_DERIV_APP_NAME || brandConfig?.platform?.name || 'Deriv Bot';
}
