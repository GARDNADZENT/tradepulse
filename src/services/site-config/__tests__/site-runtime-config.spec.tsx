import React from 'react';
import { act, render, screen } from '@testing-library/react';
import SiteRuntimeGate from '@/components/site-runtime-gate/SiteRuntimeGate';
import { DERIV_CREATE_ACCOUNT_URL } from '@/constants/social-links';
import {
    getActiveTenantConfig,
    getTenantBrandName,
    getTenantDerivAppId,
    getTenantReferralLink,
    getTenantTagline,
    initializeTenantRuntime,
    setActiveTenantConfig,
    TenantSiteConfig,
} from '../site-runtime-config';

const MOCK_SITE: TenantSiteConfig = {
    id: 'site-test-1',
    slug: 'alphadigits',
    custom_domain: 'alphadigits.site',
    domain_status: 'live',
    status: 'active',
    brand_name: 'AlphaDigits Pro',
    tagline: 'ALGO DIGITS DESK',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: '#10B981',
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: '36544',
    deriv_referral_link: 'https://track.deriv.com/_alpha_partner/1/',
    announcement_text: 'Welcome to AlphaDigits Live Desk',
    enabled_tabs: ['id-dbot-dashboard', 'id-bot-builder', 'id-free-bots'],
    social_links: {
        telegram: 'https://t.me/alphadigits',
    },
    include_default_bots: true,
    custom_bots: [],
};

describe('Multi-Tenant Site Runtime Config & Gate', () => {
    afterEach(() => {
        act(() => {
            setActiveTenantConfig(null);
        });
        localStorage.clear();
        sessionStorage.clear();
    });

    it('falls back cleanly to default TradersPulse branding and affiliate URL when no tenant is active', () => {
        expect(getActiveTenantConfig()).toBeNull();
        expect(getTenantBrandName()).toBe('TradersPulse');
        expect(getTenantTagline()).toBe('SMART DERIV TOOLS');
        expect(getTenantDerivAppId()).toBe('');
        expect(getTenantReferralLink()).toBe(DERIV_CREATE_ACCOUNT_URL);
        expect(document.getElementById('tp-tenant-tabs-css')).toBeNull();
    });

    it('hydrates CSS variables, document title, pooled OAuth app_id, referral link, and tab visibility CSS without unmounting DOM indices', () => {
        setActiveTenantConfig(MOCK_SITE);

        expect(getTenantBrandName()).toBe('AlphaDigits Pro');
        expect(getTenantTagline()).toBe('ALGO DIGITS DESK');
        expect(getTenantDerivAppId()).toBe('36544');
        expect(getTenantReferralLink()).toBe('https://track.deriv.com/_alpha_partner/1/');
        expect(document.title).toBe('AlphaDigits Pro');

        const tabStyle = document.getElementById('tp-tenant-tabs-css');
        expect(tabStyle).not.toBeNull();
        expect(tabStyle?.textContent).toContain('#id-copy-trading');
        expect(tabStyle?.textContent).not.toContain('#id-dbot-dashboard');
    });

    it('prefers dedicated custom deriv_app_id over pooled_deriv_app_id when configured', () => {
        setActiveTenantConfig({
            ...MOCK_SITE,
            deriv_app_id: '62819',
            use_pooled_oauth: false,
        });
        expect(getTenantDerivAppId()).toBe('62819');
    });

    it('accepts live TP_STUDIO_PREVIEW_SYNC postMessage updates from Site Studio', async () => {
        await initializeTenantRuntime();

        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    data: {
                        type: 'TP_STUDIO_PREVIEW_SYNC',
                        site: {
                            ...MOCK_SITE,
                            brand_name: 'Nairobi Quant Hub',
                        },
                    },
                })
            );
        });

        expect(getTenantBrandName()).toBe('Nairobi Quant Hub');
    });

    it('renders announcement banner when active and blocks access when status is suspended', () => {
        setActiveTenantConfig(MOCK_SITE);
        const { rerender } = render(
            <SiteRuntimeGate>
                <div data-testid='app-content'>Trading Workspace</div>
            </SiteRuntimeGate>
        );

        expect(screen.getByTestId('app-content')).toBeInTheDocument();
        expect(screen.getByText('Welcome to AlphaDigits Live Desk')).toBeInTheDocument();

        act(() => {
            setActiveTenantConfig({
                ...MOCK_SITE,
                status: 'suspended',
            });
        });

        rerender(
            <SiteRuntimeGate>
                <div data-testid='app-content'>Trading Workspace</div>
            </SiteRuntimeGate>
        );

        expect(screen.queryByTestId('app-content')).toBeNull();
        expect(screen.getByText('SITE SUSPENDED')).toBeInTheDocument();
    });
});
