export type StudioRole = 'operator' | 'super_admin';

export interface StudioUser {
  id: string;
  email: string;
  display_name: string;
  role: StudioRole;
}

export type SocialPlatformKey =
  | 'whatsapp'
  | 'telegram'
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'discord';

export interface ManagedBotItem {
  id: string;
  name: string;
  strategy: string;
  description: string;
  categories: Array<'special' | 'virtual-hook' | 'turbo-ai'>;
  xml_content: string;
  sort_order: number;
  is_active: boolean;
}

export interface ManagedSite {
  id: string;
  owner_id: string;
  owner_email?: string;
  slug: string;
  custom_domain: string;
  domain_status: 'live' | 'verify_dns' | 'ssl_pending';
  status: 'active' | 'maintenance' | 'suspended';
  brand_name: string;
  tagline: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  deriv_app_id: string;
  use_pooled_oauth: boolean;
  pooled_deriv_app_id?: string;
  deriv_referral_link: string;
  announcement_text: string;
  enabled_tabs: string[];
  social_links: Partial<Record<SocialPlatformKey, string>>;
  include_default_bots: boolean;
  commission_share_pct: number;
  custom_bots: ManagedBotItem[];
  updated_at?: string;
}

export interface PlatformSettings {
  pooled_deriv_app_id: string;
  default_commission_pct: number;
  base_domain: string;
  allow_public_signups: boolean;
  tenant_template_base_url: string;
}

export interface FeatureTabMeta {
  id: string;
  index: number;
  label: string;
  badge: string;
  description: string;
}

export const ALL_13_TABS: FeatureTabMeta[] = [
  { id: 'id-dbot-dashboard', index: 0, label: 'Dashboard', badge: 'Core', description: 'Welcome hero, quick launch tiles & reviews' },
  { id: 'id-bot-builder', index: 1, label: 'Bot Builder', badge: 'Blockly', description: 'Visual XML Blockly strategy builder & RunPanel' },
  { id: 'id-ai-developer', index: 2, label: 'AI Developer', badge: 'GenAI', description: 'Generate & customize Blockly strategies with AI' },
  { id: 'id-trading-bots', index: 3, label: 'Free Bots', badge: 'Catalog', description: '18 built-in bots + your uploaded XML strategies' },
  { id: 'id-dtrader', index: 4, label: 'DTrader', badge: 'Manual', description: 'Instant Accumulators, Digits & Options trading' },
  { id: 'id-ai-bots', index: 5, label: 'AI Bots', badge: 'Scanner', description: '7 AI strategies + live in-page AI Bot Scanner' },
  { id: 'id-auto-trades', index: 6, label: 'Auto Trades', badge: 'Multi-Rule', description: 'Automated multi-condition trigger engine' },
  { id: 'id-trading-view', index: 7, label: 'TradingView', badge: 'Charts', description: 'Real-time Deriv synthetic & forex charts' },
  { id: 'id-copy-trading', index: 8, label: 'Copy Trading', badge: 'V2+V3', description: 'Master-to-follower real-time trade mirroring' },
  { id: 'id-calculator', index: 9, label: 'Risk Calculator', badge: 'Risk', description: 'Martingale & compounding stake planner' },
  { id: 'id-analysis-tool', index: 10, label: 'Analysis Tool', badge: 'Digits', description: 'Even/Odd, Over/Under & Rise/Fall live execution' },
  { id: 'id-digits-analysis', index: 11, label: 'Digits Analysis', badge: 'Quant', description: 'Statistical volatility & digit streak heatmap' },
  { id: 'id-tradepulse', index: 12, label: 'TradePulse', badge: 'Suite', description: 'Compounding plan, master schedule & analytics' },
];

export const COLOR_SWATCHES = [
  { label: 'Electric Blue', hex: '#0066FF' },
  { label: 'Emerald Pulse', hex: '#10B981' },
  { label: 'Royal Violet', hex: '#8B5CF6' },
  { label: 'Cyber Cyan', hex: '#06B6D4' },
  { label: 'Amber Gold', hex: '#F59E0B' },
  { label: 'Crimson Edge', hex: '#EF4444' },
];

export const SOCIAL_FIELDS: Array<{ id: SocialPlatformKey; label: string; placeholder: string }> = [
  { id: 'whatsapp', label: 'WhatsApp Channel / Group', placeholder: 'https://whatsapp.com/channel/...' },
  { id: 'telegram', label: 'Telegram Channel', placeholder: 'https://t.me/yourchannel' },
  { id: 'youtube', label: 'YouTube Channel', placeholder: 'https://youtube.com/@yourhandle' },
  { id: 'tiktok', label: 'TikTok Profile', placeholder: 'https://tiktok.com/@yourhandle' },
  { id: 'instagram', label: 'Instagram Profile', placeholder: 'https://instagram.com/yourhandle' },
  { id: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/yourhandle' },
  { id: 'facebook', label: 'Facebook Page', placeholder: 'https://facebook.com/yourpage' },
  { id: 'discord', label: 'Discord Invite', placeholder: 'https://discord.gg/yourinvite' },
];
