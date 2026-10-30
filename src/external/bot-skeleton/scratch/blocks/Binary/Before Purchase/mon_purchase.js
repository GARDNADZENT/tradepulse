import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

const ALL_PURCHASE_CONTRACT_OPTIONS = [
    ['Rise', 'CALL'],
    ['Fall', 'PUT'],
    ['Rise Equals', 'CALLE'],
    ['Fall Equals', 'PUTE'],
    ['Over', 'DIGITOVER'],
    ['Under', 'DIGITUNDER'],
    ['Even', 'DIGITEVEN'],
    ['Odd', 'DIGITODD'],
    ['Matches', 'DIGITMATCH'],
    ['Differs', 'DIGITDIFF'],
    ['Asian Up', 'ASIANU'],
    ['Asian Down', 'ASIAND'],
    ['Ends Between', 'EXPIRYRANGE'],
    ['Ends Outside', 'EXPIRYMISS'],
    ['Stays Between', 'RANGE'],
    ['Goes Outside', 'UPORDOWN'],
    ['Touch', 'ONETOUCH'],
    ['No Touch', 'NOTOUCH'],
    ['Up', 'MULTUP'],
    ['Down', 'MULTDOWN'],
    ['Buy', 'ACCU'],
    ['Reset Call', 'RESETCALL'],
    ['Reset Put', 'RESETPUT'],
    ['High Tick', 'TICKHIGH'],
    ['Low Tick', 'TICKLOW'],
    ['Only Ups', 'RUNHIGH'],
    ['Only Downs', 'RUNLOW'],
];

const generatePurchaseCode = block => {
    const purchaseList = block.getFieldValue('PURCHASE_LIST') || 'CALL';
    const multipleContracts = block.getFieldValue('MULTIPLE_CONTRACTS');
    const quantity = Number(block.getFieldValue('CONTRACT_QUANTITY') || '1');

    if (multipleContracts === 'TRUE' && quantity > 1) {
        let code = '';
        for (let i = 0; i < quantity; i++) {
            code += `Bot.purchase('${purchaseList}');\n`;
        }
        return code;
    }

    return `Bot.purchase('${purchaseList}');\n`;
};

const createExtendedPurchaseBlock = labelPrefix => ({
    init() {
        this.jsonInit({
            message0: localize(`${labelPrefix}: %1 %2 %3`, {
                '%1': '%1',
                '%2': '%2',
                '%3': '%3',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST',
                    options: ALL_PURCHASE_CONTRACT_OPTIONS,
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
            tooltip: localize('Purchase contract of specified type'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    restricted_parents: ['before_purchase'],
});

window.Blockly.Blocks.mon_purchase = createExtendedPurchaseBlock('Purchase');
window.Blockly.JavaScript.javascriptGenerator.forBlock.mon_purchase = generatePurchaseCode;

window.Blockly.Blocks.apollo_purchase = createExtendedPurchaseBlock('Purchase');
window.Blockly.JavaScript.javascriptGenerator.forBlock.apollo_purchase = generatePurchaseCode;

window.Blockly.Blocks.apollo_purchase2 = {
    init() {
        this.jsonInit({
            message0: localize('Purchase %1', { '%1': '%1' }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST',
                    options: ALL_PURCHASE_CONTRACT_OPTIONS,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('Purchase contract of specified type'),
            category: window.Blockly.Categories.Before_Purchase,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    restricted_parents: ['before_purchase'],
};
window.Blockly.JavaScript.javascriptGenerator.forBlock.apollo_purchase2 = block => {
    const purchaseList = block.getFieldValue('PURCHASE_LIST') || 'CALL';
    return `Bot.purchase('${purchaseList}');\n`;
};
