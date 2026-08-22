import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.apollo_notify = {
    init() {
        this.jsonInit({
            message0: localize('Purchase Notification'),
            args0: [
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
            tooltip: localize('Send notification during purchase'),
            category: window.Blockly.Categories.During_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.apollo_notify = block => {
    const message = block.getInput('MESSAGE')?.connection?.getShadowBlockDOM()?.textContent || '';
    return `Bot.notify('${message}');\n`;
};
