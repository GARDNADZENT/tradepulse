import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.sl_block = {
    init() {
        this.jsonInit({
            message0: localize('Stop Loss Triggered'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Triggered when stop loss target is reached'),
            category: window.Blockly.Categories.After_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.sl_block = () => {
    return 'Bot.stop();\n';
};
