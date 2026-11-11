import { fireEvent, render, screen } from '@testing-library/react';
import { LogoMark } from '../LogoMark';

describe('LogoMark', () => {
    const originalAppBuild = process.env.NEXT_PUBLIC_APP_BUILD;

    afterEach(() => {
        process.env.NEXT_PUBLIC_APP_BUILD = originalAppBuild;
    });

    it('renders the resolved app name in uppercase', () => {
        render(<LogoMark />);
        expect(screen.getByText('TRADERSPULSE')).toBeInTheDocument();
    });

    it('renders the provided TradersPulse logo image by default', () => {
        render(<LogoMark />);
        expect(screen.getByRole('img')).toHaveAttribute('src', '/traderpulse-logo.jpg');
    });

    it('keeps an img element after probing candidate fallbacks rather than generating a custom badge', () => {
        render(<LogoMark />);
        for (let i = 0; i < 6; i++) {
            const img = screen.queryByRole('img');
            if (!img) break;
            fireEvent.error(img);
        }
        expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('uses the preview-prefixed TradersPulse logo in the static preview build', () => {
        process.env.NEXT_PUBLIC_APP_BUILD = 'true';
        render(<LogoMark />);
        expect(screen.getByRole('img')).toHaveAttribute('src', '/bot/preview/traderpulse-logo.jpg');
    });
});
