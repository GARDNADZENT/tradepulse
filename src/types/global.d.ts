declare global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let google: any;
    interface Window {
        sendRequestsStatistic: (is_running: boolean) => void;
        _newSystemWS?: WebSocket;
        DBot?: Record<string, any>;
    }
}

export {};
