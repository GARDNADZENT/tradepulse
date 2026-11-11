import { useEffect, useMemo, useState } from 'react';
import {
    getTenantTagline,
    subscribeActiveTenantConfig,
} from '@/services/site-config/site-runtime-config';
import {
    getPreviewAppName,
    getPreviewLogo,
    subscribePreviewAppName,
    subscribePreviewLogo,
} from '@/utils/live-branding-store';
import { isPreviewMode } from '@/utils/is-preview-mode';
import { getAppName, getTradersPulseLogoSrc, LOGO_CANDIDATES } from '../../../utils/branding';

type TLogoMarkProps = {
    height?: number;
};

export const LogoMark = ({ height = 34 }: TLogoMarkProps) => {
    const [previewLogo, setPreviewLogo] = useState<string | null>(getPreviewLogo());
    const [previewAppName, setPreviewAppName] = useState<string | null>(getPreviewAppName());
    const [tagline, setTagline] = useState<string>(() => getTenantTagline());
    const [candidateIndex, setCandidateIndex] = useState(0);

    useEffect(() => subscribePreviewLogo(setPreviewLogo), []);
    useEffect(() => subscribePreviewAppName(setPreviewAppName), []);
    useEffect(() => subscribeActiveTenantConfig(() => setTagline(getTenantTagline())), []);

    const defaultLogoSrc = getTradersPulseLogoSrc();

    const candidates = useMemo(() => {
        const fileFallbacks = isPreviewMode() ? [defaultLogoSrc] : LOGO_CANDIDATES;
        return previewLogo ? [previewLogo, ...fileFallbacks] : [...fileFallbacks];
    }, [previewLogo, defaultLogoSrc]);

    useEffect(() => setCandidateIndex(0), [candidates]);

    const appName = (previewAppName || getAppName() || 'TradersPulse').toUpperCase();
    const logoSrc = candidateIndex < candidates.length ? candidates[candidateIndex] : defaultLogoSrc;

    return (
        <span className='app-header__logo-mark'>
            <img
                data-logo
                src={logoSrc}
                alt={appName}
                className='app-header__logo-img'
                style={{ height: `${height}px`, width: `${height}px` }}
                onError={() => {
                    if (candidateIndex < candidates.length - 1) {
                        setCandidateIndex(index => index + 1);
                    }
                }}
            />
            <span className='app-header__logo-stack'>
                <span className='app-header__logo-text'>{appName}</span>
                <span className='app-header__logo-sub'>{tagline}</span>
            </span>
        </span>
    );
};
