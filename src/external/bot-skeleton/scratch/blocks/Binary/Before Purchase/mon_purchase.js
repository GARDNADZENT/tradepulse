import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.mon_purchase = {
    init() {
        this.jsonInit({
            message0: localize('Monitor Purchase: %1 %2 %3', {
                '%1': '%1',
                '%2': '%2',
                '%3': '%3',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST',
                    options: [
                        ['DIGIT ODD', 'DIGITODD'],
                        ['DIGIT EVEN', 'DIGITEVEN'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'MULTIPLE_CONTRACTS',
                    options: [
                        ['FALSE', 'FALSE'],
                        ['TRUE', 'TRUE'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'CONTRACT_QUANTITY',
                    options: [
                        ['1', '1'],
                        ['2', '2'],
                        ['3', '3'],
                        ['4', '4'],
                        ['5', '5'],
                        ['10', '10'],
                    ],
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Monitor and purchase based on digit conditions'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.mon_purchase = () => {
    return '';
};
