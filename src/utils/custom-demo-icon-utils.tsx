import React from 'react';

export const CUSTOM_DEMO_SVG = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24" style={{ borderRadius: '50%' }}>
        <defs>
            <clipPath id="circleView">
                <circle cx="256" cy="256" r="256" />
            </clipPath>
        </defs>
        <g clipPath="url(#circleView)">
            <path fill="#eee" d="M0 0h512v512H0z"/>
            <path fill="#bd3d44" d="M0 0h512v39.4H0zm0 78.8h512v39.4H0zm0 78.7h512v39.4H0zm0 78.8h512v39.4H0zm0 78.8h512v39.4H0zm0 78.7h512v39.4H0zm0 78.8h512v39.4H0z"/>
            <path fill="#192f5d" d="M0 0h204.8v275.7H0z"/>
            <g fill="#eee">
                <path d="M10.2 26.7l2 6.3h6.7l-5.4 4 2 6.2-5.3-3.9-5.3 3.9 2-6.2-5.4-4h6.7zm41 0l2 6.3h6.6l-5.4 4 2 6.2-5.4-3.9-5.3 3.9 2-6.2-5.4-4h6.7zm41 0l2 6.3h6.6l-5.4 4 2 6.2-5.4-3.9-5.3 3.9 2-6.2-5.4-4h6.7zm41 0l2 6.3h6.6l-5.4 4 2 6.2-5.4-3.9-5.3 3.9 2-6.2-5.4-4h6.7zm41 0l2 6.3h6.6l-5.4 4 2 6.2-5.4-3.9-5.3 3.9 2-6.2-5.4-4h6.7zM30.7 53l2 6.3h6.7l-5.4 3.9 2 6.3-5.3-4-5.3 4 2-6.3-5.4-3.9h6.7zm41 0l2 6.3h6.6l-5.4 3.9 2 6.3-5.4-4-5.3 4 2-6.3-5.4-3.9h6.7zm41 0l2 6.3h6.6l-5.4 3.9 2 6.3-5.4-4-5.3 4 2-6.3-5.4-3.9h6.7zm41 0l2 6.3h6.6l-5.4 3.9 2 6.3-5.4-4-5.3 4 2-6.3-5.4-3.9h6.7z"/>
            </g>
        </g>
    </svg>
);

const STORAGE_KEY = 'is_custom_demo_icon_active';

function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch { /* noop */ }
}
function safeRemove(key) {
    try { sessionStorage.removeItem(key); } catch { /* noop */ }
}

// Migrate from sessionStorage to localStorage on first load
if (typeof window !== 'undefined' && !safeGet(STORAGE_KEY)) {
    try {
        const oldVal = sessionStorage.getItem(STORAGE_KEY);
        if (oldVal !== null) {
            safeSet(STORAGE_KEY, oldVal);
            safeRemove(STORAGE_KEY);
        }
    } catch { /* noop */ }
}

export const isCustomDemoIconActive = () => {
    if (typeof window === 'undefined') return false;
    return safeGet(STORAGE_KEY) === 'true';
};

export const setCustomDemoIconActive = (active: boolean) => {
    if (typeof window === 'undefined') return;
    safeSet(STORAGE_KEY, active ? 'true' : 'false');
    window.dispatchEvent(new Event('custom_demo_icon_changed'));
};
