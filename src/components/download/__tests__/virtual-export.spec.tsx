import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Download from '../download';

const mockDownloadFile = jest.fn();
jest.mock('@/utils/download', () => ({ downloadFile: (...args: unknown[]) => mockDownloadFile(...args), getSuccessJournalMessage: jest.fn() }));
jest.mock('@/hooks/useStore', () => ({ useStore: () => ({
    run_panel: { is_clear_stat_disabled: false, is_running: false }, journal: { filtered_messages: [] },
    transactions: { transactions: [{ type: 'virtual_contract', data: {
        display_name: 'Volatility 10 Index', outcome: 'won', entry_spot: '1357.80', exit_spot: '1357.81',
        buy_price: 0, profit: 0,
    } }] },
}) }));
jest.mock('@/components/shared_ui/popover', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('@/components/shared_ui/button', () => ({ __esModule: true, default: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
) }));

test('export labels simulations and does not invent reference IDs or real monetary results', () => {
    render(<Download tab='transactions' />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const csv = mockDownloadFile.mock.calls[0][1] as string;
    expect(csv).toContain('Volatility 10 Index (Virtual Win)');
    expect(csv).toContain('1357.80');
    expect(csv).toContain('1357.81');
    expect(csv).toMatch(/,0\.00,0\.00$/);
    expect(csv.split('\n')[1].split(',').slice(1, 3)).toEqual(['', '']);
});
