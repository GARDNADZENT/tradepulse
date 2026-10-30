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
