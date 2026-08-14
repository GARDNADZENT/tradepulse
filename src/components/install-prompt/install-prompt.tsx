import React from 'react';
import { Localize, localize } from '@deriv-com/translations';
import Dialog from '../shared_ui/dialog';
import './install-prompt.scss';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'pwa_install_prompt_dismissed_at';
const RE_PROMPT_DAYS = 7;

const isStandalone = (): boolean =>
    window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true;

const isIOS = (): boolean => {
    const user_agent = window.navigator.userAgent;
    const is_ios_ua = /iPad|iPhone|iPod/.test(user_agent);
    // iPadOS 13+ reports as a Mac — match it by touch + desktop UA.
    const is_ipad_os = (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    return is_ios_ua || is_ipad_os;
};

const shouldPrompt = (): boolean => {
    const dismissed_at = Number(localStorage.getItem(STORAGE_KEY) || 0);
    return !dismissed_at || Date.now() - dismissed_at > RE_PROMPT_DAYS * 24 * 60 * 60 * 1000;
};

const InstallPrompt = () => {
    const [deferred_prompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
    const [is_visible, setIsVisible] = React.useState(false);
    const [is_ios, setIsIOS] = React.useState(false);

    React.useEffect(() => {
        if (isStandalone() || !shouldPrompt()) return;

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
            setIsVisible(true);
        };

        const handleAppInstalled = () => {
            setIsVisible(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        // iOS Safari never fires beforeinstallprompt — offer home-screen instructions instead.
        if (isIOS()) {
            setIsIOS(true);
            const timer = window.setTimeout(() => {
                if (shouldPrompt()) setIsVisible(true);
            }, 3000);
            return () => {
                window.clearTimeout(timer);
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
                window.removeEventListener('appinstalled', handleAppInstalled);
            };
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferred_prompt) return;
        deferred_prompt.prompt();
        const choice = await deferred_prompt.userChoice;
        if (choice.outcome === 'accepted') {
            setIsVisible(false);
            setDeferredPrompt(null);
        }
    };

    const handleLater = () => {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        setIsVisible(false);
        setDeferredPrompt(null);
    };

    return (
        <Dialog
            title={localize('Install the app')}
            confirm_button_text={is_ios ? undefined : localize('Install')}
            cancel_button_text={localize('Ask me later')}
            onConfirm={handleInstall}
            onCancel={handleLater}
            onClose={handleLater}
            is_visible={is_visible}
            has_close_icon
            dismissable
            login={() => undefined} // login is not needed for this dialog
        >
            {is_ios ? (
                <div className='install-prompt__ios'>
                    <Localize
                        i18n_default_text='Tap the <0>Share</0> button in Safari, then choose <1>Add to Home Screen</1> to install the app.'
                        components={[
                            <strong key='share' />,
                            <strong key='add' />,
                        ]}
                    />
                </div>
            ) : (
                <Localize i18n_default_text='Install the app for a native-app experience — faster loading, a dedicated app icon and better performance. Works on your phone and desktop.' />
            )}
        </Dialog>
    );
};

export default InstallPrompt;
