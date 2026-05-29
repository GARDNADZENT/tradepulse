import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId } from '@/components/shared/utils/config/config';
import './iframe-wrapper.scss';

type TAuthMessage = {
    type: 'AUTH_TOKEN';
    token: string;
    loginid: string;
    appId: string;
    timestamp: number;
};

const getActiveLoginid = () => localStorage.getItem('active_loginid') ?? '';

const getAuthToken = () => {
    const loginid = getActiveLoginid();
    if (!loginid) return '';
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}') as Record<string, string>;
    return accountsList[loginid] ?? '';
};

type TIframeWrapperProps = {
    src: string;
    title: string;
    className?: string;
};

const IframeWrapper = observer(({ src, title, className = '' }: TIframeWrapperProps) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const targetOriginRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const sendAuth = useCallback(
        (targetWindow?: Window | null, explicitOrigin?: string) => {
            const contentWindow = targetWindow ?? iframeRef.current?.contentWindow;
            if (!contentWindow) return;

            const token = getAuthToken();
            const loginid = getActiveLoginid();
            const appId = String(getAppId());

            if (!token || !loginid) return;

            const targetOrigin = explicitOrigin ?? targetOriginRef.current ?? new URL(src).origin;

            const message: TAuthMessage = {
                type: 'AUTH_TOKEN',
                token,
                loginid,
                appId,
                timestamp: Date.now(),
            };

            try {
                contentWindow.postMessage(message, targetOrigin);
            } catch {
                // Cross-origin edge cases — ignore
            }
        },
        [src]
    );

    useEffect(() => {
        let targetOrigin: string | null = null;
        try {
            targetOrigin = new URL(src).origin;
        } catch {
            targetOrigin = null;
        }
        targetOriginRef.current = targetOrigin;

        const onMessage = (event: MessageEvent) => {
            if (targetOrigin && event.origin !== targetOrigin) return;
            const data = event.data;
            if (!data || typeof data !== 'object' || !('type' in data)) return;

            if (data.type === 'REQUEST_AUTH') {
                const source = (event.source as Window | null) ?? iframeRef.current?.contentWindow;
                sendAuth(source, event.origin);
            }
        };

        window.addEventListener('message', onMessage);

        const authInterval = window.setInterval(() => sendAuth(), 5000);
        const authWatchInterval = window.setInterval(() => {
            const token = getAuthToken();
            const loginid = getActiveLoginid();
            if (token && loginid) sendAuth();
        }, 1000);

        const loadTimeout = window.setTimeout(() => {
            setIsLoading(false);
        }, 10000);

        return () => {
            window.removeEventListener('message', onMessage);
            window.clearInterval(authInterval);
            window.clearInterval(authWatchInterval);
            window.clearTimeout(loadTimeout);
        };
    }, [sendAuth, src]);

    const handleLoad = () => {
        setIsLoading(false);
        setHasError(false);
        window.setTimeout(() => sendAuth(), 500);
    };

    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
    };

    return (
        <div className={`iframe-wrapper ${className}`.trim()}>
            {isLoading && !hasError && (
                <div className='iframe-wrapper__status' aria-live='polite'>
                    Loading {title}...
                </div>
            )}
            {hasError && (
                <div className='iframe-wrapper__error'>
                    <p>Failed to load {title}.</p>
                    <p className='iframe-wrapper__error-hint'>
                        The tool may block embedding in some browsers. You can open it in a new tab.
                    </p>
                    <a href={src} target='_blank' rel='noopener noreferrer' className='iframe-wrapper__open-link'>
                        Open in new tab
                    </a>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={src}
                title={title}
                className='iframe-wrapper__frame'
                frameBorder='0'
                allowFullScreen
                loading='eager'
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
                referrerPolicy='no-referrer-when-downgrade'
                onLoad={handleLoad}
                onError={handleError}
            />
        </div>
    );
});

export default IframeWrapper;
