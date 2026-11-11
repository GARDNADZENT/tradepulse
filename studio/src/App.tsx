import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_13_TABS,
  COLOR_SWATCHES,
  CommissionRecord,
  ManagedBotItem,
  ManagedSite,
  PAYOUT_METHODS,
  PayoutRecord,
  PlatformSettings,
  SOCIAL_FIELDS,
  SocialPlatformKey,
  StudioUser,
} from './types';
import {
  buildLiveTenantUrl,
  buildPreviewTenantUrl,
  checkVercelSubdomainAvailability,
  connectedSupabaseHost,
  createConfiguredManagedSite,
  DEFAULT_PLATFORM_SETTINGS,
  deleteManagedSite,
  fetchPlatformSettings,
  FLAGSHIP_SUPERADMIN_SLUG,
  getInitialStudioSession,
  isSupabaseConfigured,
  loadCommissionLedger,
  loadManagedSites,
  markSiteCommissionsPaid,
  persistManagedSite,
  provisionVercelSubdomain,
  resendConfirmationEmail,
  savePlatformSettings,
  signInWithEmail,
  signInWithGoogleOAuth,
  signOutStudio,
  studioSupabase,
  uploadLogoAsset,
} from './services/studio-data';

type ConfigTab = 'branding' | 'tabs' | 'bots' | 'domain' | 'commissions';
type SidebarSection = 'sites' | ConfigTab | 'superadmin';

interface DnsRecordRow {
  type: string;
  host: string;
  value: string;
  ttl: string;
}

const formatUsd = (val: number): string =>
  `$${Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const App: React.FC = () => {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [booting, setBooting] = useState(true);

  // Auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Studio workspace state
  const [sites, setSites] = useState<ManagedSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [activeSidebar, setActiveSidebar] = useState<SidebarSection>('sites');
  const [activeTab, setActiveTab] = useState<ConfigTab>('branding');
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [markingPaidSiteId, setMarkingPaidSiteId] = useState<string>('');

  // Preview & save status
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const botXmlInputRef = useRef<HTMLInputElement | null>(null);
  const wizardLogoInputRef = useRef<HTMLInputElement | null>(null);
  const wizardBotXmlInputRef = useRef<HTMLInputElement | null>(null);

  // Domain verification state
  const [dnsRecords, setDnsRecords] = useState<DnsRecordRow[]>([
    { type: 'A', host: '@', value: '76.76.21.21', ttl: 'Auto' },
    { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', ttl: 'Auto' },
  ]);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainFeedback, setDomainFeedback] = useState('');

  // 3-Step Create Site Wizard state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [newBrandName, setNewBrandName] = useState('');
  const [newTagline, setNewTagline] = useState('SMART DERIV TOOLS');
  const [newSlug, setNewSlug] = useState('');
  const [slugEditedManually, setSlugEditedManually] = useState(false);
  const [slugCheck, setSlugCheck] = useState<{
    checking: boolean;
    available: boolean;
    vercelDomain: string;
    message: string;
  }>({
    checking: false,
    available: true,
    vercelDomain: '',
    message: '',
  });
  const [newLogoUrl, setNewLogoUrl] = useState('/traderpulse-logo.jpg');
  const [newColor, setNewColor] = useState('#0066FF');
  const [newEnabledTabs, setNewEnabledTabs] = useState<string[]>(() => ALL_13_TABS.map(t => t.id));
  const [newIncludeDefaultBots, setNewIncludeDefaultBots] = useState(true);
  const [newCustomBots, setNewCustomBots] = useState<ManagedBotItem[]>([]);
  const [newPayoutMethod, setNewPayoutMethod] = useState<string>('M-Pesa');
  const [newPayoutWallet, setNewPayoutWallet] = useState<string>('');
  const [newReferral, setNewReferral] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newSocialLinks, setNewSocialLinks] = useState<Partial<Record<SocialPlatformKey, string>>>({});
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(prev => (prev === msg ? '' : prev));
    }, 4200);
  }, []);

  const hydrateWorkspace = useCallback(async (sessionUser: StudioUser) => {
    const [loadedSites, loadedPlatform, ledger] = await Promise.all([
      loadManagedSites(sessionUser),
      fetchPlatformSettings(),
      loadCommissionLedger(sessionUser).catch(() => ({ commissions: [], payouts: [] })),
    ]);
    setPlatformSettings(loadedPlatform);
    setSites(loadedSites);
    setCommissions(ledger.commissions);
    setPayouts(ledger.payouts);
    if (loadedSites.length > 0) {
      setSelectedSiteId(prev =>
        prev && loadedSites.some(s => s.id === prev) ? prev : loadedSites[0].id
      );
    } else {
      setSelectedSiteId('');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    if (typeof window !== 'undefined' && window.location.hash.includes('error_description=')) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const desc = hashParams.get('error_description');
      if (desc) {
        setAuthError(desc.replace(/\+/g, ' '));
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    (async () => {
      try {
        if (!isSupabaseConfigured) return;
        const sessionUser = await getInitialStudioSession();
        if (mounted && sessionUser) {
          setUser(sessionUser);
          await hydrateWorkspace(sessionUser);
        }
      } catch (err) {
        console.error('[SiteStudio] Session init failed:', err);
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    const sub = studioSupabase?.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session?.user) {
        setUser(null);
        setSites([]);
        setCommissions([]);
        setPayouts([]);
        setSelectedSiteId('');
        return;
      }
      try {
        const refreshed = await getInitialStudioSession();
        if (mounted && refreshed) {
          setUser(refreshed);
          await hydrateWorkspace(refreshed);
        }
      } catch (err) {
        console.error('[SiteStudio] Auth state refresh failed:', err);
      }
    });

    return () => {
      mounted = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [hydrateWorkspace]);

  // Live debounced .vercel.app slug availability check in Create Site Wizard
  useEffect(() => {
    if (!isCreateOpen) return;
    const clean = newSlug
      .trim()
      .toLowerCase()
      .replace(/\.vercel\.app$/i, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!clean || clean.length < 2) {
      setSlugCheck({
        checking: false,
        available: false,
        vercelDomain: clean ? `${clean}.vercel.app` : 'your-brand.vercel.app',
        message: 'Enter at least 2 characters',
      });
      return;
    }

    setSlugCheck(prev => ({
      ...prev,
      checking: true,
      vercelDomain: `${clean}.vercel.app`,
    }));

    const timer = setTimeout(async () => {
      const res = await checkVercelSubdomainAvailability(clean);
      setSlugCheck({
        checking: false,
        available: res.available,
        vercelDomain: res.vercel_domain,
        message: res.available
          ? `https://${res.vercel_domain}/`
          : res.error || `${res.vercel_domain} unavailable`,
      });
    }, 320);

    return () => clearTimeout(timer);
  }, [newSlug, isCreateOpen]);

  const selectedSite = useMemo(
    () => sites.find(s => s.id === selectedSiteId) || sites[0] || null,
    [sites, selectedSiteId]
  );

  // Per-site commission stats map (computed strictly from real Supabase commission records)
  const siteStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        tradesCount: number;
        totalStake: number;
        grossMarkup: number;
        unpaidOperator: number;
        paidOperator: number;
        adminNet: number;
      }
    >();

    for (const c of commissions) {
      const curr = map.get(c.site_id) || {
        tradesCount: 0,
        totalStake: 0,
        grossMarkup: 0,
        unpaidOperator: 0,
        paidOperator: 0,
        adminNet: 0,
      };
      curr.tradesCount += 1;
      curr.totalStake += c.stake_amount;
      curr.grossMarkup += c.gross_markup_usd;
      curr.adminNet += c.admin_net_usd;
      if (c.payout_status === 'paid') {
        curr.paidOperator += c.operator_commission_usd;
      } else {
        curr.unpaidOperator += c.operator_commission_usd;
      }
      map.set(c.site_id, curr);
    }

    return map;
  }, [commissions]);

  const globalCommissionTotals = useMemo(() => {
    let totalStake = 0;
    let grossMarkup = 0;
    let unpaidOperator = 0;
    let adminNet = 0;

    for (const c of commissions) {
      totalStake += c.stake_amount;
      grossMarkup += c.gross_markup_usd;
      adminNet += c.admin_net_usd;
      if (c.payout_status !== 'paid') {
        unpaidOperator += c.operator_commission_usd;
      }
    }
    return { totalStake, grossMarkup, unpaidOperator, adminNet };
  }, [commissions]);

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
      section === 'bots' ||
      section === 'domain' ||
      section === 'commissions'
    ) {
      setActiveTab(section);
    }
  };

  const openCreateWizard = () => {
    if (user && user.role !== 'super_admin' && sites.length >= 1) {
      showToast('Your operator account already has an active trading site.');
      return;
    }
    setWizardStep(1);
    setNewBrandName('');
    setNewTagline('SMART DERIV TOOLS');
    setNewSlug('');
    setSlugEditedManually(false);
    setNewLogoUrl('/traderpulse-logo.jpg');
    setNewColor('#0066FF');
    setNewEnabledTabs(ALL_13_TABS.map(t => t.id));
    setNewIncludeDefaultBots(true);
    setNewCustomBots([]);
    setNewPayoutMethod('M-Pesa');
    setNewPayoutWallet('');
    setNewReferral('');
    setNewDomain('');
    setNewSocialLinks({});
    setCreateError('');
    setIsCreateOpen(true);
  };

  const handlePublishChanges = async () => {
    if (!selectedSite) return;
    setSaving(true);
    try {
      const saved = await persistManagedSite(selectedSite);
      setSites(prev => prev.map(s => (s.id === selectedSite.id ? saved : s)));
      setSelectedSiteId(saved.id);
      pushLivePreviewToIframe(saved);
      showToast(`Published "${saved.brand_name}" live to ${buildLiveTenantUrl(saved)}`);
    } catch (err: any) {
      showToast(`Save error: ${err?.message || 'Unable to publish changes'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrentSite = async () => {
    if (!selectedSite) return;
    const confirmed = window.confirm(
      `Delete "${selectedSite.brand_name}" (${buildLiveTenantUrl(selectedSite)}) permanently?`
    );
    if (!confirmed) return;

    try {
      await deleteManagedSite(selectedSite.id);
      const remaining = sites.filter(s => s.id !== selectedSite.id);
      setSites(remaining);
      setSelectedSiteId(remaining[0]?.id || '');
      showToast(`Deleted "${selectedSite.brand_name}".`);
    } catch (err: any) {
      showToast(`Delete failed: ${err?.message || 'Unable to delete site'}`);
    }
  };

  const handleCreateSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreateError('');

    const cleanName = newBrandName.trim();
    const cleanSlug = (newSlug.trim() || cleanName)
      .toLowerCase()
      .replace(/\.vercel\.app$/i, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!cleanName || cleanSlug.length < 2) {
      setCreateError('Enter a valid brand name and .vercel.app URL slug (at least 2 characters).');
      setWizardStep(1);
      return;
    }

    if (cleanSlug.includes('deriv') || cleanSlug.includes('binary')) {
      setCreateError('URL names containing "deriv" or "binary" are prohibited.');
      setWizardStep(1);
      return;
    }

    const lowerDom = newDomain.trim().toLowerCase();
    if (lowerDom && (lowerDom.includes('deriv') || lowerDom.includes('binary'))) {
      setCreateError('Custom domains containing "deriv" or "binary" are prohibited.');
      return;
    }

    if (sites.some(s => s.slug.toLowerCase() === cleanSlug)) {
      setCreateError(`"${cleanSlug}.vercel.app" is already in your workspace. Pick another URL slug.`);
      setWizardStep(1);
      return;
    }

    setCreateBusy(true);
    try {
      // 1. Auto-provision <slug>.vercel.app via Vercel Domains API
      const vercelProv = await provisionVercelSubdomain(cleanSlug);
      if (vercelProv.error && vercelProv.error.toLowerCase().includes('already taken')) {
        setCreateError(vercelProv.error);
        setWizardStep(1);
        return;
      }

      // 2. Persist full configured site + XML bots + payout wallet to Supabase
      const draft = createConfiguredManagedSite(
        user,
        {
          brand_name: cleanName,
          tagline: newTagline,
          slug: cleanSlug,
          logo_url: newLogoUrl,
          custom_domain: lowerDom,
          primary_color: newColor,
          deriv_referral_link: newReferral,
          enabled_tabs: newEnabledTabs,
          include_default_bots: newIncludeDefaultBots,
          custom_bots: newCustomBots,
          social_links: newSocialLinks,
          payout_method: newPayoutMethod,
          payout_wallet: newPayoutWallet,
          vercel_domain_status: vercelProv.ok ? 'live' : 'pending',
        },
        platformSettings
      );
      const created = await persistManagedSite(draft);
      setSites(prev => [created, ...prev]);
      setSelectedSiteId(created.id);
      setIsCreateOpen(false);
      setActiveSidebar('branding');
      setActiveTab('branding');
      showToast(
        vercelProv.ok
          ? `Launched https://${created.vercel_domain}/ live with SSL!`
          : `Created ${created.brand_name} (${created.vercel_domain})!`
      );
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to launch site.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleActivateVercelSubdomain = async () => {
    if (!selectedSite) return;
    setDomainBusy(true);
    setDomainFeedback('');
    try {
      const res = await provisionVercelSubdomain(selectedSite.slug);
      if (res.ok) {
        const saved = await persistManagedSite({
          ...selectedSite,
          vercel_domain: res.vercel_domain,
          vercel_domain_status: 'live',
        });
        setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
        setDomainFeedback(`https://${res.vercel_domain}/ is LIVE on Vercel with automatic HTTPS SSL!`);
        showToast(`https://${res.vercel_domain}/ is LIVE!`);
      } else {
        setDomainFeedback(res.error || 'Unable to provision .vercel.app subdomain.');
      }
    } finally {
      setDomainBusy(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>, forWizard = false) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    try {
      const url = await uploadLogoAsset(file, user.id);
      if (forWizard) {
        setNewLogoUrl(url);
        showToast('Uploaded brand logo for your new site.');
      } else if (selectedSite) {
        updateSelectedSite(s => ({ ...s, logo_url: url }));
        showToast('Uploaded logo — click "Publish Changes Live" to save.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Logo upload failed');
    }
  };

  const parseUploadedXmlFiles = async (files: File[]): Promise<ManagedBotItem[]> => {
    const parsed: ManagedBotItem[] = [];
    for (const file of files) {
      const xmlText = await file.text();
      if (!xmlText.includes('<xml') && !xmlText.includes('<block')) {
        showToast(`Skipped "${file.name}" — not a valid Blockly XML bot.`);
        continue;
      }
      const baseName = file.name.replace(/\.xml$/i, '');
      parsed.push({
        id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: baseName,
        strategy: 'Operator Custom Strategy',
        description: `Uploaded XML trading bot (${Math.round(file.size / 1024) || 1} KB).`,
        categories: ['special'],
        xml_content: xmlText,
        sort_order: parsed.length + 1,
        is_active: true,
      });
    }
    return parsed;
  };

  const handleBotXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>, forWizard = false) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const addedBots = await parseUploadedXmlFiles(files);
    if (addedBots.length === 0) return;

    if (forWizard) {
      setNewCustomBots(prev => [...addedBots, ...prev]);
    } else if (selectedSite) {
      updateSelectedSite(s => ({
        ...s,
        custom_bots: [...addedBots, ...s.custom_bots],
      }));
      showToast(`Added ${addedBots.length} XML bot(s) — click "Publish Changes Live" to save.`);
    }
  };

  const handleDomainAction = async (action: 'attach' | 'verify') => {
    if (!selectedSite) return;
    const domain = selectedSite.custom_domain.trim().toLowerCase();
    if (!domain) {
      setDomainFeedback('Enter a custom domain first (e.g. mybrand.site).');
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
      if (!contentType.includes('application/json')) {
        setDomainFeedback(
          'The /api/domains Vercel serverless endpoint runs on your deployed Vercel Studio project.'
        );
        return;
      }

      const data = await resp.json();
      if (Array.isArray(data.dns_records)) {
        setDnsRecords(data.dns_records);
      }
      if (!resp.ok || !data.ok) {
        setDomainFeedback(data.error || 'Domain provisioning failed.');
        return;
      }

      const nextStatus = data.domain_status || (action === 'verify' ? 'live' : 'verify_dns');
      const updated = { ...selectedSite, custom_domain: domain, domain_status: nextStatus };
      const saved = await persistManagedSite(updated);
      setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
      setDomainFeedback(
        action === 'verify' && data.verified
          ? `${domain} verified & Let’s Encrypt SSL is LIVE!`
          : `Attached ${domain} — configure the DNS records below at your registrar, then click Verify DNS.`
      );
      showToast(
        action === 'verify' && data.verified
          ? `${domain} SSL is LIVE!`
          : `Attached ${domain} to Vercel edge.`
      );
    } catch (err: any) {
      setDomainFeedback(err?.message || 'Unable to reach /api/domains.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleAdminStatusChange = async (
    targetSite: ManagedSite,
    nextStatus: ManagedSite['status']
  ) => {
    try {
      const updated = { ...targetSite, status: nextStatus };
      const saved = await persistManagedSite(updated);
      setSites(prev => prev.map(s => (s.id === saved.id ? saved : s)));
      if (selectedSite?.id === saved.id) {
        pushLivePreviewToIframe(saved);
      }
      showToast(`${saved.brand_name} status set to ${nextStatus.toUpperCase()}`);
    } catch (err: any) {
      showToast(`Status update failed: ${err?.message || 'Error'}`);
    }
  };

  const handleMarkOperatorPaid = async (site: ManagedSite) => {
    const stats = siteStatsMap.get(site.id);
    if (!stats || stats.unpaidOperator <= 0) return;

    const note = window.prompt(
      `Confirm payout of ${formatUsd(stats.unpaidOperator)} to ${site.owner_email || site.brand_name} (${
        site.payout_method ? `${site.payout_method}: ${site.payout_wallet}` : 'No wallet set'
      }).\n\nOptional payment reference (M-Pesa code / TXID):`,
      ''
    );
    if (note === null) return;

    setMarkingPaidSiteId(site.id);
    try {
      const receipt = await markSiteCommissionsPaid({
        site,
        unpaidAmountUsd: stats.unpaidOperator,
        tradesCount: commissions.filter(c => c.site_id === site.id && c.payout_status === 'unpaid')
          .length,
        referenceNote: note,
      });
      setPayouts(prev => [receipt, ...prev]);
      setCommissions(prev =>
        prev.map(c =>
          c.site_id === site.id && c.payout_status === 'unpaid'
            ? { ...c, payout_status: 'paid', payout_id: receipt.id }
            : c
        )
      );
      showToast(`Marked ${formatUsd(receipt.amount_usd)} paid to ${site.brand_name}!`);
    } catch (err: any) {
      showToast(`Payout update failed: ${err?.message || 'Error'}`);
    } finally {
      setMarkingPaidSiteId('');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
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
      const message = err?.message || 'Authentication failed.';
      if (message.toLowerCase().includes('confirm')) {
        setAuthInfo(message);
        setAuthMode('signin');
      } else {
        setAuthError(message);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  if (booting) {
    return (
      <div className="studio-boot">
        <img src="/traderpulse-logo.jpg" alt="TradersPulse" className="studio-boot__logo" />
        <span>Connecting to Site Studio Control Plane…</span>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="studio-auth">
        <div className="studio-auth__card">
          <div className="studio-auth__brand">
            <img src="/traderpulse-logo.jpg" alt="TradersPulse" className="studio-auth__logo" />
            <div>
              <div className="studio-auth__wordmark">TRADERSPULSE</div>
              <span className="studio-auth__pill">SITE STUDIO · CLOUD SETUP</span>
            </div>
          </div>

          <h1 className="studio-auth__title">Connect Supabase &amp; Vercel Environment</h1>
          <p className="studio-auth__sub">
            Add these environment variables in your Vercel Studio project (
            <strong>Settings → Environment Variables</strong>) and trigger a <strong>Redeploy</strong>:
          </p>

          <div className="studio-callout">
            <code>SUPABASE_URL</code>
            <code>SUPABASE_PUBLISHABLE_KEY</code>
            <code>VERCEL_API_TOKEN</code>
            <code>VERCEL_TENANT_PROJECT_ID</code>
          </div>
        </div>
      </div>
    );
  }

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
            Launch your own branded <code>.vercel.app</code> Deriv trading platform and earn
            commission on every real trade.
          </p>

          <button
            type="button"
            className="studio-btn studio-btn--google"
            onClick={async () => {
              setAuthError('');
              try {
                await signInWithGoogleOAuth();
              } catch (err: any) {
                setAuthError(err?.message || 'Google sign-in failed.');
              }
            }}
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
                  placeholder="e.g. Apex Quant Desk"
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
                placeholder="you@yourdomain.com"
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

            {authInfo && <div className="studio-toast">{authInfo}</div>}
            {authError && (
              <div className="studio-alert studio-alert--error">
                <div>{authError}</div>
                {authEmail.trim() &&
                  (authError.toLowerCase().includes('confirm') ||
                    authError.toLowerCase().includes('expired')) && (
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--xs"
                      style={{ marginTop: 8 }}
                      onClick={async () => {
                        try {
                          await resendConfirmationEmail(authEmail);
                          setAuthError('');
                          setAuthInfo(
                            `Sent a fresh confirmation link to ${authEmail.trim()} (redirecting back to ${window.location.origin}).`
                          );
                        } catch (e: any) {
                          setAuthError(e?.message || 'Could not resend confirmation email.');
                        }
                      }}
                    >
                      Resend Confirmation Link
                    </button>
                  )}
              </div>
            )}

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

  const canCreateMoreSites = user.role === 'super_admin' || sites.length === 0;
  const previewIframeUrl = selectedSite ? buildPreviewTenantUrl(selectedSite) : '';
  const openExternalTenantUrl = selectedSite ? buildLiveTenantUrl(selectedSite) : '#';
  const selectedSiteStats = selectedSite
    ? siteStatsMap.get(selectedSite.id) || {
        tradesCount: 0,
        totalStake: 0,
        grossMarkup: 0,
        unpaidOperator: 0,
        paidOperator: 0,
        adminNet: 0,
      }
    : null;

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
            <span>
              {user.role === 'super_admin' ? `All Sites (${sites.length})` : 'My Trading Site'}
            </span>
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
            className={`studio-nav-item ${activeSidebar === 'commissions' ? 'is-active' : ''}`}
            onClick={() => handleSidebarNav('commissions')}
          >
            <span className="studio-nav-item__dot" />
            <span>Commissions &amp; Payouts</span>
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
              <span>Super-Admin Payouts</span>
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
        <header className="studio-topbar">
          <div>
            <h1 className="studio-topbar__heading">Multi-Site Control Plane</h1>
            <p className="studio-topbar__sub">
              Supabase ({connectedSupabaseHost}) · Automatic <code>.vercel.app</code> Provisioning +
              Commission Engine
            </p>
          </div>

          <div className="studio-topbar__actions">
            <button
              type="button"
              className="studio-btn studio-btn--ghost studio-btn--sm"
              onClick={() => user && void hydrateWorkspace(user)}
            >
              Refresh Ledger
            </button>
            {canCreateMoreSites && (
              <button
                type="button"
                className="studio-btn studio-btn--primary"
                onClick={openCreateWizard}
              >
                {user.role === 'super_admin' ? '+ Create New Site' : '+ Create My Trading Site'}
              </button>
            )}
          </div>
        </header>

        {toast && <div className="studio-toast">{toast}</div>}

        {/* MANAGED SITES STRIP */}
        <section className="studio-sites-strip" aria-label="Managed Sites">
          <div className="studio-section-head">
            <h2>
              {user.role === 'super_admin'
                ? `All Platform Sites (${sites.length})`
                : 'Your Trading Site'}
            </h2>
            {sites.length > 0 && (
              <span>
                {user.role === 'super_admin'
                  ? 'Super-Admin view: Flagship + all tenant sites'
                  : 'Your dedicated .vercel.app trading platform'}
              </span>
            )}
          </div>

          {sites.length === 0 ? (
            <div className="studio-empty-state">
              <h3>No trading site created yet</h3>
              <p>
                Click <strong>+ Create My Trading Site</strong> to choose your{' '}
                <code>.vercel.app</code> URL, logo, colors, 13 feature tabs, XML bots, and
                commission payout wallet.
              </p>
              <button
                type="button"
                className="studio-btn studio-btn--primary"
                onClick={openCreateWizard}
              >
                + Create My Trading Site
              </button>
            </div>
          ) : (
            <div className="studio-sites-grid">
              {sites.map(site => {
                const isSelected = selectedSite?.id === site.id;
                const isFlagship = site.slug === FLAGSHIP_SUPERADMIN_SLUG;
                const stats = siteStatsMap.get(site.id);
                const publicHost =
                  site.custom_domain && site.domain_status === 'live'
                    ? site.custom_domain
                    : site.vercel_domain || `${site.slug}.vercel.app`;
                const isUrlLive =
                  isFlagship ||
                  (site.custom_domain && site.domain_status === 'live') ||
                  site.vercel_domain_status === 'live';
                const badgeLabel =
                  site.status === 'suspended'
                    ? 'SUSPENDED'
                    : site.status === 'maintenance'
                    ? 'MAINTENANCE'
                    : isFlagship
                    ? 'SUPER-ADMIN MAIN'
                    : isUrlLive
                    ? 'LIVE SSL'
                    : 'PENDING URL';
                const badgeClass =
                  site.status === 'suspended'
                    ? 'is-danger'
                    : site.status === 'maintenance' || !isUrlLive
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
                          <strong>{publicHost}</strong>
                          <span>
                            {site.brand_name}
                            {user.role === 'super_admin' && site.owner_email
                              ? ` · ${site.owner_email}`
                              : ''}
                          </span>
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
                        {site.enabled_tabs.length}/{ALL_13_TABS.length} Tabs
                      </span>
                      <span>
                        {site.custom_bots.length + (site.include_default_bots ? 18 : 0)} Bots
                      </span>
                      <span>
                        {isFlagship
                          ? `${formatUsd(stats?.adminNet || 0)} Net`
                          : `${formatUsd(stats?.unpaidOperator || 0)} Unpaid`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* =================================================================
            SUPER-ADMIN COMMISSIONS & OPERATOR PAYOUTS DASHBOARD
            ================================================================= */}
        {activeSidebar === 'superadmin' && user.role === 'super_admin' ? (
          <section className="studio-panel">
            <div className="studio-panel__header">
              <div>
                <h2>Super-Admin Commissions &amp; Operator Payouts</h2>
                <p>
                  Every created site trades through your Main Deriv App ID via the Central OAuth
                  Callback Relay and logs real-account commissions automatically.
                </p>
              </div>
            </div>

            <div className="studio-engine-bar">
              <span className="studio-engine-bar__pill">
                <i /> Main Deriv App ID Pooled Engine Active
              </span>

              <div className="studio-engine-bar__rates">
                <label className="studio-rate-chip">
                  <span>Your Deriv App Markup (%):</span>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    max={10}
                    value={platformSettings.platform_markup_pct}
                    onChange={e =>
                      setPlatformSettings(p => ({
                        ...p,
                        platform_markup_pct: Number(e.target.value || 0),
                      }))
                    }
                  />
                </label>

                <label className="studio-rate-chip">
                  <span>Operator Commission Share (%):</span>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    max={95}
                    value={platformSettings.default_commission_pct}
                    onChange={e =>
                      setPlatformSettings(p => ({
                        ...p,
                        default_commission_pct: Number(e.target.value || 0),
                      }))
                    }
                  />
                </label>

                <button
                  type="button"
                  className="studio-btn studio-btn--primary studio-btn--sm"
                  onClick={async () => {
                    try {
                      await savePlatformSettings(platformSettings);
                      showToast('Saved global Deriv markup & operator commission share rates!');
                    } catch (err: any) {
                      showToast(`Save failed: ${err?.message || 'Error'}`);
                    }
                  }}
                >
                  Save Rates
                </button>
              </div>
            </div>

            <div className="studio-kpi-row">
              <div className="studio-kpi">
                <span>Total Real Trade Stake Volume</span>
                <strong>{formatUsd(globalCommissionTotals.totalStake)}</strong>
              </div>
              <div className="studio-kpi">
                <span>Your Gross Deriv Markup ({platformSettings.platform_markup_pct}%)</span>
                <strong>{formatUsd(globalCommissionTotals.grossMarkup)}</strong>
              </div>
              <div className="studio-kpi">
                <span>Commission Owed to Operators</span>
                <strong>{formatUsd(globalCommissionTotals.unpaidOperator)}</strong>
              </div>
              <div className="studio-kpi">
                <span>Your Net Platform Profit</span>
                <strong>{formatUsd(globalCommissionTotals.adminNet)}</strong>
              </div>
            </div>

            <div className="studio-subhead">Operator Commission Payout Ledger</div>
            {sites.length === 0 ? (
              <div className="studio-empty-bots">No operator sites registered yet.</div>
            ) : (
              <div className="studio-admin-table-wrap">
                <table className="studio-admin-table">
                  <thead>
                    <tr>
                      <th>Site URL</th>
                      <th>Operator Email</th>
                      <th>Payout Wallet</th>
                      <th>Real Trades</th>
                      <th>Unpaid Commission To Pay</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map(s => {
                      const st = siteStatsMap.get(s.id) || {
                        tradesCount: 0,
                        totalStake: 0,
                        grossMarkup: 0,
                        unpaidOperator: 0,
                        paidOperator: 0,
                        adminNet: 0,
                      };
                      const isFlagshipOrAdminSite =
                        s.slug === FLAGSHIP_SUPERADMIN_SLUG || s.owner_id === user.id;
                      const siteUrl = buildLiveTenantUrl(s);
                      const hasUnpaid = !isFlagshipOrAdminSite && st.unpaidOperator > 0;
                      const walletDisplay = isFlagshipOrAdminSite
                        ? 'Super-Admin Direct (100% Net)'
                        : s.payout_wallet
                        ? `${s.payout_method ? `${s.payout_method}: ` : ''}${s.payout_wallet}`
                        : 'Not set yet';

                      return (
                        <tr key={s.id}>
                          <td>
                            <a
                              href={siteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#60a5fa', fontWeight: 700, textDecoration: 'none' }}
                            >
                              {siteUrl}
                            </a>
                            <div className="studio-muted">{s.brand_name}</div>
                          </td>
                          <td>{s.owner_email || s.owner_id}</td>
                          <td>{walletDisplay}</td>
                          <td>{st.tradesCount}</td>
                          <td>
                            {isFlagshipOrAdminSite ? (
                              <span className="studio-muted">
                                Net: {formatUsd(st.adminNet)}
                              </span>
                            ) : (
                              <>
                                <strong>{formatUsd(st.unpaidOperator)}</strong>
                                {st.paidOperator > 0 && (
                                  <div className="studio-muted">
                                    Paid: {formatUsd(st.paidOperator)}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            <span
                              className={`studio-status-pill ${hasUnpaid ? 'is-warn' : 'is-live'}`}
                            >
                              {isFlagshipOrAdminSite
                                ? 'MAIN SITE'
                                : hasUnpaid
                                ? 'UNPAID'
                                : 'PAID'}
                            </span>
                          </td>
                          <td>
                            <div className="studio-table-btns">
                              {hasUnpaid && (
                                <button
                                  type="button"
                                  className="studio-btn studio-btn--primary studio-btn--xs"
                                  disabled={markingPaidSiteId === s.id}
                                  onClick={() => void handleMarkOperatorPaid(s)}
                                >
                                  {markingPaidSiteId === s.id ? 'Saving…' : 'Mark Paid'}
                                </button>
                              )}
                              {s.slug !== FLAGSHIP_SUPERADMIN_SLUG && (
                                <button
                                  type="button"
                                  className="studio-btn studio-btn--ghost studio-btn--xs"
                                  onClick={() =>
                                    void handleAdminStatusChange(
                                      s,
                                      s.status === 'suspended' ? 'active' : 'suspended'
                                    )
                                  }
                                >
                                  {s.status === 'suspended' ? 'Activate' : 'Suspend'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="studio-subhead" style={{ marginTop: 18 }}>
              Advanced OAuth Relay &amp; Pooled App ID Overrides (Optional)
            </div>
            <div className="studio-form-grid">
              <label className="studio-field">
                <span>Main Deriv OAuth App ID Override (Blank = NEXT_PUBLIC_DERIV_APP_ID)</span>
                <input
                  type="text"
                  value={platformSettings.pooled_deriv_app_id}
                  onChange={e =>
                    setPlatformSettings(p => ({ ...p, pooled_deriv_app_id: e.target.value }))
                  }
                  placeholder="Inherited from your main deployment automatically"
                />
              </label>
              <label className="studio-field">
                <span>OAuth Callback Hub URL Override (Blank = NEXT_PUBLIC_DERIV_REDIRECT_URI)</span>
                <input
                  type="url"
                  value={platformSettings.oauth_callback_hub_url}
                  onChange={e =>
                    setPlatformSettings(p => ({ ...p, oauth_callback_hub_url: e.target.value }))
                  }
                  placeholder="https://your-callback-origin.com/callback"
                />
              </label>
            </div>
          </section>
        ) : selectedSite ? (
          <section className="studio-panel">
            <div className="studio-panel__header">
              <div>
                <h2>Configure: {selectedSite.brand_name}</h2>
                <p>
                  Live URL: <code>{openExternalTenantUrl}</code>
                </p>
              </div>
              <div className="studio-panel__header-btns">
                {selectedSite.slug !== FLAGSHIP_SUPERADMIN_SLUG && (
                  <button
                    type="button"
                    className="studio-btn studio-btn--danger studio-btn--sm"
                    onClick={handleDeleteCurrentSite}
                  >
                    Delete Site
                  </button>
                )}
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
                  ['bots', `XML Bots (${selectedSite.custom_bots.length})`],
                  ['domain', '.vercel.app & Domain'],
                  ['commissions', 'Commissions & Payouts'],
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
                      placeholder="e.g. Apex Quant Trading"
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
                      Upload PNG/JPG/WebP to Supabase Storage (<code>studio-assets</code>) or reset
                      to default logo.
                    </span>
                    <div className="studio-logo-box__row">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={e => void handleLogoFileChange(e, false)}
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
                        Reset Default Logo
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

                <label className="studio-field">
                  <span>Deriv Affiliate Signup Link (Used on "Create Deriv Account" CTA)</span>
                  <input
                    type="url"
                    value={selectedSite.deriv_referral_link}
                    onChange={e =>
                      updateSelectedSite(s => ({ ...s, deriv_referral_link: e.target.value }))
                    }
                    placeholder="https://track.deriv.com/_..."
                  />
                </label>

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
                    Enable All {ALL_13_TABS.length} Tabs
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

            {/* TAB 3: XML BOTS UPLOADER */}
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
                      onChange={e => void handleBotXmlUpload(e, false)}
                    />
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
                    Also include the 18 built-in Special, Virtual-Hook &amp; Turbo AI bots below my
                    custom bots
                  </span>
                </label>

                {selectedSite.custom_bots.length === 0 ? (
                  <div className="studio-empty-bots">
                    No custom XML bots uploaded yet. Click <strong>Upload .XML Bot File</strong>{' '}
                    above to add strategies from your device.
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

            {/* TAB 4: DEDICATED .VERCEL.APP URL & CUSTOM DOMAIN */}
            {activeTab === 'domain' && (
              <div className="studio-tab-body">
                <div className="studio-engine-bar">
                  <div>
                    <strong>Dedicated .vercel.app Platform URL</strong>
                    <div className="studio-muted">
                      <code>https://{selectedSite.vercel_domain || `${selectedSite.slug}.vercel.app`}</code>
                    </div>
                  </div>
                  <div className="studio-engine-bar__rates">
                    <span
                      className={`studio-status-pill ${
                        selectedSite.vercel_domain_status === 'live' ? 'is-live' : 'is-warn'
                      }`}
                    >
                      {selectedSite.vercel_domain_status === 'live' ? 'LIVE SSL' : 'PENDING SYNC'}
                    </span>
                    <button
                      type="button"
                      className="studio-btn studio-btn--primary studio-btn--sm"
                      disabled={domainBusy}
                      onClick={() => void handleActivateVercelSubdomain()}
                    >
                      {domainBusy ? 'Syncing…' : 'Activate / Sync .vercel.app URL'}
                    </button>
                  </div>
                </div>

                <div className="studio-subhead">Optional Custom Domain (Apex or Subdomain)</div>
                <div className="studio-form-grid">
                  <label className="studio-field">
                    <span>Custom Domain</span>
                    <input
                      type="text"
                      value={selectedSite.custom_domain}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, custom_domain: e.target.value }))
                      }
                      placeholder="e.g. mybrand.site or trade.myagency.com"
                    />
                  </label>

                  <label className="studio-field">
                    <span>Active Public URL</span>
                    <input type="text" readOnly value={openExternalTenantUrl} />
                  </label>
                </div>

                <div className="studio-inline-actions">
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost"
                    disabled={domainBusy}
                    onClick={() => void handleDomainAction('attach')}
                  >
                    1. Attach Custom Domain to Vercel
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
                    <strong>Registrar DNS Records (Only if using a Custom Domain)</strong>
                    <span
                      className={`studio-status-pill ${
                        selectedSite.domain_status === 'live' ? 'is-live' : 'is-warn'
                      }`}
                    >
                      {selectedSite.domain_status === 'live' ? 'SSL ACTIVE' : 'OPTIONAL'}
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

            {/* TAB 5: OPERATOR COMMISSIONS & PAYOUT WALLET */}
            {activeTab === 'commissions' && selectedSiteStats && (
              <div className="studio-tab-body">
                <div className="studio-engine-bar">
                  <span className="studio-engine-bar__pill">
                    <i /> Main Deriv App ID Pooled Engine Active — {selectedSite.commission_share_pct}%
                    Commission Share
                  </span>
                  <span className="studio-muted">
                    Real-money trades on <code>{openExternalTenantUrl}</code> accrue automatically
                  </span>
                </div>

                <div className="studio-kpi-row">
                  <div className="studio-kpi">
                    <span>Real Stake Volume</span>
                    <strong>{formatUsd(selectedSiteStats.totalStake)}</strong>
                  </div>
                  <div className="studio-kpi">
                    <span>Real Trades Executed</span>
                    <strong>{selectedSiteStats.tradesCount}</strong>
                  </div>
                  <div className="studio-kpi">
                    <span>Unpaid Commission Earned</span>
                    <strong>{formatUsd(selectedSiteStats.unpaidOperator)}</strong>
                  </div>
                  <div className="studio-kpi">
                    <span>Total Paid Out</span>
                    <strong>{formatUsd(selectedSiteStats.paidOperator)}</strong>
                  </div>
                </div>

                <div className="studio-subhead">Your Commission Payout Wallet</div>
                <div className="studio-form-grid">
                  <label className="studio-field">
                    <span>Payout Method</span>
                    <select
                      value={selectedSite.payout_method}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, payout_method: e.target.value }))
                      }
                    >
                      <option value="">Select payout method…</option>
                      {PAYOUT_METHODS.filter(Boolean).map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="studio-field">
                    <span>Wallet / Phone / Account Number</span>
                    <input
                      type="text"
                      value={selectedSite.payout_wallet}
                      onChange={e =>
                        updateSelectedSite(s => ({ ...s, payout_wallet: e.target.value }))
                      }
                      placeholder="e.g. +2547... or TRC20 Address or CR123456"
                    />
                  </label>
                </div>

                <div className="studio-subhead">Recent Real-Trade Commissions on This Site</div>
                {commissions.filter(c => c.site_id === selectedSite.id).length === 0 ? (
                  <div className="studio-empty-bots">
                    No real-account trades recorded on <code>{openExternalTenantUrl}</code> yet.
                    Commissions appear here automatically as traders place real trades.
                  </div>
                ) : (
                  <div className="studio-admin-table-wrap">
                    <table className="studio-admin-table">
                      <thead>
                        <tr>
                          <th>Contract ID</th>
                          <th>Account</th>
                          <th>Stake</th>
                          <th>Your Commission</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissions
                          .filter(c => c.site_id === selectedSite.id)
                          .slice(0, 25)
                          .map(c => (
                            <tr key={c.id}>
                              <td>
                                <code>{c.contract_id}</code>
                              </td>
                              <td>{c.trader_loginid}</td>
                              <td>{formatUsd(c.stake_amount)}</td>
                              <td>
                                <strong>{formatUsd(c.operator_commission_usd)}</strong>
                              </td>
                              <td>
                                <span
                                  className={`studio-status-pill ${
                                    c.payout_status === 'paid' ? 'is-live' : 'is-warn'
                                  }`}
                                >
                                  {c.payout_status.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
            <span>{selectedSite ? openExternalTenantUrl : 'No site selected'}</span>
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
            <div className="studio-preview__empty">Create a site to launch live preview</div>
          )}
        </div>

        {selectedSite && (
          <div className="studio-preview__bottom">
            <a
              href={openExternalTenantUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="studio-btn studio-btn--ghost studio-btn--full"
            >
              Open {openExternalTenantUrl} ↗
            </a>
            <button
              type="button"
              className="studio-btn studio-btn--emerald studio-btn--full"
              onClick={handlePublishChanges}
              disabled={saving}
            >
              {saving ? 'Publishing…' : 'Publish Changes Live'}
            </button>
          </div>
        )}
      </aside>

      {/* =====================================================================
          3-STEP CREATE WHITE-LABEL TRADING SITE WIZARD MODAL
          ===================================================================== */}
      {isCreateOpen && (
        <div className="studio-modal-backdrop" onClick={() => !createBusy && setIsCreateOpen(false)}>
          <div className="studio-modal" onClick={e => e.stopPropagation()}>
            <div className="studio-modal__head">
              <h2>TradersPulse Site Studio — Create White-Label Trading Site Wizard</h2>
              <button
                type="button"
                className="studio-modal__close"
                onClick={() => !createBusy && setIsCreateOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="studio-wizard-steps">
              <button
                type="button"
                className={`studio-wizard-step ${wizardStep === 1 ? 'is-active' : ''}`}
                onClick={() => setWizardStep(1)}
              >
                1. Brand &amp; .vercel.app URL
              </button>
              <button
                type="button"
                className={`studio-wizard-step ${wizardStep === 2 ? 'is-active' : ''}`}
                onClick={() => setWizardStep(2)}
              >
                2. Choose Feature Tabs ({newEnabledTabs.length}/13)
              </button>
              <button
                type="button"
                className={`studio-wizard-step ${wizardStep === 3 ? 'is-active' : ''}`}
                onClick={() => setWizardStep(3)}
              >
                3. Bots &amp; Commission Payout
              </button>
            </div>

            <form onSubmit={handleCreateSiteSubmit} className="studio-modal__form">
              {wizardStep === 1 && (
                <>
                  <div className="studio-form-grid">
                    <label className="studio-field">
                      <span>Brand / Site Name *</span>
                      <input
                        type="text"
                        value={newBrandName}
                        onChange={e => {
                          const val = e.target.value;
                          setNewBrandName(val);
                          if (!slugEditedManually) {
                            setNewSlug(
                              val
                                .toLowerCase()
                                .replace(/[^a-z0-9-]+/g, '-')
                                .replace(/^-+|-+$/g, '')
                            );
                          }
                        }}
                        placeholder="e.g. Apex Quant"
                        required
                      />
                    </label>

                    <label className="studio-field">
                      <span>Header Tagline</span>
                      <input
                        type="text"
                        value={newTagline}
                        onChange={e => setNewTagline(e.target.value)}
                        placeholder="SMART DERIV TOOLS"
                      />
                    </label>
                  </div>

                  <div className="studio-field">
                    <span>Dedicated .vercel.app Live URL *</span>
                    <div className="studio-url-builder">
                      <input
                        type="text"
                        value={newSlug}
                        onChange={e => {
                          setSlugEditedManually(true);
                          setNewSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/\.vercel\.app$/i, '')
                              .replace(/[^a-z0-9-]+/g, '-')
                          );
                        }}
                        placeholder="apex-quant"
                        required
                      />
                      <span
                        className={`studio-url-builder__badge ${
                          slugCheck.available ? 'is-ok' : 'is-bad'
                        }`}
                      >
                        {slugCheck.checking
                          ? 'Checking…'
                          : slugCheck.available
                          ? `.vercel.app AVAILABLE → https://${slugCheck.vercelDomain}/`
                          : slugCheck.message}
                      </span>
                    </div>
                  </div>

                  <div className="studio-form-grid">
                    <div className="studio-field">
                      <span>Platform Logo</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={newLogoUrl}
                          alt="Brand Logo"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 9,
                            objectFit: 'cover',
                            border: '1px solid #22314d',
                          }}
                        />
                        <input
                          ref={wizardLogoInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={e => void handleLogoFileChange(e, true)}
                        />
                        <button
                          type="button"
                          className="studio-btn studio-btn--ghost studio-btn--sm"
                          onClick={() => wizardLogoInputRef.current?.click()}
                        >
                          Upload Logo
                        </button>
                      </div>
                    </div>

                    <div className="studio-field">
                      <span>Primary Brand Accent</span>
                      <div className="studio-swatches">
                        {COLOR_SWATCHES.map(sw => (
                          <button
                            key={sw.hex}
                            type="button"
                            title={sw.label}
                            className={`studio-swatch ${newColor === sw.hex ? 'is-selected' : ''}`}
                            style={{ backgroundColor: sw.hex }}
                            onClick={() => setNewColor(sw.hex)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {wizardStep === 2 && (
                <>
                  <div className="studio-presets-bar">
                    <span>Presets:</span>
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--xs"
                      onClick={() => setNewEnabledTabs(ALL_13_TABS.map(t => t.id))}
                    >
                      All {ALL_13_TABS.length} Tabs
                    </button>
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--xs"
                      onClick={() =>
                        setNewEnabledTabs([
                          'id-dbot-dashboard',
                          'id-bot-builder',
                          'id-ai-developer',
                          'id-trading-bots',
                          'id-ai-bots',
                        ])
                      }
                    >
                      AI &amp; Bots Only (5)
                    </button>
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost studio-btn--xs"
                      onClick={() =>
                        setNewEnabledTabs([
                          'id-dbot-dashboard',
                          'id-ai-bots',
                          'id-trading-view',
                          'id-analysis-tool',
                          'id-digits-analysis',
                          'id-dtrader',
                          'id-copy-trading',
                          'id-tradepulse',
                        ])
                      }
                    >
                      Pro Trading + Copy Desk (8)
                    </button>
                  </div>

                  <div className="studio-wizard-tabs-grid">
                    {ALL_13_TABS.map(tab => {
                      const on = newEnabledTabs.includes(tab.id);
                      const locked = tab.id === 'id-dbot-dashboard';
                      return (
                        <label
                          key={tab.id}
                          className={`studio-wizard-tab-pill ${on ? 'is-on' : ''}`}
                        >
                          <span>{tab.label}</span>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked}
                            onChange={e => {
                              const checked = e.target.checked;
                              setNewEnabledTabs(prev =>
                                checked
                                  ? Array.from(new Set([...prev, tab.id]))
                                  : prev.filter(id => id !== tab.id)
                              );
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {wizardStep === 3 && (
                <>
                  <div className="studio-form-grid">
                    <div className="studio-field">
                      <span>XML Bot File Upload ({newCustomBots.length} added)</span>
                      <input
                        ref={wizardBotXmlInputRef}
                        type="file"
                        accept=".xml,text/xml,application/xml"
                        multiple
                        hidden
                        onChange={e => void handleBotXmlUpload(e, true)}
                      />
                      <button
                        type="button"
                        className="studio-btn studio-btn--ghost"
                        onClick={() => wizardBotXmlInputRef.current?.click()}
                      >
                        Upload Custom .XML Bot Files
                      </button>
                    </div>

                    <label className="studio-field">
                      <span>Optional Custom Domain (Can also connect later)</span>
                      <input
                        type="text"
                        value={newDomain}
                        onChange={e => setNewDomain(e.target.value)}
                        placeholder="e.g. apexquant.site"
                      />
                    </label>
                  </div>

                  <label className="studio-checkbox-row">
                    <input
                      type="checkbox"
                      checked={newIncludeDefaultBots}
                      onChange={e => setNewIncludeDefaultBots(e.target.checked)}
                    />
                    <span>Include the 18 built-in TradersPulse bots in Free Bots</span>
                  </label>

                  <div className="studio-form-grid">
                    <label className="studio-field">
                      <span>Commission Payout Method</span>
                      <select
                        value={newPayoutMethod}
                        onChange={e => setNewPayoutMethod(e.target.value)}
                      >
                        {PAYOUT_METHODS.filter(Boolean).map(m => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="studio-field">
                      <span>Operator Commission Payout Wallet (M-Pesa / USDT / Deriv CR)</span>
                      <input
                        type="text"
                        value={newPayoutWallet}
                        onChange={e => setNewPayoutWallet(e.target.value)}
                        placeholder="e.g. +2547... or USDT TRC20 Wallet"
                      />
                    </label>
                  </div>

                  <label className="studio-field">
                    <span>Deriv Affiliate Signup Link (Optional)</span>
                    <input
                      type="url"
                      value={newReferral}
                      onChange={e => setNewReferral(e.target.value)}
                      placeholder="https://track.deriv.com/_..."
                    />
                  </label>
                </>
              )}

              {createError && <div className="studio-alert studio-alert--error">{createError}</div>}

              <div className="studio-modal__actions">
                <div>
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      className="studio-btn studio-btn--ghost"
                      onClick={() => setWizardStep(s => (s === 3 ? 2 : 1))}
                    >
                      ← Back
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="studio-btn studio-btn--ghost"
                    onClick={() => setIsCreateOpen(false)}
                    disabled={createBusy}
                  >
                    Cancel
                  </button>

                  {wizardStep < 3 ? (
                    <button
                      type="button"
                      className="studio-btn studio-btn--primary"
                      onClick={() => setWizardStep(s => (s === 1 ? 2 : 3))}
                    >
                      Next Step →
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="studio-btn studio-btn--primary"
                      disabled={createBusy}
                    >
                      {createBusy
                        ? 'Provisioning .vercel.app…'
                        : `Launch https://${slugCheck.vercelDomain || 'your-site.vercel.app'}/ Live`}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
