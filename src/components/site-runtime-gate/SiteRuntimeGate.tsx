import React, { useEffect, useState } from 'react';
import {
    getActiveTenantConfig,
    getTenantBrandName,
    getTenantLogoSrc,
    subscribeActiveTenantConfig,
    TenantSiteConfig,
} from '@/services/site-config/site-runtime-config';
import './SiteRuntimeGate.scss';

export const SiteRuntimeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tenant, setTenant] = useState<TenantSiteConfig | null>(() => getActiveTenantConfig());

    useEffect(() => subscribeActiveTenantConfig(setTenant), []);

    if (tenant && (tenant.status === 'suspended' || tenant.status === 'maintenance')) {
        const isSuspended = tenant.status === 'suspended';
        const brandName = getTenantBrandName();
        const logoSrc = getTenantLogoSrc();

        return (
            <div className='tp-runtime-gate'>
                <div className='tp-runtime-gate__card'>
                    <img src={logoSrc} alt={brandName} className='tp-runtime-gate__logo' />
                    <span
                        className={`tp-runtime-gate__badge ${isSuspended ? 'tp-runtime-gate__badge--suspended' : 'tp-runtime-gate__badge--maint'}`}
                    >
                        {isSuspended ? 'SITE SUSPENDED' : 'SCHEDULED MAINTENANCE'}
                    </span>
                    <h1 className='tp-runtime-gate__title'>{brandName}</h1>
                    <p className='tp-runtime-gate__desc'>
                        {isSuspended
                            ? 'This trading site is temporarily offline. If you are the site operator, sign into Site Studio to review your account status.'
                            : tenant.announcement_text ||
                              'We are performing a quick platform upgrade. Please check back in a few minutes.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            {tenant?.announcement_text?.trim() && (
                <div className='tp-runtime-announcement' role='status'>
                    <span className='tp-runtime-announcement__dot' />
                    <span>{tenant.announcement_text}</span>
                </div>
            )}
            {children}
        </>
    );
};

export default SiteRuntimeGate;
