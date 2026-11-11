import React from 'react';
import { act, render, screen } from '@testing-library/react';
import SiteRuntimeGate from '@/components/site-runtime-gate/SiteRuntimeGate';
import { generateOAuthURL } from '@/components/shared/utils/config/config';
import { DERIV_CREATE_ACCOUNT_URL } from '@/constants/social-links';
import { recordTenantRealBuyEvent } from '../site-commission-tracker';
import {
    getActiveTenantConfig,
    getTenantBrandName,
    getTenantDerivAppId,
    getTenantReferralLink,
    getTenantTagline,
    initializeTenantRuntime,
    isMasterUntenantedHost,
    setActiveTenantConfig,
    TenantSiteConfig,
} from '../site-runtime-config';

const MOCK_SITE: TenantSiteConfig = {
    id: 'site-test-1',
    owner_id: 'owner-uuid-1',
    slug: 'apex-quant',
    vercel_domain: 'apex-quant.vercel.app',
    custom_domain: '',
    domain_status: 'live',
    status: 'active',
    brand_name: 'Apex Quant Pro',
    tagline: 'ALGO DIGITS DESK',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: '#10B981',
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: '36544',
    oauth_callback_hub_url: 'https://tradepulse-lovat.vercel.app/callback',
    deriv_referral_link: 'https://track.deriv.com/_alpha_partner/1/',
    announcement_text: 'Welcome to Apex Quant Live Desk',
    enabled_tabs: ['id-dbot-dashboard', 'id-bot-builder', 'id-trading-bots'],
    social_links: {
        telegram: 'https://t.me/apexquant',
    },
    include_default_bots: true,
    commission_share_pct: 50,
    custom_bots: [],
};

describe('Multi-Tenant Site Runtime Config, OAuth Relay & Commission Filter', () => {
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

    it('treats <slug>.vercel.app sites as active tenant hosts while preserving master hosts', () => {
        expect(isMasterUntenantedHost('apex-quant.vercel.app')).toBe(false);
        expect(isMasterUntenantedHost('nairobipips.vercel.app')).toBe(false);
        expect(isMasterUntenantedHost('mybrand.site')).toBe(false);

        expect(isMasterUntenantedHost('tradepulse-lovat.vercel.app')).toBe(true);
        expect(isMasterUntenantedHost('localhost')).toBe(true);
        expect(isMasterUntenantedHost('4003-sandbox.e2b.app')).toBe(true);
        expect(isMasterUntenantedHost('tradepulse-git-arena-user.vercel.app')).toBe(true);
    });

    it('hydrates CSS variables, document title, pooled OAuth app_id, referral link, and tab visibility CSS without unmounting DOM indices', () => {
        setActiveTenantConfig(MOCK_SITE);

        expect(getTenantBrandName()).toBe('Apex Quant Pro');
        expect(getTenantTagline()).toBe('ALGO DIGITS DESK');
        expect(getTenantDerivAppId()).toBe('36544');
        expect(getTenantReferralLink()).toBe('https://track.deriv.com/_alpha_partner/1/');
        expect(document.title).toBe('Apex Quant Pro');

        const tabStyle = document.getElementById('tp-tenant-tabs-css');
        expect(tabStyle).not.toBeNull();
        expect(tabStyle?.textContent).toContain('#id-copy-trading');
        expect(tabStyle?.textContent).not.toContain('#id-dbot-dashboard');
    });

    it('routes OAuth login through Central OAuth Callback Relay when tenant origin differs from Callback Hub', async () => {
        setActiveTenantConfig(MOCK_SITE);
        // jsdom default origin is http://localhost, which differs from https://tradepulse-lovat.vercel.app
        const oauthUrl = await generateOAuthURL();
        expect(oauthUrl).toContain('https://tradepulse-lovat.vercel.app/callback?');
        expect(oauthUrl).toContain('tp_relay_start=1');
        expect(oauthUrl).toContain('tenant_slug=apex-quant');
    });

    it('ignores Demo (VRTC) accounts in real-trade commission tracker', async () => {
        setActiveTenantConfig(MOCK_SITE);
        const recordedDemo = await recordTenantRealBuyEvent({
            contractId: '99112233',
            stakeAmount: 25,
            loginid: 'VRTC987654',
            currency: 'USD',
        });
        expect(recordedDemo).toBe(false);
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
        expect(screen.getByText('Welcome to Apex Quant Live Desk')).toBeInTheDocument();

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
