import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
// Removed AnalyticsInitializer import - analytics dependency removed
// See migrate-docs/ANALYTICS_IMPLEMENTATION_GUIDE.md for re-implementation
import {
    applyBrandFontFromConfig,
    applyDocumentTitle,
    applyFaviconFromLogo,
    applyPrimaryColorFromConfig,
} from './utils/document-branding';
import { performVersionCheck } from './utils/version-check';
import { isPreviewMode } from './utils/is-preview-mode';
import './styles/index.scss';

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Apply deploy-time document branding (tab title, favicon, web font, and primary color).
applyDocumentTitle();
applyFaviconFromLogo();
applyBrandFontFromConfig();
applyPrimaryColorFromConfig();

// Removed AnalyticsInitializer() call - analytics dependency removed

// Register the PWA service worker ONLY in standalone production builds.
// In dev / preview environments, actively unregister any previously installed
// service worker and purge stale caches so unhashed dev chunks are never served stale.
if ('serviceWorker' in navigator) {
    if (process.env.NODE_ENV === 'production' && !isPreviewMode()) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((error) => {
                console.error('Service worker registration failed:', error);
            });
        });
    } else {
        navigator.serviceWorker
            .getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .catch(() => {});
        if (typeof caches !== 'undefined' && caches.keys) {
            caches
                .keys()
                .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                .catch(() => {});
        }
    }
}

// App Builder preview branding (incl. PREVIEW_READY handshake) is handled by the
// src/preview/ listener, mounted from app-content only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true') and stripped from standalone partner deploys.
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
