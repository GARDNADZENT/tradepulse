import React, { useEffect, useRef, useState } from 'react';
import MakotiLoader from './makoti-loader';

const MIN_DISPLAY_MS = 5000;

let gateShowTime = 0;
let gateDone = false;
let gateListeners: (() => void)[] = [];

export function markLoaderDone() {
    gateDone = true;
    gateListeners.forEach(fn => fn());
}

interface MakotiLoaderGateProps {
    message?: string;
}

export default function MakotiLoaderGate({ message = 'Loading' }: MakotiLoaderGateProps) {
    const [show, setShow] = useState(true);
    const startTimeRef = useRef(gateShowTime || Date.now());
    const doneRef = useRef(gateDone);

    if (!gateShowTime) {
        gateShowTime = Date.now();
        startTimeRef.current = gateShowTime;
    }

    useEffect(() => {
        const check = () => {
            const elapsed = Date.now() - startTimeRef.current;
            if (gateDone && elapsed >= MIN_DISPLAY_MS) {
                setShow(false);
            } else if (gateDone) {
                const remaining = MIN_DISPLAY_MS - elapsed;
                setTimeout(() => setShow(false), remaining);
            }
        };

        if (doneRef.current) {
            check();
            return;
        }

        gateListeners.push(check);
        return () => {
            gateListeners = gateListeners.filter(fn => fn !== check);
        };
    }, []);

    if (!show) return null;

    return <MakotiLoader message={message} />;
}
