import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.last_digits_condition = {
    init() {
        this.jsonInit({
            message0: localize('Last %1 digits are %2', {
                '%1': '%1',
                '%2': '%2',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'N',
                    check: 'Number',
                },
                {
                    type: 'field_dropdown',
                    name: 'CONDITION',
                    options: [
                        ['ALL EVEN', 'ALL_EVEN'],
                        ['ALL ODD', 'ALL_ODD'],
                    ],
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Check if the last N digits are all even or all odd'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.last_digits_condition = () => {
    return ['false', window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
