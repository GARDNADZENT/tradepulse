import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CopyTrading from '../copy-trading';

const apiBaseListeners: Array<(evt: { data: any }) => void> = [];

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        account_info: { loginid: 'DOT_MASTER_001', currency: 'USD' },
        api: {
            onMessage: () => ({
                subscribe: (cb: (evt: { data: any }) => void) => {
                    apiBaseListeners.push(cb);
                    return {
                        unsubscribe: () => {
                            const idx = apiBaseListeners.indexOf(cb);
                            if (idx >= 0) apiBaseListeners.splice(idx, 1);
                        },
                    };
                },
            }),
        },
    },
}));

const mockGetAuthInfo = jest.fn();
jest.mock('@/external/deriv-core', () => ({
    getAuthInfo: () => mockGetAuthInfo(),
}));

describe('CopyTrading — V2 PAT + Multi-Host V3 Client Sync & Trade Mirroring', () => {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        apiBaseListeners.length = 0;
        localStorage.clear();
        sessionStorage.clear();
        mockGetAuthInfo.mockReturnValue(null);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        globalThis.WebSocket = originalWebSocket;
    });

    it('syncs V2 Bearer PAT client tokens via REST /options/accounts without WebSocket error or clobbering Master session', async () => {
        sessionStorage.setItem(
            'deriv_accounts',
            JSON.stringify([{ account_id: 'DOT_MASTER_001', balance: '500.00', currency: 'USD' }])
        );

        globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/options/accounts')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: [
                            {
                                account_id: 'DOT93428028',
                                balance: '9987.59',
                                currency: 'USD',
                                account_type: 'demo',
                            },
                            {
                                account_id: 'CR771122',
                                balance: '125.40',
                                currency: 'USD',
                                account_type: 'real',
                            },
                        ],
                    }),
                } as Response;
            }
            return { ok: false, status: 404, json: async () => ({}) } as Response;
        }) as unknown as typeof fetch;

        // Even if V3 WebSocket is completely unreachable, V2 PAT sync succeeds cleanly
        globalThis.WebSocket = jest.fn(() => {
            throw new Error('V3 WebSocket should not be required for V2 PAT');
        }) as unknown as typeof WebSocket;

        render(<CopyTrading />);

        const input = screen.getByPlaceholderText(/Enter Tokens/i);
        fireEvent.change(input, { target: { value: 'pat_synthetic_follower_alpha' } });
        fireEvent.click(screen.getByRole('button', { name: 'SYNC' }));

        await waitFor(() => {
            expect(screen.getByText('Synced 2 accounts.')).toBeInTheDocument();
        });

        expect(screen.getByText('DOT93428028')).toBeInTheDocument();
        expect(screen.getByText('CR771122')).toBeInTheDocument();
        // Master session accounts remain untouched
        expect(JSON.parse(sessionStorage.getItem('deriv_accounts') || '[]')[0].account_id).toBe(
            'DOT_MASTER_001'
        );
    });

    it('falls over across official V3 WebSocket hosts when the primary host fails handshake', async () => {
        globalThis.fetch = jest.fn(async () => ({
            ok: false,
            status: 404,
            json: async () => ({}),
        })) as unknown as typeof fetch;

        const attemptedUrls: string[] = [];

        class MockMultiHostWebSocket {
            url: string;
            onopen: (() => void) | null = null;
            onmessage: ((evt: { data: string }) => void) | null = null;
            onerror: (() => void) | null = null;
            onclose: (() => void) | null = null;

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
                const payload = JSON.parse(raw);
                if (payload.authorize) {
                    setTimeout(() => {
                        this.onmessage?.({
                            data: JSON.stringify({
                                msg_type: 'authorize',
                                authorize: {
                                    loginid: 'VRTC551199',
                                    currency: 'USD',
                                    balance: 10000,
                                    is_virtual: 1,
                                },
                            }),
                        });
                    }, 5);
                }
            }

            close() {}
        }

        globalThis.WebSocket = MockMultiHostWebSocket as unknown as typeof WebSocket;

        render(<CopyTrading />);

        fireEvent.change(screen.getByPlaceholderText(/Enter Tokens/i), {
            target: { value: 'v3_synthetic_follower_beta' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'SYNC' }));

        await waitFor(() => {
            expect(screen.getByText('Synced 1 account.')).toBeInTheDocument();
        });

        expect(attemptedUrls.length).toBeGreaterThanOrEqual(2);
        expect(attemptedUrls[0]).toContain('ws.derivws.com');
        expect(attemptedUrls[1]).toContain('ws.binaryws.com');
        expect(screen.getByText('VRTC551199')).toBeInTheDocument();
    });

    it('mirrors Master trades to V2 follower accounts via OTP WebSocket using underlying_symbol', async () => {
        mockGetAuthInfo.mockReturnValue({ access_token: 'pat_synthetic_master_session' });
        localStorage.setItem('active_loginid', 'DOT_MASTER_001');
        localStorage.setItem(
            'tp_copytrading_followers_v1',
            JSON.stringify([
                {
                    token: 'pat_synthetic_follower_gamma',
                    loginid: 'DOT_FOLLOWER_777',
                    currency: 'USD',
                    balance: 1000,
                    isVirtual: true,
                    enabled: true,
                    authMode: 'v2',
                },
            ])
        );

        globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/accounts/DOT_MASTER_001/otp')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { url: 'wss://mock-otp/master' } }),
                } as Response;
            }
            if (url.includes('/accounts/DOT_FOLLOWER_777/otp')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: { url: 'wss://mock-otp/follower-777' } }),
                } as Response;
            }
            return { ok: false, status: 404, json: async () => ({}) } as Response;
        }) as unknown as typeof fetch;

        const followerPayloads: any[] = [];

        class MockOtpWebSocket {
            url: string;
            onopen: (() => void) | null = null;
            onmessage: ((evt: { data: string }) => void) | null = null;
            onerror: (() => void) | null = null;

            constructor(url: string) {
                this.url = url;
                setTimeout(() => this.onopen?.(), 5);
            }

            send(raw: string) {
                const parsed = JSON.parse(raw);
                if (this.url.includes('follower-777')) {
                    followerPayloads.push(parsed);
                    setTimeout(() => {
                        this.onmessage?.({
                            data: JSON.stringify({
                                msg_type: 'buy',
                                buy: { contract_id: 998877, balance_after: 995.0 },
                            }),
                        });
                    }, 5);
                }
            }

            close() {}
        }

        globalThis.WebSocket = MockOtpWebSocket as unknown as typeof WebSocket;

        render(<CopyTrading />);

        fireEvent.click(screen.getByRole('button', { name: /Copy Trading: OFF/i }));

        await waitFor(() => {
            expect(screen.getByText(/Listening on Master DOT_MASTER_001/i)).toBeInTheDocument();
        });

        act(() => {
            apiBaseListeners.forEach(cb =>
                cb({
                    data: {
                        msg_type: 'buy',
                        buy: { contract_id: 445566, buy_price: 5 },
                        echo_req: {
                            parameters: {
                                underlying_symbol: 'R_100',
                                contract_type: 'DIGITOVER',
                                amount: 5,
                                duration: 1,
                                duration_unit: 't',
                                barrier: '4',
                            },
                        },
                    },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByText('MIRRORED')).toBeInTheDocument();
        });

        expect(followerPayloads).toHaveLength(1);
        expect(followerPayloads[0].parameters.underlying_symbol).toBe('R_100');
        expect(followerPayloads[0].parameters.contract_type).toBe('DIGITOVER');
        expect(followerPayloads[0].parameters.barrier).toBe('4');
        expect(screen.getByText('995.00 USD')).toBeInTheDocument();
    });
});
