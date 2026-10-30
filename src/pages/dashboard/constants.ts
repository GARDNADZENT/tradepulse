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
                    'Plan. Track. Perform. Automate your trading strategy and track every milestone in one workspace.'
                ),
            },
            { data: localize('Explore these guides and FAQs to start building and deploying your strategy:') },
        ],
        link: false,
    },
    {
        label: localize('Guide'),
        content: [{ data: localize('TradePulse — Plan. Track. Perform.') }],
        link: true,
    },
    {
        label: localize('FAQs'),
        content: [
            {
                data: localize('How does the Bot Builder work?'),
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
