import React, { useMemo } from 'react';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import useTMB from '@/hooks/useTMB';
import { Loader } from '@deriv-com/ui';

type AuthLoadingWrapperProps = {
    children: React.ReactNode;
};

const AuthLoadingWrapper = ({ children }: AuthLoadingWrapperProps) => {
    const { isSingleLoggingIn } = useOauth2();
    const { is_tmb_enabled: tmb_enabled_from_hook } = useTMB();

    const is_tmb_enabled = useMemo(
        () => window.is_tmb_enabled === true || tmb_enabled_from_hook,
        [tmb_enabled_from_hook]
    );

    if (isSingleLoggingIn && !is_tmb_enabled) {
        return <Loader isFullScreen />;
    }

    return <>{children}</>;
};

export default AuthLoadingWrapper;
