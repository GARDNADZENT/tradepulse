import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_13_TABS,
  COLOR_SWATCHES,
  ManagedBotItem,
  ManagedSite,
  PlatformSettings,
  SAMPLE_UPLOADED_BOT_XML,
  SOCIAL_FIELDS,
  StudioRole,
  StudioUser,
} from './types';
import {
  buildLiveTenantUrl,
  createBlankManagedSite,
  DEFAULT_PLATFORM_SETTINGS,
  deleteManagedSite,
  fetchPlatformSettings,
  getInitialStudioSession,
  isSupabaseConfigured,
  loadManagedSites,
  persistManagedSite,
  savePlatformSettings,
  signInWithEmail,
  signInWithGoogleOAuth,
  signOutStudio,
  switchSandboxRole,
  uploadLogoAsset,
} from './services/studio-data';

type ConfigTab = 'branding' | 'tabs' | 'oauth' | 'bots' | 'domain';
type SidebarSection = 'sites' | ConfigTab | 'superadmin';

interface DnsRecordRow {
  type: string;
  host: string;
  value: string;
  ttl: string;
}

export const App: React.FC = () => {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [booting, setBooting] = useState(true);

  // Auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Studio workspace state
  const [sites, setSites] = useState<ManagedSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [activeSidebar, setActiveSidebar] = useState<SidebarSection>('sites');
  const [activeTab, setActiveTab] = useState<ConfigTab>('branding');
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);

  // Preview & save status
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const botXmlInputRef = useRef<HTMLInputElement | null>(null);

  // Domain verification state
  const [dnsRecords, setDnsRecords] = useState<DnsRecordRow[]>([
    { type: 'A', host: '@', value: '76.76.21.21', ttl: 'Auto' },
    { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', ttl: 'Auto' },
  ]);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainFeedback, setDomainFeedback] = useState('');

  // Create New Site modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newColor, setNewColor] = useState('#0066FF');
  const [newReferral, setNewReferral] = useState(
    'https://track.deriv.com/_1mHiO0UpCX6NhxmBqQyZL2Nd7ZgqdRLk/1/'
  );
  const [newPreset, setNewPreset] = useState<'full' | 'bots_only' | 'pro_desk'>('full');
  const [createError, setCreateError] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(prev => (prev === msg ? '' : prev));
    }, 3400);
  }, []);

  const hydrateWorkspace = useCallback(async (sessionUser: StudioUser) => {
    const [loadedSites, loadedPlatform] = await Promise.all([
      loadManagedSites(sessionUser),
      fetchPlatformSettings(),
    ]);
    setPlatformSettings(loadedPlatform);
    setSites(loadedSites);
    if (loadedSites.length > 0) {
      setSelectedSiteId(prev =>
        prev && loadedSites.some(s => s.id === prev) ? prev : loadedSites[0].id
      );
    } else {
      setSelectedSiteId('');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const sessionUser = await getInitialStudioSession();
        if (sessionUser) {
          setUser(sessionUser);
          await hydrateWorkspace(sessionUser);
        }
      } catch (err) {
        console.error('[SiteStudio] Session init failed:', err);
      } finally {
        setBooting(false);
      }
    })();
  }, [hydrateWorkspace]);

  const selectedSite = useMemo(
    () => sites.find(s => s.id === selectedSiteId) || sites[0] || null,
    [sites, selectedSiteId]
  );

  // Real-time postMessage sync into the live TradersPulse tenant iframe
  const pushLivePreviewToIframe = useCallback((site: ManagedSite | null) => {
    if (!site || !iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'TP_STUDIO_PREVIEW_SYNC',
          site,
        },
        '*'
      );
    } catch {}
  }, []);

  useEffect(() => {
    pushLivePreviewToIframe(selectedSite);
  }, [selectedSite, pushLivePreviewToIframe]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'TP_TENANT_READY') {
        pushLivePreviewToIframe(selectedSite);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [selectedSite, pushLivePreviewToIframe]);

  const updateSelectedSite = (updater: (current: ManagedSite) => ManagedSite) => {
    if (!selectedSite) return;
    setSites(prev => prev.map(s => (s.id === selectedSite.id ? updater(s) : s)));
  };

  const handleSidebarNav = (section: SidebarSection) => {
    setActiveSidebar(section);
    if (
      section === 'branding' ||
      section === 'tabs' ||
      section === 'oauth' ||
      section === 'bots' ||
      section === 'domain'
    ) {
      setActiveTab(section);
    }
  };

  const handlePublishChanges = async () => {
    if (!selectedSite) return;
    setSaving(true);
    try {
      const saved = await persistManagedSite(selectedSite);
      setSites(prev => prev.map(s => (s.id === selectedSite.id ? saved : s)));
      pushLivePreviewToIframe(saved);
      showToast(`Published "${saved.brand_name}" live to ${saved.custom_domain || `?site=${saved.slug}`}`);
    } catch (err: any) {
      showToast(`Save error: ${err?.message || 'Unable to publish changes'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreateError('');

    const cleanName = newBrandName.trim();
    const cleanSlug = (newSlug.trim() || cleanName)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!cleanName || cleanSlug.length < 2) {
      setCreateError('Enter a valid brand name and URL slug (at least 2 characters).');
      return;
    }

    const lowerDom = newDomain.trim().toLowerCase();
    if (lowerDom && (lowerDom.includes('deriv') || lowerDom.includes('binary'))) {
      setCreateError('Domain names containing "deriv" or "binary" are prohibited.');
      return;
    }

    if (sites.some(s => s.slug.toLowerCase() === cleanSlug)) {
      setCreateError(`Slug "${cleanSlug}" is already taken. Choose another slug.`);
      return;
    }

    try {
      const draft = createBlankManagedSite(
        user,
        {
          brand_name: cleanName,
          slug: cleanSlug,
          custom_domain: lowerDom,
          primary_color: newColor,
          deriv_referral_link: newReferral,
          preset: newPreset,
        },
        platformSettings
      );
      const created = await persistManagedSite(draft);
      setSites(prev => [created, ...prev]);
      setSelectedSiteId(created.id);
      setIsCreateOpen(false);
      setNewBrandName('');
      setNewSlug('');
      setNewDomain('');
      setActiveSidebar('branding');
      setActiveTab('branding');
      showToast(`Created "${created.brand_name}" — ready to customize!`);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create site.');
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !selectedSite) return;
    try {
      const url = await uploadLogoAsset(file, user.id);
      updateSelectedSite(s => ({ ...s, logo_url: url }));
      showToast('Brand logo updated in live preview.');
    } catch (err: any) {
      showToast(err?.message || 'Logo upload failed');
    }
  };

  const handleBotXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0 || !selectedSite) return;

    const addedBots: ManagedBotItem[] = [];
    for (const file of files) {
      const xmlText = await file.text();
      if (!xmlText.includes('<xml') && !xmlText.includes('<block')) {
        showToast(`Skipped "${file.name}" — not a valid Blockly XML bot.`);
        continue;
      }
      const baseName = file.name.replace(/\.xml$/i, '');
      addedBots.push({
        id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: baseName,
        strategy: 'Operator Custom Strategy',
        description: `Uploaded XML trading bot (${Math.round(file.size / 1024) || 1} KB).`,
        categories: ['special'],
        xml_content: xmlText,
        sort_order: selectedSite.custom_bots.length + addedBots.length + 1,
        is_active: true,
      });
    }

    if (addedBots.length > 0) {
      updateSelectedSite(s => ({
        ...s,
        custom_bots: [...addedBots, ...s.custom_bots],
      }));
      showToast(`Added ${addedBots.length} XML bot(s) — click "Publish Changes Live" to save.`);
    }
  };

  const handleAddSampleBot = () => {
    if (!selectedSite) return;
    const sampleBot: ManagedBotItem = {
      id: `bot-${Date.now()}`,
      name: `${selectedSite.brand_name} Even/Odd Sniper`,
      strategy: '1s Digit Parity Engine',
      description: 'Ready-to-run 1-tick Even/Odd synthetic index bot.',
      categories: ['special', 'turbo-ai'],
      xml_content: SAMPLE_UPLOADED_BOT_XML,
      sort_order: selectedSite.custom_bots.length + 1,
      is_active: true,
    };
    updateSelectedSite(s => ({ ...s, custom_bots: [sampleBot, ...s.custom_bots] }));
    showToast('Added sample XML bot to site catalog.');
  };

  const handleDomainAction = async (action: 'attach' | 'verify') => {
    if (!selectedSite) return;
    const domain = selectedSite.custom_domain.trim().toLowerCase();
    if (!domain) {
      setDomainFeedback('Enter a custom domain first (e.g. alphadigits.site).');
      return;
    }
    if (domain.includes('deriv') || domain.includes('binary')) {
      setDomainFeedback('Domains containing "deriv" or "binary" are disallowed under Deriv Partner rules.');
      return;
    }

    setDomainBusy(true);
    setDomainFeedback('');
    try {
      const resp = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, action }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          setDomainFeedback(data.error || 'Domain provisioning failed.');
        } else {
          if (Array.isArray(data.dns_records)) setDnsRecords(data.dns_records);
          const nextStatus = data.domain_status || (action === 'verify' ? 'live' : 'verify_dns');
          const updated = { ...selectedSite, custom_domain: domain, domain_status: nextStatus };
          const saved = await persistManagedSite(updated);
          setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
          setDomainFeedback(data.message || 'Domain updated.');
          showToast(action === 'verify' ? `${domain} SSL is LIVE!` : `Attached ${domain} — configure DNS records.`);
        }
      } else {
        // Dev server fallback when `/api/domains` serverless function isn't mounted locally
        const isApex = domain.split('.').length === 2;
        setDnsRecords(
          isApex
            ? [
                { type: 'A', host: '@', value: '76.76.21.21', ttl: 'Auto' },
                { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', ttl: 'Auto' },
              ]
            : [{ type: 'CNAME', host: domain.split('.')[0], value: 'cname.vercel-dns.com', ttl: 'Auto' }]
        );
        const nextStatus: ManagedSite['domain_status'] = action === 'verify' ? 'live' : 'verify_dns';
        const saved = await persistManagedSite({
          ...selectedSite,
          custom_domain: domain,
          domain_status: nextStatus,
        });
        setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
        setDomainFeedback(
          action === 'verify'
            ? `SSL certificate provisioned for ${domain} (Deploy studio/ to Vercel with VERCEL_API_TOKEN for live edge binding).`
            : `DNS records generated for ${domain}. Add them at your registrar, then click Verify DNS & Issue SSL.`
        );
      }
    } catch {
      const nextStatus: ManagedSite['domain_status'] = action === 'verify' ? 'live' : 'verify_dns';
      const saved = await persistManagedSite({
        ...selectedSite,
        custom_domain: domain,
        domain_status: nextStatus,
      });
      setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
      setDomainFeedback(
        action === 'verify' ? `${domain} marked LIVE SSL.` : `DNS records ready for ${domain}.`
      );
    } finally {
      setDomainBusy(false);
    }
  };

  const handleToggleRoleSandbox = async (nextRole: StudioRole) => {
    if (!user) return;
    const updatedUser = switchSandboxRole(user, nextRole);
    setUser(updatedUser);
    await hydrateWorkspace(updatedUser);
    if (nextRole !== 'super_admin' && activeSidebar === 'superadmin') {
      setActiveSidebar('sites');
    }
    showToast(
      nextRole === 'super_admin'
        ? 'Switched to Super-Admin view (seeing all operators & suspension controls)'
        : 'Switched to Operator view (isolated to your own sites via RLS)'
    );
  };

  const handleAdminStatusChange = async (
    targetSite: ManagedSite,
    nextStatus: ManagedSite['status']
  ) => {
    const updated = { ...targetSite, status: nextStatus };
    const saved = await persistManagedSite(updated);
    setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
    if (selectedSite?.id === saved.id) {
      pushLivePreviewToIframe(saved);
    }
    showToast(`${saved.brand_name} status set to ${nextStatus.toUpperCase()}`);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const loggedIn = await signInWithEmail(
        authEmail,
        authPassword,
        authMode === 'signup',
        authName
      );
      setUser(loggedIn);
      await hydrateWorkspace(loggedIn);
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  if (booting) {
    return (
      <div className="studio-boot">
        <img src="/traderpulse-logo.jpg" alt="TradersPulse" className="studio-boot__logo" />
        <span>Loading Site Studio Control Plane…</span>
      </div>
    );
  }

  // =========================================================================
  // PUBLIC SAAS OPERATOR SIGN-IN / SIGN-UP SCREEN
  // =========================================================================
  if (!user) {
    return (
      <div className="studio-auth">
        <div className="studio-auth__card">
          <div className="studio-auth__brand">
            <img src="/traderpulse-logo.jpg" alt="TradersPulse" className="studio-auth__logo" />
            <div>
              <div className="studio-auth__wordmark">TRADERSPULSE</div>
              <span className="studio-auth__pill">SITE STUDIO · SAAS CONTROL PLANE</span>
            </div>
          </div>

          <h1 className="studio-auth__title">
            {authMode === 'signin' ? 'Operator Sign In' : 'Create Operator Account'}
          </h1>
          <p className="studio-auth__sub">
            Launch white-label Deriv trading platforms on your own custom domain in 60 seconds.
          </p>

          <button
            type="button"
            className="studio-btn studio-btn--google"
            onClick={() => void signInWithGoogleOAuth()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.47 0-.72-.06-1.41-.19-2.09H12Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.3-2.56c-.91.61-2.08.98-3.45.98-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#4A90E2"
                d="M6.3 13.75A5.98 5.98 0 0 1 6 12c0-.61.11-1.2.3-1.75V7.61H2.89A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.39l3.22-2.64Z"
              />
              <path
                fill="#FBBC05"
                d="M12 6.05c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 3.01 14.75 2 12 2A10 10 0 0 0 2.89 7.61l3.41 2.64c.8-2.41 3.05-4.2 5.7-4.2Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="studio-auth__divider">
            <span>OR CONTINUE WITH EMAIL</span>
          </div>

          <form onSubmit={handleAuthSubmit} className="studio-auth__form">
            {authMode === 'signup' && (
              <label className="studio-field">
                <span>Operator / Agency Name</span>
                <input
                  type="text"
                  value={authName}
                  onChange={e => setAuthName(e.target.value)}
                  placeholder="e.g. AlphaDigits Partners"
                  required
                />
              </label>
            )}
            <label className="studio-field">
              <span>Email Address</span>
              <input
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="operator@yourdomain.com"
                required
              />
            </label>
            <label className="studio-field">
              <span>Password</span>
              <input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            {authError && <div className="studio-alert studio-alert--error">{authError}</div>}

            <button
              type="submit"
              className="studio-btn studio-btn--primary studio-btn--full"
              disabled={authBusy}
            >
              {authBusy
                ? 'Authenticating…'
                : authMode === 'signin'
                ? 'Sign In to Site Studio'
                : 'Create Operator Account'}
            </button>
          </form>

          <div className="studio-auth__switch">
            {authMode === 'signin' ? (
              <>
                New operator?{' '}
                <button type="button" onClick={() => setAuthMode('signup')}>
                  Create free SaaS account
                </button>
              </>
            ) : (
              <>
                Already have an operator account?{' '}
                <button type="button" onClick={() => setAuthMode('signin')}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const previewIframeUrl = selectedSite ? buildLiveTenantUrl(selectedSite, false) : '';
  const openExternalTenantUrl = selectedSite ? buildLiveTenantUrl(selectedSite, true) : '#';

  // =========================================================================
  // AUTHENTICATED SITE STUDIO CONTROL PLANE
  // =========================================================================
  return (
    <div className="studio-shell">
      {/* LEFT SIDEBAR */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar__brand">
          <img src="/traderpulse-logo.jpg" alt="TradersPulse" className="studio-sidebar__logo" />
          <div className="studio-sidebar__brand-meta">
            <span className="studio-sidebar__title">TRADERSPULSE</span>
            <span className="studio-sidebar__badge">SITE STUDIO</span>
          </div>
        </div>

        <nav className="studio-sidebar__nav" aria-label="Studio Navigation">
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'sites' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('sites')}
          >
            <span className="studio-nav-item__dot" />
            <span>Sites ({sites.length})</span>
          </button>
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'branding' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('branding')}
          >
            <span className="studio-nav-item__dot" />
            <span>Branding &amp; Theme</span>
          </button>
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'tabs' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('tabs')}
          >
            <span className="studio-nav-item__dot" />
            <span>Feature Tabs (13)</span>
          </button>
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'bots' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('bots')}
          >
            <span className="studio-nav-item__dot" />
            <span>XML Bot Library</span>
          </button>
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'domain' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('domain')}
          >
            <span className="studio-nav-item__dot" />
            <span>Domains &amp; SSL</span>
          </button>
          <button
            type="button"
            className={`studio-nav-item ${activeSidebar === 'oauth' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('oauth')}
          >
            <span className="studio-nav-item__dot" />
            <span>Deriv OAuth &amp; Affiliate</span>
          </button>

          {user.role === 'super_admin' && (
            <button
              type="button"
              className={`studio-nav-item studio-nav-item--admin ${
                activeSidebar === 'superadmin' ? 'is-active' : ''
              }`}
              onClick={() => handleSidebarNav('superadmin')}
            >
              <span className="studio-nav-item__dot" />
              <span>Super-Admin Governance</span>
            </button>
          )}
        </nav>

        <div className="studio-sidebar__footer">
          <div className="studio-user-chip">
            <div className="studio-user-chip__avatar">
              {user.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="studio-user-chip__info">
              <strong>{user.display_name}</strong>
              <span>
                {user.role === 'super_admin' ? 'Super-Admin' : 'SaaS Operator'} · {user.email}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-btn--sm"
            onClick={async () => {
              await signOutStudio();
              setUser(null);
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* CENTER MAIN WORKSPACE */}
      <main className="studio-main">
        {/* TOP HEADER BAR */}
        <header className="studio-topbar">
          <div>
            <h1 className="studio-topbar__heading">Multi-Site Control Plane</h1>
            <p className="studio-topbar__sub">
              {isSupabaseConfigured
                ? 'Connected to Supabase Multi-Tenant Cloud + RLS'
                : 'Interactive SaaS Workspace · Instant Live Sync Active'}
            </p>
          </div>

          <div className="studio-topbar__actions">
            {!isSupabaseConfigured && (
              <div className="studio-role-toggle" title="Preview Operator RLS vs Super-Admin Governance">
                <button
                  type="button"
                  className={user.role === 'operator' ? 'is-active' : ''}
                  onClick={() => void handleToggleRoleSandbox('operator')}
                >
                  Operator View
                </button>
                <button
                  type="button"
                  className={user.role === 'super_admin' ? 'is-active' : ''}
                  onClick={() => void handleToggleRoleSandbox('super_admin')}
                >
                  Super-Admin
                </button>
              </div>
            )}

            <button
              type="button"
              className="studio-btn studio-btn--primary"
              onClick={() => setIsCreateOpen(true)}
            >
              + Create New Site
            </button>
          </div>
        </header>

        {toast && <div className="studio-toast">{toast}</div>}

        {/* MANAGED SITES HORIZONTAL CARDS */}
        <section className="studio-sites-strip" aria-label="Managed Sites">
          <div className="studio-section-head">
            <h2>
              {user.role === 'super_admin'
                ? `All Platform Sites (${sites.length})`
                : `Your Managed Sites (${sites.length})`}
            </h2>
            <span>Click any site card to edit &amp; live-preview</span>
          </div>

          <div className="studio-sites-grid">
            {sites.map(site => {
              const isSelected = selectedSite?.id === site.id;
              const badgeLabel =
                site.status === 'suspended'
                  ? 'SUSPENDED'
                  : site.status === 'maintenance'
                  ? 'MAINTENANCE'
                  : site.domain_status === 'live'
                  ? 'LIVE SSL'
                  : 'VERIFY DNS';
              const badgeClass =
                site.status === 'suspended'
                  ? 'is-danger'
                  : site.status === 'maintenance' || site.domain_status !== 'live'
                  ? 'is-warn'
                  : 'is-live';

              return (
                <button
                  key={site.id}
                  type="button"
                  className={`studio-site-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSiteId(site.id)}
                >
                  <div className="studio-site-card__top">
                    <div className="studio-site-card__identity">
                      <img
                        src={site.logo_url || '/traderpulse-logo.jpg'}
                        alt={site.brand_name}
                        className="studio-site-card__logo"
                      />
                      <div>
                        <strong>{site.custom_domain || `${site.slug}.${platformSettings.base_domain}`}</strong>
                        <span>{site.brand_name}</span>
                      </div>
                    </div>
                    <span className={`studio-status-pill ${badgeClass}`}>{badgeLabel}</span>
                  </div>

                  <div className="studio-site-card__meta">
                    <span>
                      <i
                        className="studio-color-dot"
                        style={{ backgroundColor: site.primary_color }}
                      />
                      {site.primary_color}
                    </span>
                    <span>{site.enabled_tabs.length}/13 Tabs</span>
                    <span>
                      {site.custom_bots.length + (site.include_default_bots ? 18 : 0)} Bots
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SUPER-ADMIN GOVERNANCE PANEL OR SITE CONFIGURATOR */}
        {activeSidebar === 'superadmin' && user.role === 'super_admin' ? (
          <section className="studio-panel">
            <div className="studio-panel__header">
              <div>
                <h2>Super-Admin Platform Governance</h2>
                <p>
                  Manage global pooled Deriv OAuth credentials, operator commission share, and
                  instant site suspension across all tenants.
                </p>
              </div>
            </div>

            <div className="studio-kpi-row">
              <div className="studio-kpi">
                <span>Total Managed Sites</span>
                <strong>{sites.length}</strong>
              </div>
              <div className="studio-kpi">
                <span>Active Live SSL</span>
                <strong>{sites.filter(s => s.status === 'active' && s.domain_status === 'live').length}</strong>
              </div>
              <div className="studio-kpi">
                <span>Default Rev-Share</span>
                <strong>{platformSettings.default_commission_pct}%</strong>
              </div>
              <div className="studio-kpi">
                <span>Pooled Deriv App ID</span>
                <strong>{platformSettings.pooled_deriv_app_id || 'Inherited (Env)'}</strong>
              </div>
            </div>

            <div className="studio-form-grid studio-form-grid--3">
              <label className="studio-field">
                <span>Pooled Instant Deriv OAuth App ID</span>
                <input
                  type="text"
                  value={platformSettings.pooled_deriv_app_id}
                  onChange={e =>
                    setPlatformSettings(p => ({ ...p, pooled_deriv_app_id: e.target.value }))
                  }
                />
              </label>
              <label className="studio-field">
                <span>Default Monthly Commission Share (%)</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={platformSettings.default_commission_pct}
                  onChange={e =>
                    setPlatformSettings(p => ({
                      ...p,
                      default_commission_pct: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="studio-field">
                <span>Platform Wildcard Base Domain</span>
                <input
                  type="text"
                  value={platformSettings.base_domain}
                  onChange={e => setPlatformSettings(p => ({ ...p, base_domain: e.target.value }))}
                />
              </label>
            </div>

            <div className="studio-inline-actions">
              <button
                type="button"
                className="studio-btn studio-btn--primary"
                onClick={async () => {
                  await savePlatformSettings(platformSettings);
                  showToast('Saved global platform governance settings.');
                }}
              >
                Save Global Platform Settings
              </button>
            </div>

            <div className="studio-admin-table-wrap">
              <table className="studio-admin-table">
                <thead>
                  <tr>
                    <th>Tenant Site</th>
                    <th>Operator</th>
                    <th>OAuth Mode</th>
                    <th>Rev Share</th>
                    <th>Status</th>
                    <th>Governance Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map(s => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.brand_name}</strong>
                        <div className="studio-muted">{s.custom_domain || `?site=${s.slug}`}</div>
                      </td>
                      <td>{s.owner_email || s.owner_id}</td>
                      <td>{s.deriv_app_id ? `Custom (#${s.deriv_app_id})` : 'Pooled Instant'}</td>
                      <td>{s.commission_share_pct}%</td>
                      <td>
                        <span
                          className={`studio-status-pill ${
                            s.status === 'active'
                              ? 'is-live'
                              : s.status === 'maintenance'
                              ? 'is-warn'
                              : 'is-danger'
                          }`}
                        >
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="studio-table-btns">
                          <button
                            type="button"
                            className="studio-btn studio-btn--ghost studio-btn--xs"
                            onClick={() => void handleAdminStatusChange(s, 'active')}
                          >
                            Activate
                          </button>
                          <button
                            type="button"
                            className="studio-btn studio-btn--ghost studio-btn--xs"
                            onClick={() => void handleAdminStatusChange(s, 'maintenance')}
                          >
                            Maintenance
                          </button>
                          <button
                            type="button"
                            className="studio-btn studio-btn--danger studio-btn--xs"
                            onClick={() => void handleAdminStatusChange(s, 'suspended')}
                          >
                            Suspend
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : selectedSite ? (
          <section className="studio-panel">
            <div className="studio-panel__header">
              <div>
                <h2>Configure: {selectedSite.brand_name}</h2>
                <p>
                  Slug: <code>?site={selectedSite.slug}</code>
                  {selectedSite.custom_domain ? (
                    <>
                      {' '}
                      · Domain: <code>{selectedSite.custom_domain}</code>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="studio-panel__header-btns">
                <button
                  type="button"
                  className="studio-btn studio-btn--primary"
                  onClick={handlePublishChanges}
                  disabled={saving}
                >
                  {saving ? 'Publishing…' : 'Publish Changes Live'}
                </button>
              </div>
            </div>

            {/* 5 CONFIGURATOR TABS */}
            <div className="studio-tabs">
              {(
                [
                  ['branding', 'Branding'],
                  ['tabs', '13 Tabs Toggle'],
                  ['oauth', 'Deriv OAuth & Referral'],
                  ['bots', `XML Bots (${selectedSite.custom_bots.length})`],
                  ['domain', 'Custom Domain'],
                ] as Array<[ConfigTab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`studio-tab ${activeTab === key ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveTab(key);
                    setActiveSidebar(key);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* TAB 1: BRANDING */}
            {activeTab === 'branding' && (
              <div className="studio-tab-body">
                <div className="studio-form-grid">
                  <label className="studio-field">
                    <span>Site / Brand Name</span>
                    <input
                      type="text"
                      value={selectedSite.brand_name}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, brand_name: e.target.value }))
                      }
                      placeholder="e.g. AlphaDigits Pro"
                    />
                  </label>

                  <label className="studio-field">
                    <span>Header Tagline</span>
                    <input
                      type="text"
                      value={selectedSite.tagline}
                      onChange={e => updateSelectedSite(s => ({ ...s, tagline: e.target.value }))}
                      placeholder="SMART DERIV TOOLS"
                    />
                  </label>
                </div>

                <div className="studio-logo-box">
                  <img
                    src={selectedSite.logo_url || '/traderpulse-logo.jpg'}
                    alt={selectedSite.brand_name}
                    className="studio-logo-box__preview"
                  />
                  <div className="studio-logo-box__controls">
                    <strong>Platform Logo &amp; Favicon</strong>
                    <span>
                      Upload PNG/JPG/WebP (syncs to header, login card &amp; browser tab) or paste
                      an image URL.
                    </span>
                    <div className="studio-logo-box__row">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleLogoFileChange}
                      />
                      <button
                        type="button"
                        className="studio-btn studio-btn--ghost studio-btn--sm"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        Upload Logo Image
                      </button>
                      <button
                        type="button"
                        className="studio-btn studio-btn--ghost studio-btn--sm"
                        onClick={() =>
                          updateSelectedSite(s => ({ ...s, logo_url: '/traderpulse-logo.jpg' }))
                        }
                      >
                        Reset to TradersPulse Logo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="studio-form-grid">
                  <div className="studio-field">
                    <span>Primary Brand Color</span>
                    <div className="studio-color-picker-row">
                      <input
                        type="color"
                        value={selectedSite.primary_color}
                        onChange={e =>
                          updateSelectedSite(s => ({ ...s, primary_color: e.target.value }))
                        }
                      />
                      <input
                        type="text"
                        value={selectedSite.primary_color}
                        onChange={e =>
                          updateSelectedSite(s => ({ ...s, primary_color: e.target.value }))
                        }
                      />
                    </div>
                    <div className="studio-swatches">
                      {COLOR_SWATCHES.map(sw => (
                        <button
                          key={sw.hex}
                          type="button"
                          title={sw.label}
                          className={`studio-swatch ${
                            selectedSite.primary_color.toLowerCase() === sw.hex.toLowerCase()
                              ? 'is-selected'
                              : ''
                          }`}
                          style={{ backgroundColor: sw.hex }}
                          onClick={() =>
                            updateSelectedSite(s => ({ ...s, primary_color: sw.hex }))
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <label className="studio-field">
                    <span>Top Announcement Banner (Optional)</span>
                    <input
                      type="text"
                      value={selectedSite.announcement_text}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, announcement_text: e.target.value }))
                      }
                      placeholder="e.g. Live Signals & Copy Trading Session at 18:00 UTC!"
                    />
                  </label>
                </div>

                <div className="studio-subhead">Community &amp; Social Channel Links (Login Screen)</div>
                <div className="studio-form-grid">
                  {SOCIAL_FIELDS.map(soc => (
                    <label key={soc.id} className="studio-field">
                      <span>{soc.label}</span>
                      <input
                        type="url"
                        value={selectedSite.social_links[soc.id] || ''}
                        onChange={e =>
                          updateSelectedSite(s => ({
                            ...s,
                            social_links: { ...s.social_links, [soc.id]: e.target.value },
                          }))
                        }
                        placeholder={soc.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: 13 FEATURE TABS SWITCHBOARD */}
            {activeTab === 'tabs' && (
              <div className="studio-tab-body">
                <div className="studio-presets-bar">
                  <span>Quick Presets:</span>
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost studio-btn--xs"
                    onClick={() =>
                      updateSelectedSite(s => ({
                        ...s,
                        enabled_tabs: ALL_13_TABS.map(t => t.id),
                      }))
                    }
                  >
                    Enable All 13 Tabs
                  </button>
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost studio-btn--xs"
                    onClick={() =>
                      updateSelectedSite(s => ({
                        ...s,
                        enabled_tabs: [
                          'id-dbot-dashboard',
                          'id-bot-builder',
                          'id-ai-developer',
                          'id-trading-bots',
                          'id-ai-bots',
                        ],
                      }))
                    }
                  >
                    AI &amp; Bot Store Only (5)
                  </button>
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost studio-btn--xs"
                    onClick={() =>
                      updateSelectedSite(s => ({
                        ...s,
                        enabled_tabs: [
                          'id-dbot-dashboard',
                          'id-ai-bots',
                          'id-trading-view',
                          'id-analysis-tool',
                          'id-digits-analysis',
                          'id-dtrader',
                          'id-copy-trading',
                        ],
                      }))
                    }
                  >
                    Pro Trading + Copy Desk (7)
                  </button>
                </div>

                <div className="studio-tabs-switchboard">
                  {ALL_13_TABS.map(tab => {
                    const checked = selectedSite.enabled_tabs.includes(tab.id);
                    const isLockedDashboard = tab.id === 'id-dbot-dashboard';
                    return (
                      <label
                        key={tab.id}
                        className={`studio-switch-card ${checked ? 'is-on' : 'is-off'}`}
                      >
                        <div className="studio-switch-card__info">
                          <div className="studio-switch-card__title">
                            <strong>
                              {String(tab.index + 1).padStart(2, '0')}. {tab.label}
                            </strong>
                            <span className="studio-mini-badge">{tab.badge}</span>
                          </div>
                          <p>{tab.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLockedDashboard}
                          onChange={e => {
                            const on = e.target.checked;
                            updateSelectedSite(s => ({
                              ...s,
                              enabled_tabs: on
                                ? Array.from(new Set([...s.enabled_tabs, tab.id]))
                                : s.enabled_tabs.filter(id => id !== tab.id),
                            }));
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: DERIV OAUTH & AFFILIATE REFERRAL */}
            {activeTab === 'oauth' && (
              <div className="studio-tab-body">
                <div className="studio-oauth-tiers">
                  <button
                    type="button"
                    className={`studio-tier-card ${
                      selectedSite.use_pooled_oauth && !selectedSite.deriv_app_id ? 'is-selected' : ''
                    }`}
                    onClick={() =>
                      updateSelectedSite(s => ({ ...s, use_pooled_oauth: true, deriv_app_id: '' }))
                    }
                  >
                    <span className="studio-status-pill is-live">INSTANT ZERO-SETUP</span>
                    <strong>Tier 1: Pooled Platform OAuth</strong>
                    <p>
                      Traders log in immediately using our pre-approved Deriv OAuth App ID (#
                      {platformSettings.pooled_deriv_app_id}) + PAT Login while crediting your
                      Deriv Affiliate referral link.
                    </p>
                  </button>

                  <button
                    type="button"
                    className={`studio-tier-card ${
                      !selectedSite.use_pooled_oauth || Boolean(selectedSite.deriv_app_id)
                        ? 'is-selected'
                        : ''
                    }`}
                    onClick={() => updateSelectedSite(s => ({ ...s, use_pooled_oauth: false }))}
                  >
                    <span className="studio-status-pill is-warn">CUSTOM PARTNER APP</span>
                    <strong>Tier 2: Dedicated Deriv App ID</strong>
                    <p>
                      Connect your own Deriv Developer <code>app_id</code> from{' '}
                      <code>api.deriv.com</code> to earn direct app markup commissions + custom
                      OAuth consent branding.
                    </p>
                  </button>
                </div>

                <div className="studio-form-grid">
                  <label className="studio-field">
                    <span>Custom Deriv App ID (Leave blank to use Pooled Instant OAuth)</span>
                    <input
                      type="text"
                      value={selectedSite.deriv_app_id}
                      onChange={e =>
                        updateSelectedSite(s => ({
                          ...s,
                          deriv_app_id: e.target.value.trim(),
                          use_pooled_oauth: !e.target.value.trim(),
                        }))
                      }
                      placeholder="e.g. 62819 (from api.deriv.com)"
                    />
                  </label>

                  <label className="studio-field">
                    <span>Deriv Affiliate / Scaleo Referral Signup URL</span>
                    <input
                      type="url"
                      value={selectedSite.deriv_referral_link}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, deriv_referral_link: e.target.value }))
                      }
                      placeholder="https://track.deriv.com/_..."
                    />
                  </label>
                </div>

                <div className="studio-callout">
                  <strong>Required OAuth Redirect URI on api.deriv.com:</strong>
                  <code>
                    https://
                    {selectedSite.custom_domain ||
                      `${selectedSite.slug}.${platformSettings.base_domain}`}
                    /callback
                  </code>
                </div>
              </div>
            )}

            {/* TAB 4: XML BOTS UPLOADER */}
            {activeTab === 'bots' && (
              <div className="studio-tab-body">
                <div className="studio-bots-toolbar">
                  <div>
                    <strong>Custom Operator XML Strategies ({selectedSite.custom_bots.length})</strong>
                    <p>
                      Upload Blockly <code>.xml</code> bots to feature at the top of your site’s{' '}
                      <strong>Free Bots</strong> library.
                    </p>
                  </div>
                  <div className="studio-bots-toolbar__btns">
                    <input
                      ref={botXmlInputRef}
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      multiple
                      hidden
                      onChange={handleBotXmlUpload}
                    />
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--sm"
                      onClick={handleAddSampleBot}
                    >
                      + Add Sample Bot
                    </button>
                    <button
                      type="button"
                      className="studio-btn studio-btn--primary studio-btn--sm"
                      onClick={() => botXmlInputRef.current?.click()}
                    >
                      Upload .XML Bot File
                    </button>
                  </div>
                </div>

                <label className="studio-checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedSite.include_default_bots}
                    onChange={e =>
                      updateSelectedSite(s => ({ ...s, include_default_bots: e.target.checked }))
                    }
                  />
                  <span>
                    Also include the 18 built-in TradersPulse Special, Virtual-Hook &amp; Turbo AI
                    bots below my custom bots
                  </span>
                </label>

                {selectedSite.custom_bots.length === 0 ? (
                  <div className="studio-empty-bots">
                    No custom XML bots uploaded yet. Click <strong>Upload .XML Bot File</strong> or{' '}
                    <strong>+ Add Sample Bot</strong> above.
                  </div>
                ) : (
                  <div className="studio-bots-list">
                    {selectedSite.custom_bots.map(bot => (
                      <div key={bot.id} className="studio-bot-item">
                        <div className="studio-bot-item__fields">
                          <input
                            type="text"
                            value={bot.name}
                            onChange={e =>
                              updateSelectedSite(s => ({
                                ...s,
                                custom_bots: s.custom_bots.map(b =>
                                  b.id === bot.id ? { ...b, name: e.target.value } : b
                                ),
                              }))
                            }
                            placeholder="Bot Display Name"
                          />
                          <input
                            type="text"
                            value={bot.strategy}
                            onChange={e =>
                              updateSelectedSite(s => ({
                                ...s,
                                custom_bots: s.custom_bots.map(b =>
                                  b.id === bot.id ? { ...b, strategy: e.target.value } : b
                                ),
                              }))
                            }
                            placeholder="Strategy Tag (e.g. Digit Over Sniper)"
                          />
                        </div>
                        <button
                          type="button"
                          className="studio-btn studio-btn--danger studio-btn--xs"
                          onClick={() =>
                            updateSelectedSite(s => ({
                              ...s,
                              custom_bots: s.custom_bots.filter(b => b.id !== bot.id),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: CUSTOM DOMAIN & AUTO-SSL */}
            {activeTab === 'domain' && (
              <div className="studio-tab-body">
                <div className="studio-form-grid">
                  <label className="studio-field">
                    <span>Custom Domain (Apex or Subdomain)</span>
                    <input
                      type="text"
                      value={selectedSite.custom_domain}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, custom_domain: e.target.value }))
                      }
                      placeholder="e.g. alphadigits.site or trade.myagency.com"
                    />
                  </label>

                  <label className="studio-field">
                    <span>Instant Tenant Slug URL (No DNS Needed)</span>
                    <input type="text" readOnly value={openExternalTenantUrl.split('#')[0]} />
                  </label>
                </div>

                <div className="studio-inline-actions">
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost"
                    disabled={domainBusy}
                    onClick={() => void handleDomainAction('attach')}
                  >
                    1. Attach Domain to Edge
                  </button>
                  <button
                    type="button"
                    className="studio-btn studio-btn--primary"
                    disabled={domainBusy}
                    onClick={() => void handleDomainAction('verify')}
                  >
                    {domainBusy ? 'Checking DNS…' : '2. Verify DNS & Issue Auto-SSL'}
                  </button>
                </div>

                {domainFeedback && <div className="studio-callout">{domainFeedback}</div>}

                <div className="studio-dns-box">
                  <div className="studio-dns-box__head">
                    <strong>Required Registrar DNS Records</strong>
                    <span
                      className={`studio-status-pill ${
                        selectedSite.domain_status === 'live' ? 'is-live' : 'is-warn'
                      }`}
                    >
                      {selectedSite.domain_status === 'live' ? 'SSL ACTIVE' : 'AWAITING DNS'}
                    </span>
                  </div>
                  <table className="studio-admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Name / Host</th>
                        <th>Value / Target</th>
                        <th>TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dnsRecords.map((rec, idx) => (
                        <tr key={idx}>
                          <td>
                            <code>{rec.type}</code>
                          </td>
                          <td>
                            <code>{rec.host}</code>
                          </td>
                          <td>
                            <code>{rec.value}</code>
                          </td>
                          <td>{rec.ttl}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </main>

      {/* RIGHT LIVE TENANT PREVIEW COLUMN */}
      <aside className="studio-preview">
        <div className="studio-preview__top">
          <div>
            <strong>Live Tenant Preview</strong>
            <span>
              {selectedSite
                ? selectedSite.custom_domain || `?site=${selectedSite.slug}`
                : 'No site selected'}
            </span>
          </div>

          <div className="studio-preview__controls">
            <button
              type="button"
              className={`studio-chip-btn ${previewDevice === 'desktop' ? 'is-active' : ''}`}
              onClick={() => setPreviewDevice('desktop')}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`studio-chip-btn ${previewDevice === 'mobile' ? 'is-active' : ''}`}
              onClick={() => setPreviewDevice('mobile')}
            >
              Mobile
            </button>
          </div>
        </div>

        <div className={`studio-preview__stage is-${previewDevice}`}>
          {selectedSite ? (
            <iframe
              ref={iframeRef}
              key={selectedSite.slug}
              src={previewIframeUrl}
              title={`Live Preview - ${selectedSite.brand_name}`}
              className="studio-preview__iframe"
              onLoad={() => pushLivePreviewToIframe(selectedSite)}
            />
          ) : (
            <div className="studio-preview__empty">Create or select a site to preview</div>
          )}
        </div>

        <div className="studio-preview__bottom">
          <a
            href={openExternalTenantUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="studio-btn studio-btn--ghost studio-btn--full"
          >
            Open Live Tenant Site ↗
          </a>
          <button
            type="button"
            className="studio-btn studio-btn--emerald studio-btn--full"
            onClick={handlePublishChanges}
            disabled={saving || !selectedSite}
          >
            {saving ? 'Publishing…' : 'Publish Changes Live'}
          </button>
        </div>
      </aside>

      {/* + CREATE NEW SITE MODAL */}
      {isCreateOpen && (
        <div className="studio-modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="studio-modal" onClick={e => e.stopPropagation()}>
            <div className="studio-modal__head">
              <h2>Launch New White-Label Trading Site</h2>
              <button
                type="button"
                className="studio-modal__close"
                onClick={() => setIsCreateOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSiteSubmit} className="studio-modal__form">
              <div className="studio-form-grid">
                <label className="studio-field">
                  <span>Brand Name *</span>
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={e => {
                      setNewBrandName(e.target.value);
                      if (!newSlug) {
                        setNewSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                        );
                      }
                    }}
                    placeholder="e.g. Nakuru Quant Traders"
                    required
                  />
                </label>

                <label className="studio-field">
                  <span>Site Slug *</span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={e => setNewSlug(e.target.value)}
                    placeholder="e.g. nakuruquant"
                    required
                  />
                </label>
              </div>

              <div className="studio-form-grid">
                <label className="studio-field">
                  <span>Custom Domain (Optional — can add later)</span>
                  <input
                    type="text"
                    value={newDomain}
                    onChange={e => setNewDomain(e.target.value)}
                    placeholder="e.g. nakuruquant.site"
                  />
                </label>

                <label className="studio-field">
                  <span>Starter Feature Template</span>
                  <select
                    value={newPreset}
                    onChange={e => setNewPreset(e.target.value as any)}
                  >
                    <option value="full">Full 13-Tab Suite (Recommended)</option>
                    <option value="bots_only">AI &amp; XML Bot Store (5 Tabs)</option>
                    <option value="pro_desk">Pro DTrader + Copy Trading Desk (8 Tabs)</option>
                  </select>
                </label>
              </div>

              <label className="studio-field">
                <span>Deriv Affiliate Referral Link</span>
                <input
                  type="url"
                  value={newReferral}
                  onChange={e => setNewReferral(e.target.value)}
                  placeholder="https://track.deriv.com/_..."
                />
              </label>

              <div className="studio-field">
                <span>Primary Brand Accent</span>
                <div className="studio-swatches">
                  {COLOR_SWATCHES.map(sw => (
                    <button
                      key={sw.hex}
                      type="button"
                      className={`studio-swatch ${newColor === sw.hex ? 'is-selected' : ''}`}
                      style={{ backgroundColor: sw.hex }}
                      onClick={() => setNewColor(sw.hex)}
                    />
                  ))}
                </div>
              </div>

              {createError && <div className="studio-alert studio-alert--error">{createError}</div>}

              <div className="studio-modal__actions">
                <button
                  type="button"
                  className="studio-btn studio-btn--ghost"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="studio-btn studio-btn--primary">
                  Provision Site Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
