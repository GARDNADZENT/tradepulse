import React from 'react';
import { render, screen } from '@testing-library/react';
import AIDeveloper from '../ai-developer';

jest.mock('@/hooks/useStore', () => ({ useStore: () => ({ dashboard: {}, load_modal: {}, run_panel: {} }) }));
jest.mock('@/lib/deriv/tick-bus', () => ({
    derivBus: {
        getPipSize: () => 2,
        getTicks: () => [],
        onHistory: () => () => {},
        onTick: () => () => {},
        subscribe: () => () => {},
    },
}));
jest.mock('../ai-assistant', () => () => <div>AI chat only</div>);

describe('AI Developer page', () => {
    it('shows the AI conversation without the manual settings, presets or XML action panel', () => {
        render(<AIDeveloper />);
        expect(screen.getByText('AI chat only')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'AI Developer', level: 1 })).toBeInTheDocument();
        for (const removed of [
            'Manual strategy settings and presets',
            'Parse Keywords',
            '1. Market & Contract Architecture',
            '2. Virtual Hook & Risk Management',
            'Load & Run Now',
            'Download .XML',
            'Inspect XML',
            'Over 2 Virtual Hook Pro',
            'Even Parity 58% Majority Hunter',
            'Coldest Digit Differs Sniper',
            'Under 7 Safe Recovery Bot',
        ]) {
            expect(screen.queryByText(removed)).not.toBeInTheDocument();
        }
        expect(document.querySelector('.ai-dev__prompt-card')).toBeNull();
        expect(document.querySelector('.ai-dev__grid')).toBeNull();
    });
});
