describe('applyPrimaryColorFromConfig', () => {
    afterEach(() => {
        // The CSS vars are set on the shared jsdom <html>; clear between cases.
        document.documentElement.removeAttribute('style');
        jest.resetModules();
    });

    it('applies brand.config.json colors.primary to the brand CSS vars', () => {
        jest.isolateModules(() => {
            jest.doMock('../../../brand.config.json', () => ({ colors: { primary: '#ff00ff' } }));
            const { applyPrimaryColorFromConfig } = require('../document-branding');

            applyPrimaryColorFromConfig();

            const root = document.documentElement;
            // applyPrimaryColor() sets both the semantic name and the legacy alias the UI reads.
            expect(root.style.getPropertyValue('--brand-primary')).toBe('#ff00ff');
            expect(root.style.getPropertyValue('--brand-red-coral')).toBe('#ff00ff');
        });
    });

    it('is a no-op when colors.primary is absent', () => {
        jest.isolateModules(() => {
            jest.doMock('../../../brand.config.json', () => ({ colors: {} }));
            const { applyPrimaryColorFromConfig } = require('../document-branding');

            applyPrimaryColorFromConfig();

            expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('');
        });
    });
});

describe('applyFaviconFromLogo', () => {
    const RealImage = global.Image;
    let imageProbeCount = 0;

    beforeEach(() => {
        imageProbeCount = 0;
        // Minimal Image stub that counts probe attempts (each candidate sets `src`).
        // @ts-expect-error - partial stub is enough for the probing path under test.
        global.Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) {
                imageProbeCount += 1;
            }
        };
    });

    afterEach(() => {
        global.Image = RealImage;
        jest.resetModules();
    });

    it('probes logo candidates in standalone (non-preview) builds', () => {
        jest.isolateModules(() => {
            jest.doMock('../is-preview-mode', () => ({ isPreviewMode: () => false }));
            const { applyFaviconFromLogo } = require('../document-branding');

            applyFaviconFromLogo();

            expect(imageProbeCount).toBeGreaterThan(0);
        });
    });

    it('sets the TradersPulse logo favicon directly in the preview build without probing', () => {
        jest.isolateModules(() => {
            jest.doMock('../is-preview-mode', () => ({
                isPreviewMode: () => true,
                PREVIEW_BASE_PATH: '/bot/preview',
            }));
            const { applyFaviconFromLogo } = require('../document-branding');

            applyFaviconFromLogo();

            expect(imageProbeCount).toBe(0);
            const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
            expect(link?.href).toContain('/bot/preview/traderpulse-logo.jpg');
        });
    });

    it('falls back to the provided /traderpulse-logo.jpg favicon when candidate probes fail', () => {
        // @ts-expect-error - partial stub is enough for the failing-probe path under test.
        global.Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) {
                this.onerror?.();
            }
        };

        jest.isolateModules(() => {
            jest.doMock('../is-preview-mode', () => ({
                isPreviewMode: () => false,
                PREVIEW_BASE_PATH: '/bot/preview',
            }));
            const { applyFaviconFromLogo } = require('../document-branding');

            applyFaviconFromLogo();

            const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
            expect(link?.href).toContain('/traderpulse-logo.jpg');
        });
    });
});
