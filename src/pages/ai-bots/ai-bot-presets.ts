export type RiskManagerAIBotId =
    | 'even-odd-ai'
    | 'over4-under5-ai'
    | 'rise-fall-ai'
    | 'over2-rec-evenodd'
    | 'over2-rec-range'
    | 'under7-rec-evenodd'
    | 'under7-rec-range';

export type AIBotAccentTheme = 'blue' | 'teal' | 'purple' | 'amber' | 'pink';

export interface RiskManagerAIBotCard {
    id: RiskManagerAIBotId;
    number: string;
    title: string;
    description: string;
    accent: AIBotAccentTheme;
    defaultEntryCount: number;
    defaultRecoveryCount: number;
    hasRecovery: boolean;
}

export interface AIScannerMarketDef {
    symbol: string;
    label: string;
}

export const AI_SCANNER_MARKETS: AIScannerMarketDef[] = [
    { symbol: 'R_10', label: 'Volatility 10 Index' },
    { symbol: 'R_25', label: 'Volatility 25 Index' },
    { symbol: 'R_50', label: 'Volatility 50 Index' },
    { symbol: 'R_75', label: 'Volatility 75 Index' },
    { symbol: 'R_100', label: 'Volatility 100 Index' },
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

export type AIScannerContractType =
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'CALL'
    | 'PUT';

export interface AIScannerRowEvaluation {
    matched: boolean;
    contractType?: AIScannerContractType;
    barrier?: number;
    actionLabel: string;
    subLabel: string;
    recentDigits: number[];
    checkedCount: number;
    requiredCount: number;
}

export function extractLastDigit(price: number, pipSize = 2): number {
    const fixed = Math.abs(Number(price) || 0).toFixed(Math.max(0, pipSize));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
}

export function evaluateAIScannerMarket(params: {
    botId: RiskManagerAIBotId;
    rawTicks: { t: number; price: number }[];
    pipSize: number;
    entryCount: number;
    recoveryCount?: number;
    inRecovery?: boolean;
}): AIScannerRowEvaluation {
    const { botId, rawTicks, pipSize } = params;
    const inRecovery = Boolean(params.inRecovery);
    const safeEntry = Math.max(1, Math.min(10, Math.round(Number(params.entryCount) || 5)));
    const safeRecovery = Math.max(1, Math.min(10, Math.round(Number(params.recoveryCount) || 3)));

    const isRecoveryCapable =
        botId === 'over2-rec-evenodd' ||
        botId === 'over2-rec-range' ||
        botId === 'under7-rec-evenodd' ||
        botId === 'under7-rec-range';
    const activeStage = isRecoveryCapable && inRecovery ? 'Recovery' : 'Initial';
    const requiredCount = activeStage === 'Recovery' ? safeRecovery : safeEntry;

    if (botId === 'rise-fall-ai') {
        const minTicksNeeded = requiredCount + 1;
        const tail = rawTicks.slice(-minTicksNeeded);
        const recentDigits = rawTicks
            .slice(-requiredCount)
            .map(tk => extractLastDigit(tk.price, pipSize));
        const checkedMoves = Math.max(0, tail.length - 1);

        if (tail.length >= minTicksNeeded) {
            let allRising = true;
            let allFalling = true;
            for (let i = 1; i < tail.length; i++) {
                if (!(tail[i].price > tail[i - 1].price)) allRising = false;
                if (!(tail[i].price < tail[i - 1].price)) allFalling = false;
            }
            if (allRising) {
                return {
                    matched: true,
                    contractType: 'PUT',
                    actionLabel: 'Trade Fall',
                    subLabel: `Last ${requiredCount} ticks matched`,
                    recentDigits,
                    checkedCount: requiredCount,
                    requiredCount,
                };
            }
            if (allFalling) {
                return {
                    matched: true,
                    contractType: 'CALL',
                    actionLabel: 'Trade Rise',
                    subLabel: `Last ${requiredCount} ticks matched`,
                    recentDigits,
                    checkedCount: requiredCount,
                    requiredCount,
                };
            }
        }

        return {
            matched: false,
            actionLabel: 'Scanning',
            subLabel: `${activeStage} · ${Math.min(checkedMoves, requiredCount)}/${requiredCount} checked`,
            recentDigits,
            checkedCount: Math.min(checkedMoves, requiredCount),
            requiredCount,
        };
    }

    const recentDigits = rawTicks
        .slice(-requiredCount)
        .map(tk => extractLastDigit(tk.price, pipSize));
    const checkedCount = recentDigits.length;

    const evalEvenOdd = (): AIScannerRowEvaluation | null => {
        if (checkedCount < requiredCount) return null;
        if (recentDigits.every(d => d % 2 === 0)) {
            return {
                matched: true,
                contractType: 'DIGITODD',
                actionLabel: 'Trade Odd',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
        if (recentDigits.every(d => d % 2 !== 0)) {
            return {
                matched: true,
                contractType: 'DIGITEVEN',
                actionLabel: 'Trade Even',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
        return null;
    };

    const evalRange45 = (): AIScannerRowEvaluation | null => {
        if (checkedCount < requiredCount) return null;
        if (recentDigits.every(d => d < 4)) {
            return {
                matched: true,
                contractType: 'DIGITOVER',
                barrier: 4,
                actionLabel: 'Trade Over 4',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
        if (recentDigits.every(d => d > 5)) {
            return {
                matched: true,
                contractType: 'DIGITUNDER',
                barrier: 5,
                actionLabel: 'Trade Under 5',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
        return null;
    };

    let hit: AIScannerRowEvaluation | null = null;

    if (botId === 'even-odd-ai') {
        hit = evalEvenOdd();
    } else if (botId === 'over4-under5-ai') {
        hit = evalRange45();
    } else if (botId === 'over2-rec-evenodd') {
        if (activeStage === 'Recovery') {
            hit = evalEvenOdd();
        } else if (checkedCount >= requiredCount && recentDigits.every(d => d < 2)) {
            hit = {
                matched: true,
                contractType: 'DIGITOVER',
                barrier: 2,
                actionLabel: 'Trade Over 2',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
    } else if (botId === 'over2-rec-range') {
        if (activeStage === 'Recovery') {
            hit = evalRange45();
        } else if (checkedCount >= requiredCount && recentDigits.every(d => d < 2)) {
            hit = {
                matched: true,
                contractType: 'DIGITOVER',
                barrier: 2,
                actionLabel: 'Trade Over 2',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
    } else if (botId === 'under7-rec-evenodd') {
        if (activeStage === 'Recovery') {
            hit = evalEvenOdd();
        } else if (checkedCount >= requiredCount && recentDigits.every(d => d > 7)) {
            hit = {
                matched: true,
                contractType: 'DIGITUNDER',
                barrier: 7,
                actionLabel: 'Trade Under 7',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
    } else if (botId === 'under7-rec-range') {
        if (activeStage === 'Recovery') {
            hit = evalRange45();
        } else if (checkedCount >= requiredCount && recentDigits.every(d => d > 7)) {
            hit = {
                matched: true,
                contractType: 'DIGITUNDER',
                barrier: 7,
                actionLabel: 'Trade Under 7',
                subLabel: `Last ${requiredCount} ticks matched`,
                recentDigits,
                checkedCount,
                requiredCount,
            };
        }
    }

    if (hit) return hit;

    return {
        matched: false,
        actionLabel: 'Scanning',
        subLabel: `${activeStage} · ${checkedCount}/${requiredCount} checked`,
        recentDigits,
        checkedCount,
        requiredCount,
    };
}

export const RISK_MANAGER_AI_BOTS: RiskManagerAIBotCard[] = [
    {
        id: 'even-odd-ai',
        number: '01',
        title: 'Even–Odd AI',
        description: 'All Even digits trigger Odd. All Odd digits trigger Even.',
        accent: 'blue',
        defaultEntryCount: 5,
        defaultRecoveryCount: 3,
        hasRecovery: false,
    },
    {
        id: 'over4-under5-ai',
        number: '02',
        title: 'Over 4–Under 5 AI',
        description: 'Digits below 4 trigger Over 4. Digits above 5 trigger Under 5.',
        accent: 'teal',
        defaultEntryCount: 3,
        defaultRecoveryCount: 2,
        hasRecovery: false,
    },
    {
        id: 'rise-fall-ai',
        number: '03',
        title: 'Rise–Fall AI',
        description: 'A rising run triggers Fall. A falling run triggers Rise.',
        accent: 'purple',
        defaultEntryCount: 4,
        defaultRecoveryCount: 3,
        hasRecovery: false,
    },
    {
        id: 'over2-rec-evenodd',
        number: '04',
        title: 'Over 2 Recovery → Even–Odd',
        description: 'The selected digit count below 2 triggers Over 2, followed by Even–Odd recovery after a loss.',
        accent: 'amber',
        defaultEntryCount: 2,
        defaultRecoveryCount: 3,
        hasRecovery: true,
    },
    {
        id: 'over2-rec-range',
        number: '05',
        title: 'Over 2 Recovery → Over 4–Under 5',
        description: 'The selected digit count below 2 triggers Over 2, followed by range recovery after a loss.',
        accent: 'amber',
        defaultEntryCount: 2,
        defaultRecoveryCount: 2,
        hasRecovery: true,
    },
    {
        id: 'under7-rec-evenodd',
        number: '06',
        title: 'Under 7 Recovery → Even–Odd',
        description: 'The selected digit count above 7 triggers Under 7, followed by Even–Odd recovery after a loss.',
        accent: 'pink',
        defaultEntryCount: 2,
        defaultRecoveryCount: 3,
        hasRecovery: true,
    },
    {
        id: 'under7-rec-range',
        number: '07',
        title: 'Under 7 Recovery → Over 4–Under 5',
        description: 'The selected digit count above 7 triggers Under 7, followed by range recovery after a loss.',
        accent: 'pink',
        defaultEntryCount: 2,
        defaultRecoveryCount: 2,
        hasRecovery: true,
    },
];

interface InternalPresetXmlConfig {
    symbol: string;
    tradeCat: 'digits' | 'callput';
    tradeType: 'evenodd' | 'overunder' | 'callput';
    hasPrediction: boolean;
    defaultPrediction?: number;
    baseStake: number;
    martingale: number;
    takeProfit: number;
    stopLoss: number;
    countVarLabel: string;
    defaultCount: number;
    hasRecoveryMode: boolean;
    defaultRecoveryCount?: number;
    beforePurchaseXml: string;
}

const buildEvenOddTriggerXml = (countVarId: string, countVarName: string, idPrefix: string): string => `
      <block type="controls_if" id="${idPrefix}_eo_if">
        <mutation elseif="1"></mutation>
        <value name="IF0">
          <block type="last_digits_condition" id="${idPrefix}_cond_even">
            <field name="CONDITION">ALL_EVEN</field>
            <value name="N">
              <shadow type="math_number" id="${idPrefix}_sh_n1"><field name="NUM">3</field></shadow>
              <block type="variables_get" id="${idPrefix}_get_n1">
                <field name="VAR" id="${countVarId}">${countVarName}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="apollo_purchase2" id="${idPrefix}_buy_odd">
            <field name="PURCHASE_LIST">DIGITODD</field>
          </block>
        </statement>
        <value name="IF1">
          <block type="last_digits_condition" id="${idPrefix}_cond_odd">
            <field name="CONDITION">ALL_ODD</field>
            <value name="N">
              <shadow type="math_number" id="${idPrefix}_sh_n2"><field name="NUM">3</field></shadow>
              <block type="variables_get" id="${idPrefix}_get_n2">
                <field name="VAR" id="${countVarId}">${countVarName}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO1">
          <block type="apollo_purchase2" id="${idPrefix}_buy_even">
            <field name="PURCHASE_LIST">DIGITEVEN</field>
          </block>
        </statement>
      </block>`;

const buildRange45TriggerXml = (countVarId: string, countVarName: string, idPrefix: string): string => `
      <block type="controls_if" id="${idPrefix}_r45_if">
        <mutation elseif="1"></mutation>
        <value name="IF0">
          <block type="ai_digits_threshold" id="${idPrefix}_lt4">
            <field name="OP">LT</field>
            <field name="BARRIER">4</field>
            <value name="N">
              <shadow type="math_number" id="${idPrefix}_sh_r1"><field name="NUM">2</field></shadow>
              <block type="variables_get" id="${idPrefix}_get_r1">
                <field name="VAR" id="${countVarId}">${countVarName}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="variables_set" id="${idPrefix}_set_p4">
            <field name="VAR" id="var_prediction">Prediction</field>
            <value name="VALUE">
              <block type="math_number" id="${idPrefix}_num_p4"><field name="NUM">4</field></block>
            </value>
            <next>
              <block type="ai_purchase_barrier" id="${idPrefix}_buy_o4">
                <field name="PURCHASE_LIST">DIGITOVER</field>
                <value name="PREDICTION">
                  <shadow type="math_number" id="${idPrefix}_sh_p4"><field name="NUM">4</field></shadow>
                  <block type="math_number" id="${idPrefix}_val_p4"><field name="NUM">4</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
        <value name="IF1">
          <block type="ai_digits_threshold" id="${idPrefix}_gt5">
            <field name="OP">GT</field>
            <field name="BARRIER">5</field>
            <value name="N">
              <shadow type="math_number" id="${idPrefix}_sh_r2"><field name="NUM">2</field></shadow>
              <block type="variables_get" id="${idPrefix}_get_r2">
                <field name="VAR" id="${countVarId}">${countVarName}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO1">
          <block type="variables_set" id="${idPrefix}_set_p5">
            <field name="VAR" id="var_prediction">Prediction</field>
            <value name="VALUE">
              <block type="math_number" id="${idPrefix}_num_p5"><field name="NUM">5</field></block>
            </value>
            <next>
              <block type="ai_purchase_barrier" id="${idPrefix}_buy_u5">
                <field name="PURCHASE_LIST">DIGITUNDER</field>
                <value name="PREDICTION">
                  <shadow type="math_number" id="${idPrefix}_sh_p5"><field name="NUM">5</field></shadow>
                  <block type="math_number" id="${idPrefix}_val_p5"><field name="NUM">5</field></block>
                </value>
              </block>
            </next>
          </block>
        </statement>
      </block>`;

const buildPrimaryBarrierEntryXml = (opts: {
    op: 'LT' | 'GT';
    barrier: number;
    purchaseType: 'DIGITOVER' | 'DIGITUNDER';
    recoveryStackXml: string;
}): string => `
      <block type="controls_if" id="bp_mode_router">
        <mutation else="1"></mutation>
        <value name="IF0">
          <block type="logic_compare" id="bp_chk_norm">
            <field name="OP">EQ</field>
            <value name="A">
              <block type="variables_get" id="bp_get_rec">
                <field name="VAR" id="var_recovery_mode">Recovery Mode</field>
              </block>
            </value>
            <value name="B">
              <block type="logic_boolean" id="bp_bool_false">
                <field name="BOOL">FALSE</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="controls_if" id="bp_entry_if">
            <value name="IF0">
              <block type="ai_digits_threshold" id="bp_entry_cond">
                <field name="OP">${opts.op}</field>
                <field name="BARRIER">${opts.barrier}</field>
                <value name="N">
                  <shadow type="math_number" id="bp_sh_cnt"><field name="NUM">2</field></shadow>
                  <block type="variables_get" id="bp_get_cnt">
                    <field name="VAR" id="var_digit_count">Selected Digit Count</field>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="variables_set" id="bp_set_ep">
                <field name="VAR" id="var_prediction">Prediction</field>
                <value name="VALUE">
                  <block type="math_number" id="bp_num_ep"><field name="NUM">${opts.barrier}</field></block>
                </value>
                <next>
                  <block type="ai_purchase_barrier" id="bp_buy_primary">
                    <field name="PURCHASE_LIST">${opts.purchaseType}</field>
                    <value name="PREDICTION">
                      <shadow type="math_number" id="bp_sh_ep"><field name="NUM">${opts.barrier}</field></shadow>
                      <block type="math_number" id="bp_val_ep"><field name="NUM">${opts.barrier}</field></block>
                    </value>
                  </block>
                </next>
              </block>
            </statement>
          </block>
        </statement>
        <statement name="ELSE">
          ${opts.recoveryStackXml}
        </statement>
      </block>`;

export function buildRiskManagerAIBotXml(botId: RiskManagerAIBotId): string {
    let cfg: InternalPresetXmlConfig;

    switch (botId) {
        case 'even-odd-ai':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'evenodd',
                hasPrediction: false,
                baseStake: 1,
                martingale: 2,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 3,
                hasRecoveryMode: false,
                beforePurchaseXml: buildEvenOddTriggerXml('var_digit_count', 'Selected Digit Count', 'eo'),
            };
            break;

        case 'over4-under5-ai':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'overunder',
                hasPrediction: true,
                defaultPrediction: 4,
                baseStake: 1,
                martingale: 2.2,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 2,
                hasRecoveryMode: false,
                beforePurchaseXml: buildRange45TriggerXml('var_digit_count', 'Selected Digit Count', 'ou45'),
            };
            break;

        case 'rise-fall-ai':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'callput',
                tradeType: 'callput',
                hasPrediction: false,
                baseStake: 1,
                martingale: 2.1,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Run Length',
                defaultCount: 3,
                hasRecoveryMode: false,
                beforePurchaseXml: `
      <block type="controls_if" id="rf_if">
        <mutation elseif="1"></mutation>
        <value name="IF0">
          <block type="ai_tick_run_direction" id="rf_cond_rise">
            <field name="DIR">RISE</field>
            <value name="N">
              <shadow type="math_number" id="rf_sh_n1"><field name="NUM">3</field></shadow>
              <block type="variables_get" id="rf_get_n1">
                <field name="VAR" id="var_digit_count">Run Length</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="apollo_purchase2" id="rf_buy_fall">
            <field name="PURCHASE_LIST">PUT</field>
          </block>
        </statement>
        <value name="IF1">
          <block type="ai_tick_run_direction" id="rf_cond_fall">
            <field name="DIR">FALL</field>
            <value name="N">
              <shadow type="math_number" id="rf_sh_n2"><field name="NUM">3</field></shadow>
              <block type="variables_get" id="rf_get_n2">
                <field name="VAR" id="var_digit_count">Run Length</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO1">
          <block type="apollo_purchase2" id="rf_buy_rise">
            <field name="PURCHASE_LIST">CALL</field>
          </block>
        </statement>
      </block>`,
            };
            break;

        case 'over2-rec-evenodd':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'overunder',
                hasPrediction: true,
                defaultPrediction: 2,
                baseStake: 1,
                martingale: 2.1,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 2,
                hasRecoveryMode: true,
                defaultRecoveryCount: 3,
                beforePurchaseXml: buildPrimaryBarrierEntryXml({
                    op: 'LT',
                    barrier: 2,
                    purchaseType: 'DIGITOVER',
                    recoveryStackXml: buildEvenOddTriggerXml('var_rec_count', 'Recovery Digit Count', 'rec_eo'),
                }),
            };
            break;

        case 'over2-rec-range':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'overunder',
                hasPrediction: true,
                defaultPrediction: 2,
                baseStake: 1,
                martingale: 2.2,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 2,
                hasRecoveryMode: true,
                defaultRecoveryCount: 2,
                beforePurchaseXml: buildPrimaryBarrierEntryXml({
                    op: 'LT',
                    barrier: 2,
                    purchaseType: 'DIGITOVER',
                    recoveryStackXml: buildRange45TriggerXml('var_rec_count', 'Recovery Digit Count', 'rec_r45'),
                }),
            };
            break;

        case 'under7-rec-evenodd':
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'overunder',
                hasPrediction: true,
                defaultPrediction: 7,
                baseStake: 1,
                martingale: 2.1,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 2,
                hasRecoveryMode: true,
                defaultRecoveryCount: 3,
                beforePurchaseXml: buildPrimaryBarrierEntryXml({
                    op: 'GT',
                    barrier: 7,
                    purchaseType: 'DIGITUNDER',
                    recoveryStackXml: buildEvenOddTriggerXml('var_rec_count', 'Recovery Digit Count', 'rec_eo'),
                }),
            };
            break;

        case 'under7-rec-range':
        default:
            cfg = {
                symbol: '1HZ10V',
                tradeCat: 'digits',
                tradeType: 'overunder',
                hasPrediction: true,
                defaultPrediction: 7,
                baseStake: 1,
                martingale: 2.2,
                takeProfit: 10,
                stopLoss: 30,
                countVarLabel: 'Selected Digit Count',
                defaultCount: 2,
                hasRecoveryMode: true,
                defaultRecoveryCount: 2,
                beforePurchaseXml: buildPrimaryBarrierEntryXml({
                    op: 'GT',
                    barrier: 7,
                    purchaseType: 'DIGITUNDER',
                    recoveryStackXml: buildRange45TriggerXml('var_rec_count', 'Recovery Digit Count', 'rec_r45'),
                }),
            };
            break;
    }

    const extraVariablesXml = [
        cfg.hasPrediction ? '<variable id="var_prediction">Prediction</variable>' : '',
        cfg.hasRecoveryMode ? '<variable id="var_recovery_mode">Recovery Mode</variable>' : '',
        cfg.hasRecoveryMode ? '<variable id="var_rec_count">Recovery Digit Count</variable>' : '',
    ]
        .filter(Boolean)
        .join('\n    ');

    const vhTailXml = `<block type="virtual_hook_config" id="init_vh">
        <field name="VH_ENABLED">DISABLED</field>
        <field name="START_MODE">virtual</field>
        <value name="ENTER_AFTER_LOSSES">
          <block type="math_number" id="vh_losses"><field name="NUM">2</field></block>
        </value>
        <value name="RETURN_AFTER_WINS">
          <block type="math_number" id="vh_wins"><field name="NUM">1</field></block>
        </value>
      </block>`;

    let tailChainXml = vhTailXml;

    if (cfg.hasRecoveryMode) {
        tailChainXml = `<block type="variables_set" id="init_rec_mode">
          <field name="VAR" id="var_recovery_mode">Recovery Mode</field>
          <value name="VALUE">
            <block type="logic_boolean" id="init_rec_false"><field name="BOOL">FALSE</field></block>
          </value>
          <next>
            <block type="variables_set" id="init_rec_cnt">
              <field name="VAR" id="var_rec_count">Recovery Digit Count</field>
              <value name="VALUE">
                <block type="math_number" id="init_rec_cnt_num"><field name="NUM">${cfg.defaultRecoveryCount ?? 2}</field></block>
              </value>
              <next>
                ${tailChainXml}
              </next>
            </block>
          </next>
        </block>`;
    }

    if (cfg.hasPrediction) {
        tailChainXml = `<block type="variables_set" id="init_pred">
          <field name="VAR" id="var_prediction">Prediction</field>
          <value name="VALUE">
            <block type="math_number" id="init_pred_num"><field name="NUM">${cfg.defaultPrediction ?? 4}</field></block>
          </value>
          <next>
            ${tailChainXml}
          </next>
        </block>`;
    }

    const predictionOptionXml = cfg.hasPrediction
        ? `<value name="PREDICTION">
          <shadow type="math_number_positive" id="shad_pred" inline="true">
            <field name="NUM">${cfg.defaultPrediction ?? 4}</field>
          </shadow>
          <block type="variables_get" id="opt_get_pred">
            <field name="VAR" id="var_prediction">Prediction</field>
          </block>
        </value>`
        : '';

    const winResetChainXml = cfg.hasRecoveryMode
        ? `<block type="variables_set" id="win_rst_stake">
            <field name="VAR" id="var_stake">Stake</field>
            <value name="VALUE">
              <block type="variables_get" id="win_get_bs"><field name="VAR" id="var_base_stake">Base Stake</field></block>
            </value>
            <next>
              <block type="variables_set" id="win_rst_rec">
                <field name="VAR" id="var_recovery_mode">Recovery Mode</field>
                <value name="VALUE">
                  <block type="logic_boolean" id="win_bool_false"><field name="BOOL">FALSE</field></block>
                </value>
                ${
                    cfg.hasPrediction
                        ? `<next>
                  <block type="variables_set" id="win_rst_pred">
                    <field name="VAR" id="var_prediction">Prediction</field>
                    <value name="VALUE">
                      <block type="math_number" id="win_pred_num"><field name="NUM">${cfg.defaultPrediction ?? 4}</field></block>
                    </value>
                  </block>
                </next>`
                        : ''
                }
              </block>
            </next>
          </block>`
        : `<block type="variables_set" id="win_rst_stake">
            <field name="VAR" id="var_stake">Stake</field>
            <value name="VALUE">
              <block type="variables_get" id="win_get_bs"><field name="VAR" id="var_base_stake">Base Stake</field></block>
            </value>
          </block>`;

    const lossChainXml = cfg.hasRecoveryMode
        ? `<block type="variables_set" id="loss_set_stake">
            <field name="VAR" id="var_stake">Stake</field>
            <value name="VALUE">
              <block type="math_arithmetic" id="loss_mul">
                <field name="OP">MULTIPLY</field>
                <value name="A">
                  <block type="variables_get" id="loss_cur_s"><field name="VAR" id="var_stake">Stake</field></block>
                </value>
                <value name="B">
                  <block type="variables_get" id="loss_mg"><field name="VAR" id="var_martingale">Martingale</field></block>
                </value>
              </block>
            </value>
            <next>
              <block type="variables_set" id="loss_set_rec">
                <field name="VAR" id="var_recovery_mode">Recovery Mode</field>
                <value name="VALUE">
                  <block type="logic_boolean" id="loss_bool_true"><field name="BOOL">TRUE</field></block>
                </value>
              </block>
            </next>
          </block>`
        : `<block type="variables_set" id="loss_set_stake">
            <field name="VAR" id="var_stake">Stake</field>
            <value name="VALUE">
              <block type="math_arithmetic" id="loss_mul">
                <field name="OP">MULTIPLY</field>
                <value name="A">
                  <block type="variables_get" id="loss_cur_s"><field name="VAR" id="var_stake">Stake</field></block>
                </value>
                <value name="B">
                  <block type="variables_get" id="loss_mg"><field name="VAR" id="var_martingale">Martingale</field></block>
                </value>
              </block>
            </value>
          </block>`;

    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <variables>
    <variable id="var_base_stake">Base Stake</variable>
    <variable id="var_stake">Stake</variable>
    <variable id="var_digit_count">${cfg.countVarLabel}</variable>
    <variable id="var_martingale">Martingale</variable>
    <variable id="var_tp">Take Profit</variable>
    <variable id="var_sl">Stop Loss</variable>
    ${extraVariablesXml}
  </variables>
  <block type="trade_definition" id="td_root" deletable="false" x="0" y="40">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="td_market" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">${cfg.symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="td_tradetype" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">${cfg.tradeCat}</field>
            <field name="TRADETYPE_LIST">${cfg.tradeType}</field>
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
        <value name="VALUE"><block type="math_number" id="n_bs"><field name="NUM">${cfg.baseStake}</field></block></value>
        <next>
          <block type="variables_set" id="init_s">
            <field name="VAR" id="var_stake">Stake</field>
            <value name="VALUE"><block type="variables_get" id="g_bs"><field name="VAR" id="var_base_stake">Base Stake</field></block></value>
            <next>
              <block type="variables_set" id="init_cnt">
                <field name="VAR" id="var_digit_count">${cfg.countVarLabel}</field>
                <value name="VALUE"><block type="math_number" id="n_cnt"><field name="NUM">${cfg.defaultCount}</field></block></value>
                <next>
                  <block type="variables_set" id="init_mg">
                    <field name="VAR" id="var_martingale">Martingale</field>
                    <value name="VALUE"><block type="math_number" id="n_mg"><field name="NUM">${cfg.martingale}</field></block></value>
                    <next>
                      <block type="variables_set" id="init_tp">
                        <field name="VAR" id="var_tp">Take Profit</field>
                        <value name="VALUE"><block type="math_number" id="n_tp"><field name="NUM">${cfg.takeProfit}</field></block></value>
                        <next>
                          <block type="variables_set" id="init_sl">
                            <field name="VAR" id="var_sl">Stop Loss</field>
                            <value name="VALUE"><block type="math_number" id="n_sl"><field name="NUM">${cfg.stopLoss}</field></block></value>
                            <next>
                              ${tailChainXml}
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
        <mutation has_first_barrier="false" has_second_barrier="false" has_prediction="${cfg.hasPrediction ? 'true' : 'false'}"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION">
          <shadow type="math_number_positive" id="shad_dur"><field name="NUM">1</field></shadow>
        </value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="shad_amt"><field name="NUM">${cfg.baseStake}</field></shadow>
          <block type="variables_get" id="opt_get_stake"><field name="VAR" id="var_stake">Stake</field></block>
        </value>
        ${predictionOptionXml}
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="bp_root" deletable="false" x="0" y="760">
    <statement name="BEFOREPURCHASE_STACK">
      ${cfg.beforePurchaseXml}
    </statement>
  </block>
  <block type="during_purchase" id="dp_root" x="720" y="40">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if" id="dp_if">
        <value name="IF0"><block type="check_sell" id="dp_cs"></block></value>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="ap_root" x="720" y="240">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if" id="ap_wl">
        <mutation else="1"></mutation>
        <value name="IF0">
          <block type="contract_check_result" id="ap_win"><field name="CHECK_RESULT">win</field></block>
        </value>
        <statement name="DO0">
          ${winResetChainXml}
        </statement>
        <statement name="ELSE">
          ${lossChainXml}
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
