import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getLegacyWsAppId } from '@/components/shared';
import ApiTokenModal from '../api-token-modal';

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        init: jest.fn(async () => undefined),
        api: {
            authorize: jest.fn(async () => ({})),
        },
    },
}));

jest.mock('@/external/bot-skeleton/services/api/observables/connection-status-stream', () => ({
    setAccountList: jest.fn(),
    setAuthData: jest.fn(),
    setIsAuthorized: jest.fn(),
    setIsAuthorizing: jest.fn(),
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        client: {
            setLoginId: jest.fn(),
            setCurrency: jest.fn(),
            setBalance: jest.fn(),
            setIsLoggedIn: jest.fn(),
        },
    }),
}));

describe('ApiTokenModal (PAT Login)', () => {
    const originalAppId = process.env.NEXT_PUBLIC_DERIV_APP_ID;
    const originalFetch = global.fetch;
    const OriginalWebSocket = global.WebSocket;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_DERIV_APP_ID = originalAppId;
        global.fetch = originalFetch;
        global.WebSocket = OriginalWebSocket;
    });

    it('sanitizes non-numeric or placeholder NEXT_PUBLIC_DERIV_APP_ID to 1089 for V3 WebSockets', () => {
        process.env.NEXT_PUBLIC_DERIV_APP_ID = '🔒';
        expect(getLegacyWsAppId()).toBe('1089');

        process.env.NEXT_PUBLIC_DERIV_APP_ID = 'app_0195_oauth_client';
        expect(getLegacyWsAppId()).toBe('1089');

        process.env.NEXT_PUBLIC_DERIV_APP_ID = '36544';
        expect(getLegacyWsAppId()).toBe('36544');
    });

    it('authenticates Deriv V2 Personal Access Tokens (Bearer PAT) via /trading/v1/options/accounts', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                data: [
                    {
                        account_id: 'VRTC900111',
                        balance: '10000.00',
                        currency: 'USD',
                        group: 'demo',
                        status: 'active',
                        account_type: 'demo',
                    },
                    {
                        account_id: 'CR700222',
                        balance: '250.50',
                        currency: 'USD',
                        group: 'real',
                        status: 'active',
                        account_type: 'real',
                    },
                ],
            }),
        })) as any;

        const onClose = jest.fn();
        render(<ApiTokenModal isOpen={true} onClose={onClose} />);

        fireEvent.change(screen.getByLabelText(/Personal Access Token/i), {
            target: { value: 'ory_st_valid_v2_pat_token' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Connect Account/i }));

        await waitFor(() => {
            expect(screen.getByText(/Connected to VRTC900111/i)).toBeInTheDocument();
        });

        expect(localStorage.getItem('active_loginid')).toBe('VRTC900111');
        expect(JSON.parse(localStorage.getItem('auth_info') || '{}').access_token).toBe('ory_st_valid_v2_pat_token');
    });

    it('automatically fails over from ws.derivws.com to ws.binaryws.com for V3 API Tokens', async () => {
        process.env.NEXT_PUBLIC_DERIV_APP_ID = '🔒';
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({}),
        })) as any;

        const attemptedUrls: string[] = [];

        class MockWebSocket {
            url: string;
            onopen: (() => void) | null = null;
            onmessage: ((evt: { data: string }) => void) | null = null;
            onerror: (() => void) | null = null;
            onclose: ((evt: { code?: number }) => void) | null = null;

            constructor(url: string) {
                this.url = url;
                attemptedUrls.push(url);
                setTimeout(() => {
                    if (url.includes('ws.derivws.com')) {
                        this.onerror?.();
                    } else {
                        this.onopen?.();
                    }
                }, 5);
            }

            send(raw: string) {
                const parsed = JSON.parse(raw);
                if (parsed.authorize) {
                    setTimeout(() => {
                        this.onmessage?.({
                            data: JSON.stringify({
                                msg_type: 'authorize',
                                authorize: {
                                    loginid: 'VRTC123456',
                                    currency: 'USD',
                                    balance: 9850.25,
                                    is_virtual: 1,
                                    account_list: [{ loginid: 'VRTC123456', currency: 'USD', is_virtual: 1 }],
                                },
                            }),
                        });
                    }, 5);
                }
            }

            close() {}
        }

        global.WebSocket = MockWebSocket as any;

        render(<ApiTokenModal isOpen={true} onClose={jest.fn()} />);

        fireEvent.change(screen.getByLabelText(/Personal Access Token/i), {
            target: { value: 'legacyV3Token12345' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Connect Account/i }));

        await waitFor(() => {
            expect(screen.getByText(/Connected to VRTC123456/i)).toBeInTheDocument();
        });

        expect(attemptedUrls[0]).toBe('wss://ws.derivws.com/websockets/v3?app_id=1089');
        expect(attemptedUrls[1]).toBe('wss://ws.binaryws.com/websockets/v3?app_id=1089');
        expect(localStorage.getItem('deriv_pat_mode')).toBe('v3');
        expect(localStorage.getItem('deriv_v3_ws_url')).toBe('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    });

    it('surfaces Deriv token rejection immediately without misleading network error', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({}),
        })) as any;

        class RejectingWebSocket {
            onopen: (() => void) | null = null;
            onmessage: ((evt: { data: string }) => void) | null = null;
            onerror: (() => void) | null = null;
            onclose: ((evt: { code?: number }) => void) | null = null;

            constructor() {
                setTimeout(() => this.onopen?.(), 5);
            }

            send() {
                setTimeout(() => {
                    this.onmessage?.({
                        data: JSON.stringify({
                            error: { code: 'InvalidToken', message: 'The token is invalid.' },
                        }),
                    });
                }, 5);
            }

            close() {}
        }

        global.WebSocket = RejectingWebSocket as any;

        render(<ApiTokenModal isOpen={true} onClose={jest.fn()} />);

        fireEvent.change(screen.getByLabelText(/Personal Access Token/i), {
            target: { value: 'bad_token' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Connect Account/i }));

        await waitFor(() => {
            expect(screen.getByText('The token is invalid.')).toBeInTheDocument();
        });
    });
});
