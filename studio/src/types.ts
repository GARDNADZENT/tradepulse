export type StudioRole = 'operator' | 'super_admin';

export interface StudioUser {
  id: string;
  email: string;
  display_name: string;
  role: StudioRole;
  is_sandbox?: boolean;
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
  monthly_volume_usd?: number;
  custom_bots: ManagedBotItem[];
  updated_at?: string;
}

export interface PlatformSettings {
  pooled_deriv_app_id: string;
  default_commission_pct: number;
  base_domain: string;
  allow_public_signups: boolean;
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
  { id: 'id-free-bots', index: 2, label: 'Free Bots', badge: 'Catalog', description: '18 built-in bots + your uploaded XML strategies' },
  { id: 'id-ai-bots', index: 3, label: 'AI Bots', badge: 'Scanner', description: '7 AI strategies + live in-page AI Bot Scanner' },
  { id: 'id-charts', index: 4, label: 'Charts', badge: 'SmartCharts', description: 'Real-time Deriv synthetic & forex charts' },
  { id: 'id-tutorials', index: 5, label: 'Tutorials', badge: 'Docs', description: 'Video & step-by-step trading guides' },
  { id: 'id-analysis-tool', index: 6, label: 'Analysis Tool', badge: 'Digits', description: 'Even/Odd, Over/Under & Rise/Fall live execution' },
  { id: 'id-signals', index: 7, label: 'Signals', badge: 'Live', description: 'Automated synthetic index signal scanner' },
  { id: 'id-dtrader', index: 8, label: 'DTrader', badge: 'Manual', description: 'Instant Accumulators, Digits & Options trading' },
  { id: 'id-edge-finder', index: 9, label: 'Edge Finder', badge: 'Quant', description: 'Statistical volatility & digit streak scanner' },
  { id: 'id-tradepulse', index: 10, label: 'TradePulse', badge: 'Risk', description: 'Compounding plan, risk calculator & analytics' },
  { id: 'id-auto-trades', index: 11, label: 'Auto Trades', badge: 'Multi-Rule', description: 'Automated multi-condition trigger engine' },
  { id: 'id-copy-trading', index: 12, label: 'Copy Trading', badge: 'V2+V3', description: 'Master-to-follower real-time trade mirroring' },
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

export const SAMPLE_UPLOADED_BOT_XML = `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <variables>
    <variable id="stake_var">Initial Stake</variable>
  </variables>
  <block type="trade_definition" id="td_root" deletable="false" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="td_mkt" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">1HZ100V</field>
        <next>
          <block type="trade_definition_tradetype" id="td_type" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">digits</field>
            <field name="TRADETYPE_LIST">evenodd</field>
            <next>
              <block type="trade_definition_contracttype" id="td_ct" deletable="false" movable="false">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" id="td_ci" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" id="td_rbs" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" id="td_roe" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="INITIALIZATION">
      <block type="variables_set" id="init_stake">
        <field name="VAR" id="stake_var">Initial Stake</field>
        <value name="VALUE">
          <block type="math_number" id="num_1"><field name="NUM">1</field></block>
        </value>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="td_opts">
        <mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="false"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <value name="DURATION">
          <shadow type="math_number_positive" id="dur_1"><field name="NUM">1</field></shadow>
        </value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="amt_1"><field name="NUM">1</field></shadow>
          <block type="variables_get" id="get_stake"><field name="VAR" id="stake_var">Initial Stake</field></block>
        </value>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp_root" deletable="false" x="0" y="420">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="purchase" id="buy_even">
        <field name="PURCHASE_LIST">DIGITEVEN</field>
      </block>
    </statement>
  </block>
</xml>`;
