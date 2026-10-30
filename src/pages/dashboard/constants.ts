import { localize } from '@deriv-com/translations';

export type TSidebarItem = {
    label: string;
    content: { data: string; faq_id?: string }[];
    link: boolean;
};

export const SIDEBAR_INTRO = (): TSidebarItem[] => [
    {
        label: localize('Welcome to TradePulse!'),
        content: [
            {
                data: localize(
                    'Plan. Track. Perform. Automate your trading strategy and follow your structured compounding plan in one unified workspace.'
                ),
            },
            { data: localize('Check out these guides and FAQs to learn more about building your bot:') },
        ],
        link: false,
    },
    {
        label: localize('Guide'),
        content: [{ data: localize('TradePulse — your automated trading & planning workspace') }],
        link: true,
    },
    {
        label: localize('FAQs'),
        content: [
            {
                data: localize('What is TradePulse Bot Builder?'),
                faq_id: 'faq-0',
            },
            {
                data: localize('Where do I find the blocks I need?'),
                faq_id: 'faq-1',
            },
            {
                data: localize('How do I remove blocks from the workspace?'),
                faq_id: 'faq-2',
            },
        ],
        link: true,
    },
];
