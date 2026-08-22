import { localize } from '@deriv-com/translations';
import { config } from '../../../../../constants/config';
import { emptyTextValidator, modifyContextMenu } from '../../../../utils';

window.Blockly.Blocks.apollo_notify = {
    init() {
        this.jsonInit({
            message0: localize(
                'Apollo Notify {{ notification_type }} {{ notification_sound }} {{ input_message }}',
                {
                    notification_type: '%1',
                    notification_sound: '%2',
                    input_message: '%3',
                }
            ),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'NOTIFICATION_TYPE',
                    options: config().lists.NOTIFICATION_TYPE,
                },
                {
                    type: 'field_dropdown',
                    name: 'NOTIFICATION_SOUND',
                    options: config().lists.NOTIFICATION_SOUND,
                },
                {
                    type: 'input_value',
                    name: 'MESSAGE',
                    check: null,
                },
            ],
            colour: window.Blockly.Colours.Special3.colour,
            colourSecondary: window.Blockly.Colours.Special3.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special3.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            tooltip: localize('Displays an Apollo notification with selected type and sound'),
            category: window.Blockly.Categories.Miscellaneous,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    getRequiredValueInputs() {
        return {
            MESSAGE: emptyTextValidator,
        };
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.apollo_notify = block => {
    const notificationType = block.getFieldValue('NOTIFICATION_TYPE');
    const sound = block.getFieldValue('NOTIFICATION_SOUND');
    const message =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'MESSAGE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || `"${localize('<empty message>')}"`;

    const code = `Bot.notify({ className: 'journal__text--${notificationType}', message: ${message}, sound: '${sound}', block_id: '${block.id}', variable_name: null });\n`;
    return code;
};
