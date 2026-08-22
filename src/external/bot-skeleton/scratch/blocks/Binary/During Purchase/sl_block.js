import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.sl_block = {
    init() {
        this.jsonInit({
            message0: localize('Stop Loss Reached'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special2.colour,
            colourSecondary: window.Blockly.Colours.Special2.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special2.colourTertiary,
            tooltip: localize('Triggered when stop loss is reached during purchase'),
            category: window.Blockly.Categories.During_Purchase,
        });
        this.setNextStatement(false);
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.sl_block = () => {
    return 'Bot.stop();\n';
};
