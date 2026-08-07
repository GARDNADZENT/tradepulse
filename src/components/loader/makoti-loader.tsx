import React, { useEffect, useState } from 'react';
import './makoti-loader.scss';

interface MakotiLoaderProps {
    message?: string;
}

const DOTS = ['', '.', '..', '...'];

export default function MakotiLoader({ message = 'Loading...' }: MakotiLoaderProps) {
    const [dotIdx, setDotIdx] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const dotTimer = setInterval(() => setDotIdx(i => (i + 1) % DOTS.length), 400);
        const progTimer = setInterval(() => setProgress(p => {
            if (p >= 100) return 0;
            return p + Math.random() * 15 + 5;
        }), 300);
        return () => { clearInterval(dotTimer); clearInterval(progTimer); };
    }, []);

    return (
        <div className='makoti-loader'>
            <div className='makoti-loader__bg' />
            <div className='makoti-loader__bg-overlay' />
            <div className='makoti-loader__particles'>
                {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className='makoti-loader__particle' style={{
                        left: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 5}s`,
                        animationDuration: `${3 + Math.random() * 4}s`,
                    }} />
                ))}
            </div>
            <div className='makoti-loader__content'>
                <div className='makoti-loader__logo-wrap'>
                    <div className='makoti-loader__glow' />
                    <div className='makoti-loader__m'>M</div>
                    <div className='makoti-loader__arrow'>
                        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                            <path d='M7 17L17 7' />
                            <path d='M7 7h10v10' />
                        </svg>
                    </div>
                </div>
                <div className='makoti-loader__brand'>MAKOTITRADERS</div>
                <div className='makoti-loader__tagline'>TRADE SMART. TRADE CONFIDENT. GROW CONSISTENT.</div>
                <div className='makoti-loader__bar-wrap'>
                    <div className='makoti-loader__bar' style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <div className='makoti-loader__status'>{message}{DOTS[dotIdx]}</div>
            </div>
        </div>
    );
}
