import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.tp_block = {
    init() {
        this.jsonInit({
            message0: localize('Take Profit Target Set'),
            args0: [
                {
                    type: 'input_value',
                    name: 'VALUE',
                },
            ],
            output: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Set take profit target amount'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.tp_block = block => {
    const value = block.getInput('VALUE')?.connection?.getShadowBlockDOM()?.textContent || '0';
    return `Bot.takeProfit(${value});\n`;
};
