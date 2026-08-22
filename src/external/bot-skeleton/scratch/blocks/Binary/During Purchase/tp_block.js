import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.tp_block = {
    init() {
        this.jsonInit({
            message0: localize('Take Profit Reached'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Triggered when take profit is reached during purchase'),
            category: window.Blockly.Categories.During_Purchase,
        });
        this.setNextStatement(false);
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.tp_block = () => {
    return 'Bot.stop();\n';
};
