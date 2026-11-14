import { ALL_13_TABS, ManagedSite } from '../types';

/** A deliberately limited command interpreter; unsupported requests never change a draft. */
export type SiteEditResult =
  | { ok: true; site: ManagedSite; message: string }
  | { ok: false; message: string };

const aliases: Record<string, string[]> = {
  'id-dbot-dashboard': ['dashboard'],
  'id-bot-builder': ['bot builder'],
  'id-ai-developer': ['ai developer'],
  'id-trading-bots': ['free bots', 'free bot'],
  'id-dtrader': ['dtrader', 'd trader'],
  'id-ai-bots': ['ai bots', 'ai bot'],
  'id-auto-trades': ['auto trades', 'auto trading'],
  'id-tick-pulse': ['tickpulse', 'tick pulse'],
  'id-trading-view': ['tradingview', 'trading view'],
  'id-copy-trading': ['copy trading'],
  'id-calculator': ['risk calculator', 'calculator'],
  'id-analysis-tool': ['analysis tool'],
  'id-digits-analysis': ['digits analysis', 'digit analysis'],
  'id-tradepulse': ['tradepulse', 'trade pulse'],
};

export function interpretSiteEdit(instruction: string, site: ManagedSite): SiteEditResult {
  const text = instruction.trim();
  if (!text || text.length > 300) return { ok: false, message: 'Enter one request of up to 300 characters.' };

  // Anchor the entire instruction so multiple actions cannot be partially applied.
  const feature = text.match(/^(remove|hide|disable|turn off|restore|show|enable|turn on|add)\s+(.+?)(?:\s+(?:tab|feature))?(?:\s+(?:from|on|to)\s+(?:my|the|this)\s+site)?[.!]?$/i);
  if (feature) {
    const name = feature[2].toLowerCase().trim().replace(/\s+/g, ' ');
    const match = ALL_13_TABS.find(tab => aliases[tab.id]?.includes(name));
    if (!match) return { ok: false, message: 'I could not identify one feature. Try “Remove DTrader from my site”.' };
    const enable = /^(restore|show|enable|turn on|add)$/i.test(feature[1]);
    if (match.id === 'id-dbot-dashboard' && !enable) return { ok: false, message: 'Dashboard is required and cannot be hidden.' };
    const enabled = site.enabled_tabs.includes(match.id);
    if (enabled === enable) return { ok: false, message: `${match.label} is already ${enable ? 'visible' : 'hidden'} in this draft.` };
    return {
      ok: true,
      site: { ...site, enabled_tabs: enable ? [...site.enabled_tabs, match.id] : site.enabled_tabs.filter(id => id !== match.id) },
      message: `${match.label} will be ${enable ? 'visible' : 'hidden'} on ${site.slug}. Other sites are unchanged.`,
    };
  }

  const color = text.match(/^(?:set|change) (?:the )?(?:primary |brand )?colou?r (?:to )?(#[0-9a-f]{6})[.!]?$/i);
  if (color) return { ok: true, site: { ...site, primary_color: color[1].toUpperCase() }, message: `Primary color will be ${color[1].toUpperCase()} on ${site.slug}.` };

  const brand = text.match(/^(?:set|change) (?:the )?(?:site name|brand name) to ["“]?(.+?)["”]?$/i);
  if (brand && brand[1].trim().length <= 60) {
    const name = brand[1].trim();
    if (!name) return { ok: false, message: 'Enter a site name.' };
    return { ok: true, site: { ...site, brand_name: name }, message: `Site name will be “${name}” on ${site.slug}.` };
  }

  return { ok: false, message: 'That request is not supported yet. Try “Remove DTrader”, “Show DTrader”, “Set primary color to #0066FF”, or “Set site name to My Site”. For other changes use the Studio controls.' };
}
