import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import StandaloneLoginScreen from '../StandaloneLoginScreen';

jest.mock('@/components/shared', () => ({
    generateOAuthURL: jest.fn(async () => 'https://oauth.deriv.com/oauth2/authorize'),
}));

jest.mock('@/components/api-token-modal/api-token-modal', () => ({
    __esModule: true,
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid='pat-modal'>PAT Modal</div> : null),
}));

describe('StandaloneLoginScreen', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('renders TradersPulse auth actions and all 8 social account tiles', () => {
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
        render(<StandaloneLoginScreen />);

        expect(screen.getByRole('heading', { name: 'Welcome to TradersPulse' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Login with Deriv/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /PAT Login \(Personal Access Token\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Free Account/i })).toBeInTheDocument();

        expect(screen.getByText('OFFICIAL COMMUNITY & SOCIALS')).toBeInTheDocument();
        for (const label of [
            'Telegram',
            'WhatsApp',
            'YouTube',
            'TikTok',
            'Instagram',
            'X (Twitter)',
            'Facebook',
            'Discord',
        ]) {
            expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
        }

        // Empty URL social tile shows gentle coming-soon feedback
        fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
        expect(screen.getByText(/Telegram channel link will be connected soon/i)).toBeInTheDocument();
        expect(openSpy).not.toHaveBeenCalled();

        // Configured URL social tile opens in a new tab
        fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
        expect(openSpy).toHaveBeenCalledWith(
            expect.stringContaining('whatsapp.com'),
            '_blank',
            'noopener,noreferrer'
        );

        // PAT Login opens token modal
        fireEvent.click(screen.getByRole('button', { name: /PAT Login \(Personal Access Token\)/i }));
        expect(screen.getByTestId('pat-modal')).toBeInTheDocument();

        openSpy.mockRestore();
    });
});
