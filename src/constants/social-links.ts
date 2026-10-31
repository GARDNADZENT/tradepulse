export type TSocialPlatformId =
    | 'telegram'
    | 'whatsapp'
    | 'youtube'
    | 'tiktok'
    | 'instagram'
    | 'twitter'
    | 'facebook'
    | 'discord';

export type TSocialAccountConfig = {
    id: TSocialPlatformId;
    label: string;
    /** Paste your official channel/profile URL here (e.g. 'https://t.me/yourchannel') */
    url: string;
};

/**
 * Official TradersPulse Social & Community Links.
 * Add or update any URL below — empty strings ('') stay visible on the Login Screen
 * as ready-to-connect placeholders until you paste your link.
 */
export const SOCIAL_LINKS: TSocialAccountConfig[] = [
    {
        id: 'telegram',
        label: 'Telegram',
        url: '',
    },
    {
        id: 'whatsapp',
        label: 'WhatsApp',
        url: 'https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d',
    },
    {
        id: 'youtube',
        label: 'YouTube',
        url: '',
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        url: '',
    },
    {
        id: 'instagram',
        label: 'Instagram',
        url: '',
    },
    {
        id: 'twitter',
        label: 'X (Twitter)',
        url: '',
    },
    {
        id: 'facebook',
        label: 'Facebook',
        url: '',
    },
    {
        id: 'discord',
        label: 'Discord',
        url: '',
    },
];
