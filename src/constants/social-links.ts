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
        url: 'https://t.me/gadnadolo',
    },
    {
        id: 'whatsapp',
        label: 'WhatsApp',
        url: 'https://chat.whatsapp.com/HiWVW11p2o55KhioHB9fVR?s=cl&p=a&iam=2',
    },
    {
        id: 'youtube',
        label: 'YouTube',
        url: 'https://www.youtube.com/@gardnadzenttechnologies4239',
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        url: 'https://vm.tiktok.com/ZS9yxAFjuXbnh-Kd3HM/',
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
