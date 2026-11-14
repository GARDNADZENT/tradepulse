import { interpretSiteEdit } from '../site-editor';
import { ALL_13_TABS, ManagedSite } from '../../types';

const site = {
  id: 'site-a', slug: 'tradepulse-lovat', brand_name: 'TradersPulse',
  primary_color: '#0066FF', enabled_tabs: ALL_13_TABS.map(tab => tab.id),
} as ManagedSite;

describe('Site Editor supported requests', () => {
  it('stages hiding and restoring a feature without modifying the original site', () => {
    const result = interpretSiteEdit('Remove DTrader from my site', site);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.site.enabled_tabs).not.toContain('id-dtrader');
    expect(site.enabled_tabs).toContain('id-dtrader');
    expect(result.site.id).toBe('site-a');
    const restored = interpretSiteEdit('Show DTrader', result.site);
    expect(restored.ok && restored.site.enabled_tabs).toContain('id-dtrader');
  });

  it('allows TickPulse to be hidden on the flagship', () => {
    const result = interpretSiteEdit('hide TickPulse', site);
    expect(result.ok && result.site.enabled_tabs).not.toContain('id-tick-pulse');
  });

  it('rejects unknown, multiple and unsafe requests instead of making partial changes', () => {
    expect(interpretSiteEdit('remove DTrader and AI Bots', site).ok).toBe(false);
    expect(interpretSiteEdit('remove dashboard', site).ok).toBe(false);
    expect(interpretSiteEdit('create a new trading engine', site).ok).toBe(false);
  });

  it('stages site name and validated primary color changes', () => {
    const name = interpretSiteEdit('Set site name to My Site', site);
    expect(name.ok && name.site.brand_name).toBe('My Site');
    const color = interpretSiteEdit('Set primary color to #abcdef', site);
    expect(color.ok && color.site.primary_color).toBe('#ABCDEF');
    expect(interpretSiteEdit('Set primary color to red', site).ok).toBe(false);
  });
});
