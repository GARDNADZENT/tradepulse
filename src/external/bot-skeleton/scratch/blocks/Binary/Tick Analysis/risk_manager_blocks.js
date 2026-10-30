import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

const getGenerator = () => window.Blockly.JavaScript.javascriptGenerator;

// 1. Virtual Hook: Streak Trigger (checks whether recent N virtual ticks failed condition so real entry can trigger)
window.Blockly.Blocks.vh_virtual_streak_ready = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Virtual Hook Ready: last %1 digits all %2 %3'),
            args0: [
                {
                    type: 'field_number',
                    name: 'STREAK',
                    value: 2,
                    min: 1,
                    max: 20,
                    precision: 1,
                },
                {
                    type: 'field_dropdown',
                    name: 'CONDITION',
                    options: [
                        [localize('<= (Under/Equal)'), 'LTE'],
                        [localize('>= (Over/Equal)'), 'GTE'],
                        [localize('Even'), 'EVEN'],
                        [localize('Odd'), 'ODD'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'BARRIER',
                    value: 2,
                    min: 0,
                    max: 9,
                    precision: 1,
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns true when the last N digits match the virtual loss streak condition'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Virtual Hook Streak Trigger'),
            description: localize('Waits for N consecutive virtual losses before triggering a real-stake entry.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.vh_virtual_streak_ready = block => {
    const streak = Math.max(1, Number(block.getFieldValue('STREAK')) || 2);
    const cond = block.getFieldValue('CONDITION') || 'LTE';
    const barrier = Number(block.getFieldValue('BARRIER')) || 0;

    const code =
        '(function(){var l=Bot.getLastDigitList();if(!l||l.length<' +
        streak +
        '){return false;}for(var i=l.length-' +
        streak +
        ';i<l.length;i++){var d=Number(l[i]);' +
        (cond === 'LTE'
            ? 'if(!(d<=' + barrier + '))return false;'
            : cond === 'GTE'
              ? 'if(!(d>=' + barrier + '))return false;'
              : cond === 'EVEN'
                ? 'if(d%2!==0)return false;'
                : 'if(d%2===0)return false;') +
        '}return true;})()';

    return [code, getGenerator().ORDER_ATOMIC];
};

// 2. Virtual Hook: Stake Router (routes Real Stake when hook triggered, else Virtual Min Stake)
window.Blockly.Blocks.vh_stake_router = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Virtual Hook Stake: Real $ %1 | Virtual $ %2 when %3'),
            args0: [
                {
                    type: 'field_number',
                    name: 'REAL_STAKE',
                    value: 2,
                    min: 0.35,
                    precision: 0.01,
                },
                {
                    type: 'field_number',
                    name: 'VIRTUAL_STAKE',
                    value: 0.35,
                    min: 0.35,
                    precision: 0.01,
                },
                {
                    type: 'input_value',
                    name: 'HOOK_READY',
                    check: 'Boolean',
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Outputs Real Stake when Virtual Hook condition is true, otherwise Virtual Stake'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Virtual Hook Stake Router'),
            description: localize('Switches between minimal probe stake and full real entry stake.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.vh_stake_router = block => {
    const realStake = Number(block.getFieldValue('REAL_STAKE')) || 1;
    const virtualStake = Number(block.getFieldValue('VIRTUAL_STAKE')) || 0.35;
    const cond = getGenerator().valueToCode(block, 'HOOK_READY', getGenerator().ORDER_NONE) || 'false';
    const code = '((' + cond + ') ? ' + realStake + ' : ' + virtualStake + ')';
    return [code, getGenerator().ORDER_CONDITIONAL];
};

// 3. Analysis Logics: Even / Odd Majority Percentage Check
window.Blockly.Blocks.al_parity_majority = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last %1 ticks %2 rate >= %3 %'),
            args0: [
                {
                    type: 'field_number',
                    name: 'WINDOW',
                    value: 50,
                    min: 5,
                    max: 1000,
                    precision: 1,
                },
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('Even'), 'EVEN'],
                        [localize('Odd'), 'ODD'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'THRESHOLD',
                    value: 56,
                    min: 1,
                    max: 100,
                    precision: 1,
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Checks if Even or Odd digit percentage over the last N ticks meets threshold'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Parity Percentage Filter'),
            description: localize('Evaluates Even/Odd dominance over a sliding tick window.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.al_parity_majority = block => {
    const win = Math.max(5, Number(block.getFieldValue('WINDOW')) || 50);
    const parity = block.getFieldValue('PARITY') || 'EVEN';
    const threshold = Number(block.getFieldValue('THRESHOLD')) || 55;
    const rem = parity === 'EVEN' ? '0' : '1';

    const code =
        '(function(){var l=Bot.getLastDigitList();if(!l||!l.length){return false;}var s=l.slice(-' +
        win +
        ');var c=0;for(var i=0;i<s.length;i++){if(Math.abs(Number(s[i]))%2===' +
        rem +
        ')c++;}return ((c/s.length)*100)>=' +
        threshold +
        ';})()';

    return [code, getGenerator().ORDER_ATOMIC];
};

// 4. Analysis Logics: Over / Under Dominance Check
window.Blockly.Blocks.al_over_under_majority = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last %1 ticks %2 digit %3 >= %4 %'),
            args0: [
                {
                    type: 'field_number',
                    name: 'WINDOW',
                    value: 50,
                    min: 5,
                    max: 1000,
                    precision: 1,
                },
                {
                    type: 'field_dropdown',
                    name: 'DIR',
                    options: [
                        [localize('Over (>)'), 'OVER'],
                        [localize('Under (<)'), 'UNDER'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'BARRIER',
                    value: 4,
                    min: 0,
                    max: 9,
                    precision: 1,
                },
                {
                    type: 'field_number',
                    name: 'THRESHOLD',
                    value: 55,
                    min: 1,
                    max: 100,
                    precision: 1,
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Checks if Over or Under barrier percentage over last N ticks meets threshold'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Over/Under Dominance Filter'),
            description: localize('Evaluates Over/Under barrier frequency across recent ticks.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.al_over_under_majority = block => {
    const win = Math.max(5, Number(block.getFieldValue('WINDOW')) || 50);
    const dir = block.getFieldValue('DIR') || 'OVER';
    const barrier = Number(block.getFieldValue('BARRIER')) || 4;
    const threshold = Number(block.getFieldValue('THRESHOLD')) || 55;
    const op = dir === 'OVER' ? '>' : '<';

    const code =
        '(function(){var l=Bot.getLastDigitList();if(!l||!l.length){return false;}var s=l.slice(-' +
        win +
        ');var c=0;for(var i=0;i<s.length;i++){if(Number(s[i])' +
        op +
        barrier +
        ')c++;}return ((c/s.length)*100)>=' +
        threshold +
        ';})()';

    return [code, getGenerator().ORDER_ATOMIC];
};

// 5. Analysis Logics: Hottest or Coldest Digit (0–9)
window.Blockly.Blocks.al_extreme_digit = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('%1 digit in last %2 ticks'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'MODE',
                    options: [
                        [localize('Hottest (Most Frequent)'), 'HOT'],
                        [localize('Coldest (Least Frequent)'), 'COLD'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'WINDOW',
                    value: 100,
                    min: 10,
                    max: 1000,
                    precision: 1,
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the most or least frequent digit (0–9) across the last N ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Hottest / Coldest Digit'),
            description: localize('Outputs the statistical hottest or coldest digit (0–9) for dynamic barriers.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.al_extreme_digit = block => {
    const mode = block.getFieldValue('MODE') || 'HOT';
    const win = Math.max(10, Number(block.getFieldValue('WINDOW')) || 100);
    const cmp = mode === 'HOT' ? '>' : '<';

    const code =
        '(function(){var l=Bot.getLastDigitList();if(!l||!l.length){return 0;}var s=l.slice(-' +
        win +
        ');var f=[0,0,0,0,0,0,0,0,0,0];for(var i=0;i<s.length;i++){var d=Number(s[i]);if(d>=0&&d<=9)f[d]++;}var b=0;for(var k=1;k<10;k++){if(f[k]' +
        cmp +
        'f[b])b=k;}return b;})()';

    return [code, getGenerator().ORDER_ATOMIC];
};

// 6. Compatibility Block: digit_frequency_analysis (used by 2026 Turbo & Special Bots)
window.Blockly.Blocks.digit_frequency_analysis = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Digit Frequency (%1) in last %2 ticks'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'ANALYSIS_TYPE',
                    options: [
                        [localize('Most Frequent'), 'MOST_FREQUENT'],
                        [localize('2nd Most Frequent'), 'SECOND_MOST_FREQUENT'],
                        [localize('Least Frequent'), 'LEAST_FREQUENT'],
                        [localize('2nd Least Frequent'), 'SECOND_LEAST_FREQUENT'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'N',
                    check: 'Number',
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns ranked digit (0–9) by frequency across the last N ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.digit_frequency_analysis = block => {
    const analysisType = block.getFieldValue('ANALYSIS_TYPE') || 'MOST_FREQUENT';
    const nExpr = getGenerator().valueToCode(block, 'N', getGenerator().ORDER_ATOMIC) || '1000';
    let rankIdx = 0;
    let desc = 'true';
    if (analysisType === 'SECOND_MOST_FREQUENT') {
        rankIdx = 1;
        desc = 'true';
    } else if (analysisType === 'LEAST_FREQUENT') {
        rankIdx = 0;
        desc = 'false';
    } else if (analysisType === 'SECOND_LEAST_FREQUENT') {
        rankIdx = 1;
        desc = 'false';
    }

    const code =
        '(function(){var l=Bot.getLastDigitList();if(!l||!l.length){return 0;}var n=Math.max(1,Number(' +
        nExpr +
        ')||100);var s=l.slice(-n);var f=[0,0,0,0,0,0,0,0,0,0];for(var i=0;i<s.length;i++){var d=Number(s[i]);if(d>=0&&d<=9)f[d]++;}var a=[0,1,2,3,4,5,6,7,8,9];a.sort(function(x,y){return ' +
        (desc === 'true' ? 'f[y]-f[x]' : 'f[x]-f[y]') +
        ';});return a[' +
        rankIdx +
        '];})()';

    return [code, getGenerator().ORDER_ATOMIC];
};

// 7. Compatibility Block: set_tp (Target Profit Reached statement block)
window.Blockly.Blocks.set_tp = {
    init() {
        this.jsonInit({
            message0: localize('Target Profit Reached (Stop Session)'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special3.colour,
            colourSecondary: window.Blockly.Colours.Special3.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special3.colourTertiary,
            tooltip: localize('Logs session take-profit completion'),
            category: window.Blockly.Categories.After_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.set_tp = () =>
    "Bot.notify({ className: 'success', message: 'Target Profit Reached!', sound: 'silent' });\n";

// 8. Compatibility Block: btnotify (Custom notification block used in Simba AI & Wealth Generator)
window.Blockly.Blocks.btnotify = {
    init() {
        this.jsonInit({
            message0: localize('Notify %1 with sound %2: %3'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'NOTIFICATION_TYPE',
                    options: [
                        [localize('Success'), 'success'],
                        [localize('Info'), 'info'],
                        [localize('Warning'), 'warn'],
                        [localize('Error'), 'error'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'NOTIFICATION_SOUND',
                    options: [
                        [localize('Silent'), 'silent'],
                        [localize('Announcement'), 'announcement'],
                        [localize('Earned money'), 'earned-money'],
                        [localize('Job done'), 'job-done'],
                        [localize('Error'), 'error'],
                        [localize('Severe error'), 'severe-error'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'MESSAGE',
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special3.colour,
            colourSecondary: window.Blockly.Colours.Special3.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special3.colourTertiary,
            tooltip: localize('Displays a notification in the journal/toast'),
            category: window.Blockly.Categories.Tools,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.btnotify = block => {
    const notificationType = block.getFieldValue('NOTIFICATION_TYPE') || 'info';
    const sound = block.getFieldValue('NOTIFICATION_SOUND') || 'silent';
    const message = getGenerator().valueToCode(block, 'MESSAGE', getGenerator().ORDER_NONE) || "''";
    return `Bot.notify({ className: '${notificationType}', message: ${message}, sound: '${sound}' });\n`;
};

// 9. Compatibility Block: active_symbol_changer (Market rotation block used in Simba AI v1)
window.Blockly.Blocks.active_symbol_changer = {
    init() {
        this.jsonInit({
            message0: localize('Active Symbol Changer: %1'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'SYMBOL_ACTIVE_TYPE',
                    options: [
                        ['Disable', 'disable'],
                        ['Volatility 10 Index', 'R_10'],
                        ['Volatility 10 (1s) Index', '1HZ10V'],
                        ['Volatility 15 (1s) Index', '1HZ15V'],
                        ['Volatility 25 Index', 'R_25'],
                        ['Volatility 25 (1s) Index', '1HZ25V'],
                        ['Volatility 30 (1s) Index', '1HZ30V'],
                        ['Volatility 50 Index', 'R_50'],
                        ['Volatility 50 (1s) Index', '1HZ50V'],
                        ['Volatility 75 Index', 'R_75'],
                        ['Volatility 75 (1s) Index', '1HZ75V'],
                        ['Volatility 90 (1s) Index', '1HZ90V'],
                        ['Volatility 100 Index', 'R_100'],
                        ['Volatility 100 (1s) Index', '1HZ100V'],
                        ['Jump 10 Index', 'JD10'],
                        ['Jump 25 Index', 'JD25'],
                        ['Jump 50 Index', 'JD50'],
                        ['Jump 75 Index', 'JD75'],
                        ['Jump 100 Index', 'JD100'],
                        ['Bull Market Index', 'RDBULL'],
                        ['Bear Market Index', 'RDBEAR'],
                    ],
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special2.colour,
            colourSecondary: window.Blockly.Colours.Special2.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special2.colourTertiary,
            tooltip: localize('Selects active synthetic symbol for multi-market strategies'),
            category: window.Blockly.Categories.After_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

getGenerator().forBlock.active_symbol_changer = () => '';

