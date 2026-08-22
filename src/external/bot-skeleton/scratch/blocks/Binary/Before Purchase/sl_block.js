import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.sl_block = {
    init() {
        this.jsonInit({
            message0: localize('Stop Loss Target Set'),
            args0: [
                {
                    type: 'input_value',
                    name: 'VALUE',
                },
            ],
            output: null,
            colour: window.Blockly.Colours.Special2.colour,
            colourSecondary: window.Blockly.Colours.Special2.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special2.colourTertiary,
            tooltip: localize('Set stop loss target amount'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.sl_block = block => {
    const value = block.getInput('VALUE')?.connection?.getShadowBlockDOM()?.textContent || '0';
    return `Bot.stopLoss(${value});\n`;
};
