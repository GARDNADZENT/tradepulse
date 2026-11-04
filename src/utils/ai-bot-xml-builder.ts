import { runInAction } from 'mobx';
import {
    formatTabContractShortLabel,
    getTabTradeStore,
    TabRecordNamespace,
} from '@/components/tab-trade-record/tab-trade-store';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base, LogTypes } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { getSymbolDisplayNameSync } from '@/utils/symbol-display-name';

export type AIBotContractKind =
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITMATCH'
    | 'DIGITDIFF'
    | 'CALL'
    | 'PUT';

export type AIBotEntryFilter =
    | 'INSTANT'
    | 'STREAK'
    | 'PARITY_MAJORITY'
    | 'OVER_UNDER_MAJORITY'
    | 'EXACT_DIGIT';

export interface AIBotSpec {
    name: string;
    symbol: string;
    contractType: AIBotContractKind;
    barrier?: number;
    recoveryBarrier?: number;
    durationTicks?: number;
    baseStake: number;
    martingaleMultiplier: number;
    takeProfit: number;
    stopLoss: number;
    virtualHookEnabled?: boolean;
    virtualHookStartMode?: 'virtual' | 'real';
    virtualHookLosses?: number;
    virtualHookWins?: number;
    entryFilter?: AIBotEntryFilter;
    entryWindow?: number;
    entryThreshold?: number;
    entryDigit?: number;
}

const getSubmarketForSymbol = (symbol: string): string => {
    if (symbol.startsWith('JD')) return 'jump_index';
    if (symbol.startsWith('CRASH') || symbol.startsWith('BOOM')) return 'crash_index';
    return 'random_index';
};

const getTradeCategoryAndType = (ct: AIBotContractKind) => {
    switch (ct) {
        case 'DIGITOVER':
        case 'DIGITUNDER':
            return { cat: 'digits', type: 'overunder', hasPred: true };
        case 'DIGITEVEN':
        case 'DIGITODD':
            return { cat: 'digits', type: 'evenodd', hasPred: false };
        case 'DIGITMATCH':
        case 'DIGITDIFF':
            return { cat: 'digits', type: 'matchesdiffers', hasPred: true };
        case 'CALL':
        case 'PUT':
        default:
            return { cat: 'callput', type: 'callput', hasPred: false };
    }
};

export function compileAIBotToXml(spec: AIBotSpec): string {
    const symbol = spec.symbol || 'R_50';
    const submarket = getSubmarketForSymbol(symbol);
    const { cat, type, hasPred } = getTradeCategoryAndType(spec.contractType);
    const baseStake = Math.max(0.35, Number(spec.baseStake) || 1);
    const martingale = Math.max(1, Number(spec.martingaleMultiplier) || 2);
    const takeProfit = Math.max(0.5, Number(spec.takeProfit) || 10);
    const stopLoss = Math.max(1, Number(spec.stopLoss) || 25);
    const duration = Math.max(1, Math.min(10, Math.round(Number(spec.durationTicks) || 1)));
    const barrier = Math.max(0, Math.min(9, Math.round(Number(spec.barrier ?? 4))));
    const recBarrier = Math.max(
        0,
        Math.min(
            9,
            Math.round(
                Number(
                    spec.recoveryBarrier ??
                        (spec.contractType === 'DIGITOVER'
                            ? Math.min(8, barrier + 1)
                            : spec.contractType === 'DIGITUNDER'
                              ? Math.max(1, barrier - 1)
                              : barrier)
                )
            )
        )
    );

    const vhEnabled = Boolean(spec.virtualHookEnabled);
    const vhStartMode = spec.virtualHookStartMode === 'real' ? 'real' : 'virtual';
    const vhLosses = Math.max(1, Math.round(Number(spec.virtualHookLosses) || 2));
    const vhWins = Math.max(1, Math.round(Number(spec.virtualHookWins) || 1));

    const entryFilter = spec.entryFilter || 'INSTANT';
    const entryWin = Math.max(2, Math.round(Number(spec.entryWindow) || 2));
    const entryThresh = Math.max(50, Math.min(95, Math.round(Number(spec.entryThreshold) || 58)));
    const entryDigit = Math.max(0, Math.min(9, Math.round(Number(spec.entryDigit ?? barrier))));

    let conditionBlockXml = '';
    if (entryFilter === 'STREAK') {
        const streakCond =
            spec.contractType === 'DIGITOVER'
                ? 'LTE'
                : spec.contractType === 'DIGITUNDER'
                  ? 'GTE'
                  : spec.contractType === 'DIGITEVEN'
                    ? 'ODD'
                    : 'EVEN';
        conditionBlockXml = `
          <block type="vh_virtual_streak_ready" id="cond_streak">
            <field name="STREAK">${Math.min(10, entryWin)}</field>
            <field name="CONDITION">${streakCond}</field>
            <field name="BARRIER">${barrier}</field>
          </block>`;
    } else if (entryFilter === 'PARITY_MAJORITY') {
        const parity = spec.contractType === 'DIGITODD' ? 'ODD' : 'EVEN';
        conditionBlockXml = `
          <block type="al_parity_majority" id="cond_parity">
            <field name="WINDOW">${Math.max(10, entryWin)}</field>
            <field name="PARITY">${parity}</field>
            <field name="THRESHOLD">${entryThresh}</field>
          </block>`;
    } else if (entryFilter === 'OVER_UNDER_MAJORITY') {
        const dir = spec.contractType === 'DIGITUNDER' ? 'UNDER' : 'OVER';
        conditionBlockXml = `
          <block type="al_over_under_majority" id="cond_ou">
            <field name="WINDOW">${Math.max(10, entryWin)}</field>
            <field name="DIR">${dir}</field>
            <field name="BARRIER">${barrier}</field>
            <field name="THRESHOLD">${entryThresh}</field>
          </block>`;
    } else if (entryFilter === 'EXACT_DIGIT') {
        conditionBlockXml = `
          <block type="logic_compare" id="cond_exact">
            <field name="OP">EQ</field>
            <value name="A">
              <block type="last_digit" id="cond_ld"></block>
            </value>
            <value name="B">
              <block type="math_number" id="cond_ld_num">
                <field name="NUM">${entryDigit}</field>
              </block>
            </value>
          </block>`;
    }

    const purchaseBlock = `<block type="purchase" id="bp_purchase">
        <field name="PURCHASE_LIST">${spec.contractType}</field>
      </block>`;

    const beforePurchaseStack = conditionBlockXml
        ? `<block type="controls_if" id="bp_gate">
            <value name="IF0">${conditionBlockXml}
            </value>
            <statement name="DO0">
              ${purchaseBlock}
            </statement>
          </block>`
        : purchaseBlock;

    const vhConfigXml = vhEnabled
        ? `<next>
            <block type="virtual_hook_config" id="init_vh">
              <field name="VH_ENABLED">ENABLED</field>
              <field name="START_MODE">${vhStartMode}</field>
              <value name="ENTER_AFTER_LOSSES">
                <block type="math_number" id="vh_l"><field name="NUM">${vhLosses}</field></block>
              </value>
              <value name="RETURN_AFTER_WINS">
                <block type="math_number" id="vh_w"><field name="NUM">${vhWins}</field></block>
              </value>
            </block>
          </next>`
        : '';

    const predictionOptionXml = hasPred
        ? `<value name="PREDICTION">
          <shadow type="math_number_positive" id="shad_pred" inline="true">
            <field name="NUM">${barrier}</field>
          </shadow>
          <block type="variables_get" id="opt_get_pred">
            <field name="VAR" id="var_active_pred">Active Prediction</field>
          </block>
        </value>`
        : '';

    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <variables>
    <variable id="var_base_stake">Base Stake</variable>
    <variable id="var_active_stake">Active Stake</variable>
    <variable id="var_martingale">Martingale Factor</variable>
    <variable id="var_tp">Take Profit</variable>
    <variable id="var_sl">Stop Loss</variable>
    <variable id="var_pred_before">Entry Prediction</variable>
    <variable id="var_pred_after">Recovery Prediction</variable>
    <variable id="var_active_pred">Active Prediction</variable>
  </variables>
  <block type="trade_definition" id="td_root" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="td_market" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">${submarket}</field>
        <field name="SYMBOL_LIST">${symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="td_tradetype" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">${cat}</field>
            <field name="TRADETYPE_LIST">${type}</field>
            <next>
              <block type="trade_definition_contracttype" id="td_contracttype" deletable="false" movable="false">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" id="td_candle" deletable="false" movable="false">
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
      <block type="variables_set" id="init_bs">
        <field name="VAR" id="var_base_stake">Base Stake</field>
        <value name="VALUE"><block type="math_number" id="n_bs"><field name="NUM">${baseStake}</field></block></value>
        <next>
          <block type="variables_set" id="init_as">
            <field name="VAR" id="var_active_stake">Active Stake</field>
            <value name="VALUE"><block type="variables_get" id="g_bs"><field name="VAR" id="var_base_stake">Base Stake</field></block></value>
            <next>
              <block type="variables_set" id="init_mg">
                <field name="VAR" id="var_martingale">Martingale Factor</field>
                <value name="VALUE"><block type="math_number" id="n_mg"><field name="NUM">${martingale}</field></block></value>
                <next>
                  <block type="variables_set" id="init_tp">
                    <field name="VAR" id="var_tp">Take Profit</field>
                    <value name="VALUE"><block type="math_number" id="n_tp"><field name="NUM">${takeProfit}</field></block></value>
                    <next>
                      <block type="variables_set" id="init_sl">
                        <field name="VAR" id="var_sl">Stop Loss</field>
                        <value name="VALUE"><block type="math_number" id="n_sl"><field name="NUM">${stopLoss}</field></block></value>
                        <next>
                          <block type="variables_set" id="init_pb">
                            <field name="VAR" id="var_pred_before">Entry Prediction</field>
                            <value name="VALUE"><block type="math_number" id="n_pb"><field name="NUM">${barrier}</field></block></value>
                            <next>
                              <block type="variables_set" id="init_pa">
                                <field name="VAR" id="var_pred_after">Recovery Prediction</field>
                                <value name="VALUE"><block type="math_number" id="n_pa"><field name="NUM">${recBarrier}</field></block></value>
                                <next>
                                  <block type="variables_set" id="init_ap">
                                    <field name="VAR" id="var_active_pred">Active Prediction</field>
                                    <value name="VALUE"><block type="variables_get" id="g_pb"><field name="VAR" id="var_pred_before">Entry Prediction</field></block></value>
                                    ${vhConfigXml}
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
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="td_options">
        <mutation has_first_barrier="false" has_second_barrier="false" has_prediction="${hasPred ? 'true' : 'false'}"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION">
          <shadow type="math_number_positive" id="shad_dur"><field name="NUM">${duration}</field></shadow>
        </value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="shad_amt"><field name="NUM">${baseStake}</field></shadow>
          <block type="variables_get" id="opt_get_stake"><field name="VAR" id="var_active_stake">Active Stake</field></block>
        </value>
        ${predictionOptionXml}
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp_root" deletable="false" x="0" y="680">
    <statement name="BEFOREPURCHASE_STACK">
      ${beforePurchaseStack}
    </statement>
  </block>
  <block type="during_purchase" id="dp_root" x="680" y="0">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if" id="dp_if">
        <value name="IF0"><block type="check_sell" id="dp_cs"></block></value>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="ap_root" x="680" y="200">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if" id="ap_wl">
        <mutation else="1"></mutation>
        <value name="IF0">
          <block type="contract_check_result" id="ap_win"><field name="CHECK_RESULT">win</field></block>
        </value>
        <statement name="DO0">
          <block type="variables_set" id="w_rst_s">
            <field name="VAR" id="var_active_stake">Active Stake</field>
            <value name="VALUE"><block type="variables_get" id="w_g_bs"><field name="VAR" id="var_base_stake">Base Stake</field></block></value>
            <next>
              <block type="variables_set" id="w_rst_p">
                <field name="VAR" id="var_active_pred">Active Prediction</field>
                <value name="VALUE"><block type="variables_get" id="w_g_pb"><field name="VAR" id="var_pred_before">Entry Prediction</field></block></value>
              </block>
            </next>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="variables_set" id="l_set_p">
            <field name="VAR" id="var_active_pred">Active Prediction</field>
            <value name="VALUE"><block type="variables_get" id="l_g_pa"><field name="VAR" id="var_pred_after">Recovery Prediction</field></block></value>
            <next>
              <block type="variables_set" id="l_set_s">
                <field name="VAR" id="var_active_stake">Active Stake</field>
                <value name="VALUE">
                  <block type="math_arithmetic" id="l_mul">
                    <field name="OP">MULTIPLY</field>
                    <value name="A"><block type="variables_get" id="l_cs"><field name="VAR" id="var_active_stake">Active Stake</field></block></value>
                    <value name="B"><block type="variables_get" id="l_mg"><field name="VAR" id="var_martingale">Martingale Factor</field></block></value>
                  </block>
                </value>
              </block>
            </next>
          </block>
        </statement>
        <next>
          <block type="controls_if" id="ap_tp_sl">
            <mutation elseif="1" else="1"></mutation>
            <value name="IF0">
              <block type="logic_compare" id="chk_tp">
                <field name="OP">GTE</field>
                <value name="A"><block type="total_profit" id="tp_val"></block></value>
                <value name="B"><block type="variables_get" id="g_tp"><field name="VAR" id="var_tp">Take Profit</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="text_print" id="prt_tp">
                <value name="TEXT"><shadow type="text" id="txt_tp"><field name="TEXT">Target Profit Reached!</field></shadow></value>
              </block>
            </statement>
            <value name="IF1">
              <block type="logic_compare" id="chk_sl">
                <field name="OP">LTE</field>
                <value name="A"><block type="total_profit" id="sl_val"></block></value>
                <value name="B">
                  <block type="math_single" id="neg_sl">
                    <field name="OP">NEG</field>
                    <value name="NUM"><block type="variables_get" id="g_sl"><field name="VAR" id="var_sl">Stop Loss</field></block></value>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO1">
              <block type="text_print" id="prt_sl">
                <value name="TEXT"><shadow type="text" id="txt_sl"><field name="TEXT">Stop Loss Reached.</field></shadow></value>
              </block>
            </statement>
            <statement name="ELSE">
              <block type="trade_again" id="ap_again"></block>
            </statement>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>`;
}

export async function loadXmlIntoBotBuilder(options: {
    xml: string;
    name: string;
    dashboard: any;
    load_modal: any;
    runNow?: boolean;
    run_panel?: any;
}) {
    const { xml, name, dashboard, load_modal, runNow, run_panel } = options;
    dashboard?.setActiveTab?.(DBOT_TABS.BOT_BUILDER);

    for (let attempt = 0; attempt < 25; attempt++) {
        if ((window as any).Blockly?.derivWorkspace) break;
        await new Promise(resolve => setTimeout(resolve, 60));
    }

    await new Promise(resolve => setTimeout(resolve, 80));
    const id = `ai-bot-${Date.now()}`;
    await load_modal?.loadStrategyToBuilder?.({ id, xml, name, save_type: 'local' }, true);

    const ws = (window as any).Blockly?.derivWorkspace;
    if (ws) {
        try {
            ws.getAllBlocks?.().forEach((b: any) => b.setErrorHighlighted?.(false));
            (window as any).Blockly?.svgResize?.(ws);
        } catch {}
    }

    if (runNow && run_panel?.onRunButtonClick) {
        await new Promise(resolve => setTimeout(resolve, 220));
        if (!run_panel.is_running) {
            run_panel.onRunButtonClick();
        }
    }
}

export function extractDerivApiError(err: any, fallback = 'Purchase failed — please try again.'): string {
    if (!err) return fallback;
    const msg =
        err?.error?.message_to_client ||
        err?.error?.message ||
        err?.localizedMessage ||
        (typeof err?.message === 'string' ? err.message : '') ||
        (typeof err === 'string' ? err : '');
    return msg ? String(msg) : fallback;
}

export function normalizeDerivContractParams(params: {
    contractType: string;
    duration?: number;
    barrier?: number | string;
}): { apiContractType: string; duration: number; durationUnit: 't'; barrier?: string } {
    const rawType = String(params.contractType || 'DIGITOVER').toUpperCase();
    const rawDur = Math.max(1, Math.round(Number(params.duration) || 1));
    const numBarrier = Number(params.barrier);

    switch (rawType) {
        case 'DIGITOVER': {
            const b = Number.isFinite(numBarrier) ? Math.min(8, Math.max(0, Math.round(numBarrier))) : 3;
            return { apiContractType: 'DIGITOVER', duration: Math.min(10, rawDur), durationUnit: 't', barrier: String(b) };
        }
        case 'DIGITUNDER': {
            const b = Number.isFinite(numBarrier) ? Math.min(9, Math.max(1, Math.round(numBarrier))) : 6;
            return { apiContractType: 'DIGITUNDER', duration: Math.min(10, rawDur), durationUnit: 't', barrier: String(b) };
        }
        case 'DIGITMATCH':
        case 'DIGITDIFF': {
            const b = Number.isFinite(numBarrier) ? Math.min(9, Math.max(0, Math.round(numBarrier))) : 5;
            return { apiContractType: rawType, duration: Math.min(10, rawDur), durationUnit: 't', barrier: String(b) };
        }
        case 'DIGITEVEN':
        case 'DIGITODD':
            return { apiContractType: rawType, duration: Math.min(10, rawDur), durationUnit: 't' };
        case 'HIGHER': {
            const offset = Number.isFinite(numBarrier) && numBarrier !== 0 ? Math.abs(numBarrier) : 0.1;
            return { apiContractType: 'CALL', duration: Math.max(5, rawDur), durationUnit: 't', barrier: `+${offset}` };
        }
        case 'LOWER': {
            const offset = Number.isFinite(numBarrier) && numBarrier !== 0 ? Math.abs(numBarrier) : 0.1;
            return { apiContractType: 'PUT', duration: Math.max(5, rawDur), durationUnit: 't', barrier: `-${offset}` };
        }
        case 'TOUCH':
        case 'ONETOUCH': {
            const offset = Number.isFinite(numBarrier) && numBarrier !== 0 ? Math.abs(numBarrier) : 0.5;
            return { apiContractType: 'ONETOUCH', duration: Math.max(5, rawDur), durationUnit: 't', barrier: `+${offset}` };
        }
        case 'NOTOUCH': {
            const offset = Number.isFinite(numBarrier) && numBarrier !== 0 ? Math.abs(numBarrier) : 0.5;
            return { apiContractType: 'NOTOUCH', duration: Math.max(5, rawDur), durationUnit: 't', barrier: `+${offset}` };
        }
        case 'CALL':
        case 'PUT':
        default:
            return { apiContractType: rawType === 'PUT' ? 'PUT' : 'CALL', duration: rawDur, durationUnit: 't' };
    }
}

const TERMINAL_CONTRACT_STATUSES = ['won', 'lost', 'sold', 'expired'];

function coerceSpotPrimitive(val: unknown): string | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val === 'number' || typeof val === 'string') return String(val);
    if (typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        const candidate = obj.display_value ?? obj.quote ?? obj.spot ?? obj.value;
        if (candidate !== undefined && candidate !== null) return String(candidate);
    }
    return undefined;
}

function buildFallbackContractLongcode(
    symbol: string,
    apiContractType: string,
    duration: number,
    barrier?: string
): string {
    const marketName = getSymbolDisplayNameSync(symbol) || symbol;
    switch (apiContractType) {
        case 'DIGITOVER':
            return `Win payout if the last digit of ${marketName} is strictly higher than ${barrier ?? ''} after ${duration} ticks.`;
        case 'DIGITUNDER':
            return `Win payout if the last digit of ${marketName} is strictly lower than ${barrier ?? ''} after ${duration} ticks.`;
        case 'DIGITEVEN':
            return `Win payout if the last digit of ${marketName} is even after ${duration} ticks.`;
        case 'DIGITODD':
            return `Win payout if the last digit of ${marketName} is odd after ${duration} ticks.`;
        case 'DIGITMATCH':
            return `Win payout if the last digit of ${marketName} is ${barrier ?? ''} after ${duration} ticks.`;
        case 'DIGITDIFF':
            return `Win payout if the last digit of ${marketName} is not ${barrier ?? ''} after ${duration} ticks.`;
        case 'CALL':
            return `Win payout if ${marketName} is strictly higher than entry spot at ${duration} ticks after contract start time.`;
        case 'PUT':
            return `Win payout if ${marketName} is strictly lower than entry spot at ${duration} ticks after contract start time.`;
        default:
            return `Win payout on ${marketName} (${apiContractType}) after ${duration} ticks.`;
    }
}

export interface LiveTradeRecordingStores {
    journal?: any;
    transactions?: any;
    summary_card?: any;
    run_panel?: any;
}

export async function executeLiveDerivTrade(params: {
    symbol: string;
    contractType: string;
    stake: number;
    duration?: number;
    barrier?: number | string;
    currency?: string;
    tabNamespace?: TabRecordNamespace;
    stores?: LiveTradeRecordingStores;
    onContractUpdate?: (poc: any, isTerminal: boolean) => void;
}): Promise<{ contractId: number; buyPrice: number; payout: number; longcode: string }> {
    if (!api_base?.api || (api_base.api as any)?.connection?.readyState !== 1) {
        try {
            await api_base.init();
        } catch {
            // handled below if transport still unavailable
        }
    }
    const transport: any = api_base?.api?.send ? api_base.api : chart_api?.api;
    if (!transport?.send) {
        throw new Error('Connect your Deriv account first to execute live trades.');
    }

    const stakeAmount = Math.max(0.35, Number(params.stake) || 1);
    const activeCurrency =
        params.currency || (api_base?.account_info as any)?.currency || 'USD';
    const spec = normalizeDerivContractParams({
        contractType: params.contractType,
        duration: params.duration,
        barrier: params.barrier,
    });

    const buildParameters = (useUnderlyingSymbol: boolean) => {
        const p: Record<string, any> = {
            amount: stakeAmount,
            basis: 'stake',
            contract_type: spec.apiContractType,
            currency: activeCurrency,
            duration: spec.duration,
            duration_unit: spec.durationUnit,
        };
        if (useUnderlyingSymbol) p.underlying_symbol = params.symbol;
        else p.symbol = params.symbol;
        if (spec.barrier !== undefined) p.barrier = spec.barrier;
        return p;
    };

    let buyRes: any;
    try {
        buyRes = await transport.send({
            buy: '1',
            price: stakeAmount,
            parameters: buildParameters(true),
        });
        if (buyRes?.error?.code === 'InputValidationFailed') {
            buyRes = await transport.send({
                buy: '1',
                price: stakeAmount,
                parameters: buildParameters(false),
            });
        }
    } catch (firstErr: any) {
        const code = firstErr?.error?.code || firstErr?.code || '';
        const msg = extractDerivApiError(firstErr, '');
        if (code === 'InputValidationFailed' || /underlying_symbol|symbol/i.test(msg)) {
            try {
                buyRes = await transport.send({
                    buy: '1',
                    price: stakeAmount,
                    parameters: buildParameters(false),
                });
            } catch (secondErr: any) {
                throw new Error(extractDerivApiError(secondErr));
            }
        } else {
            throw new Error(extractDerivApiError(firstErr));
        }
    }

    if (buyRes?.error) {
        throw new Error(extractDerivApiError(buyRes));
    }
    const buyObj = buyRes?.buy;
    const contractId = Number(buyObj?.contract_id);
    if (!contractId) {
        throw new Error('Deriv did not return a contract ID.');
    }

    const buyPrice = Number(buyObj.buy_price ?? stakeAmount);
    const payout = Number(buyObj.payout ?? 0);
    const buyTxId = Number(buyObj.transaction_id || contractId);
    const resolvedLongcode =
        buyObj.longcode || buildFallbackContractLongcode(params.symbol, spec.apiContractType, spec.duration, spec.barrier);
    const marketDisplayName = getSymbolDisplayNameSync(params.symbol) || params.symbol;

    const { journal, transactions, summary_card, run_panel } = params.stores || {};
    const tabStore = params.tabNamespace ? getTabTradeStore(params.tabNamespace) : null;
    const shortLabel = formatTabContractShortLabel(spec.apiContractType, spec.barrier);
    const createdAtMs = Date.now();

    // Prevent app-content.jsx recoverPendingContracts from pulling tab-scoped manual trades into Bot Builder's global RunPanel
    if (tabStore) {
        runInAction(() => {
            if (
                Array.isArray(transactions?.recovered_transactions) &&
                !transactions.recovered_transactions.includes(contractId)
            ) {
                transactions.recovered_transactions.push(contractId);
            }
            if (
                Array.isArray(transactions?.recovered_completed_transactions) &&
                !transactions.recovered_completed_transactions.includes(contractId)
            ) {
                transactions.recovered_completed_transactions.push(contractId);
            }
        });

        tabStore.appendJournal({
            type: 'purchase',
            message: `Bought: ${resolvedLongcode}`,
            contractId,
            transactionId: buyTxId,
            currency: activeCurrency,
            timestamp: createdAtMs,
        });

        tabStore.upsertTransaction({
            contractId,
            buyTransactionId: buyTxId,
            timestamp: createdAtMs,
            symbol: params.symbol,
            displayName: marketDisplayName,
            contractType: spec.apiContractType,
            shortLabel,
            longcode: resolvedLongcode,
            barrier: spec.barrier,
            duration: spec.duration,
            buyPrice,
            bidPrice: buyPrice,
            payout,
            profit: 0,
            currency: activeCurrency,
            status: 'open',
            isCompleted: false,
        });
    } else {
        if (run_panel) {
            if (!run_panel.run_id) {
                run_panel.run_id = `manual-${Date.now()}`;
            }
            if (!run_panel.is_drawer_open && typeof window !== 'undefined' && window.innerWidth >= 1024) {
                run_panel.toggleDrawer?.(true);
            }
            if (run_panel.active_index === 0) {
                run_panel.setActiveTabIndex?.(2);
            }
        }

        if (journal?.onLogSuccess) {
            journal.onLogSuccess({
                log_type: LogTypes.PURCHASE,
                extra: {
                    longcode: resolvedLongcode,
                    transaction_id: buyTxId,
                },
            });
        }
    }

    const baseContractRecord: Record<string, any> = {
        contract_id: contractId,
        transaction_ids: { buy: buyTxId },
        buy_price: buyPrice,
        bid_price: buyPrice,
        payout,
        profit: 0,
        currency: activeCurrency,
        contract_type: spec.apiContractType,
        underlying: params.symbol,
        underlying_symbol: params.symbol,
        display_name: marketDisplayName,
        shortcode: buyObj.shortcode || '',
        longcode: resolvedLongcode,
        barrier: spec.barrier,
        tick_count: spec.duration,
        date_start: buyObj.start_time || Math.floor(createdAtMs / 1000),
        status: 'open',
        is_completed: false,
    };

    if (!tabStore) {
        transactions?.onBotContractEvent?.(baseContractRecord);
        summary_card?.onBotContractEvent?.(baseContractRecord);
    }

    if (transport?.onMessage) {
        let settledOnce = false;
        let unsubMsg: (() => void) | undefined;

        try {
            unsubMsg = transport.onMessage()?.subscribe?.(({ data }: { data: any }) => {
                const poc = data?.proposal_open_contract;
                if (!poc || Number(poc.contract_id) !== contractId) return;

                const statusStr = String(poc.status || (poc.is_sold ? 'sold' : 'open'));
                const isTerminal =
                    TERMINAL_CONTRACT_STATUSES.includes(statusStr) || Boolean(poc.is_sold) || Boolean(poc.is_expired);

                const entrySpot = coerceSpotPrimitive(
                    poc.entry_spot_display_value ??
                        poc.entry_tick_display_value ??
                        poc.entry_spot ??
                        poc.entry_tick
                );
                const exitSpot = coerceSpotPrimitive(
                    poc.exit_spot_display_value ??
                        poc.exit_tick_display_value ??
                        poc.exit_spot ??
                        poc.exit_tick
                );

                const shouldLogSettlement = isTerminal && !settledOnce;
                if (shouldLogSettlement) {
                    settledOnce = true;
                    runInAction(() => {
                        if (
                            Array.isArray(transactions?.recovered_transactions) &&
                            !transactions.recovered_transactions.includes(contractId)
                        ) {
                            transactions.recovered_transactions.push(contractId);
                        }
                        if (
                            Array.isArray(transactions?.recovered_completed_transactions) &&
                            !transactions.recovered_completed_transactions.includes(contractId)
                        ) {
                            transactions.recovered_completed_transactions.push(contractId);
                        }
                    });
                }

                const finalProfit = Number(poc.profit ?? 0);
                const resolvedCurrency = poc.currency || activeCurrency;

                if (tabStore) {
                    const resolvedStatus = isTerminal
                        ? finalProfit > 0
                            ? 'won'
                            : finalProfit < 0
                              ? 'lost'
                              : (statusStr as 'sold' | 'expired')
                        : 'open';

                    tabStore.upsertTransaction({
                        contractId,
                        buyTransactionId: Number(poc.transaction_ids?.buy ?? buyTxId),
                        sellTransactionId: poc.transaction_ids?.sell ? Number(poc.transaction_ids.sell) : undefined,
                        timestamp: createdAtMs,
                        symbol: poc.underlying_symbol || poc.underlying || params.symbol,
                        displayName: poc.display_name || marketDisplayName,
                        contractType: poc.contract_type || spec.apiContractType,
                        shortLabel,
                        longcode: poc.longcode || resolvedLongcode,
                        barrier: spec.barrier,
                        duration: spec.duration,
                        buyPrice: Number(poc.buy_price ?? buyPrice),
                        bidPrice: Number(poc.bid_price ?? buyPrice),
                        payout: Number(poc.payout ?? payout),
                        profit: finalProfit,
                        currency: resolvedCurrency,
                        entrySpot,
                        exitSpot,
                        status: resolvedStatus,
                        isCompleted: isTerminal,
                    });

                    if (shouldLogSettlement) {
                        tabStore.appendJournal({
                            type: finalProfit >= 0 ? 'profit' : 'loss',
                            message:
                                finalProfit >= 0
                                    ? `Won: ${shortLabel} on ${marketDisplayName}`
                                    : `Lost: ${shortLabel} on ${marketDisplayName}`,
                            amount: finalProfit,
                            currency: resolvedCurrency,
                            contractId,
                            transactionId: poc.transaction_ids?.sell
                                ? Number(poc.transaction_ids.sell)
                                : buyTxId,
                        });
                        unsubMsg?.();
                    }
                } else {
                    const mergedRecord: Record<string, any> = {
                        ...baseContractRecord,
                        ...poc,
                        contract_id: contractId,
                        underlying: poc.underlying || params.symbol,
                        underlying_symbol: poc.underlying_symbol || poc.underlying || params.symbol,
                        display_name: poc.display_name || marketDisplayName,
                        contract_type: poc.contract_type || spec.apiContractType,
                        longcode: poc.longcode || resolvedLongcode,
                        buy_price: Number(poc.buy_price ?? buyPrice),
                        bid_price: Number(poc.bid_price ?? buyPrice),
                        payout: Number(poc.payout ?? payout),
                        profit: finalProfit,
                        currency: resolvedCurrency,
                        entry_spot: entrySpot,
                        exit_spot: exitSpot,
                        transaction_ids: {
                            buy: poc.transaction_ids?.buy ?? buyTxId,
                            ...(poc.transaction_ids?.sell ? { sell: poc.transaction_ids.sell } : {}),
                        },
                        status: statusStr,
                        is_completed: isTerminal,
                    };

                    transactions?.onBotContractEvent?.(mergedRecord);
                    summary_card?.onBotContractEvent?.(mergedRecord);

                    if (shouldLogSettlement) {
                        journal?.onLogSuccess?.({
                            log_type: finalProfit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                            extra: {
                                currency: resolvedCurrency,
                                profit: finalProfit,
                            },
                        });
                        unsubMsg?.();
                    }
                }

                params.onContractUpdate?.(poc, isTerminal);
            })?.unsubscribe;

            void transport
                .send({
                    proposal_open_contract: 1,
                    contract_id: contractId,
                    subscribe: 1,
                })
                .catch(() => {
                    unsubMsg?.();
                });
        } catch {
            unsubMsg?.();
        }
    }

    return {
        contractId,
        buyPrice,
        payout,
        longcode: resolvedLongcode,
    };
}
