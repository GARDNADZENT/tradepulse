// @ts-nocheck — TradePulse debug overlay
import React from 'react';

const DebugOverlay = ({ logs, onClose }: { logs: any[]; onClose: () => void }) => {
    if (!logs.length) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 99999,
            padding: '20px',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#fff',
        }}>
            <div style={{
                maxWidth: '900px',
                margin: '0 auto',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #333',
                }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#ff4444' }}>
                        ⚠️ Performance Debug Screen
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#ff4444',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                        }}
                    >
                        Close
                    </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ color: '#ffaa00', marginBottom: '8px' }}>Last 20 Log Entries:</h3>
                    <div style={{
                        background: '#0a0a0a',
                        padding: '12px',
                        borderRadius: '4px',
                        maxHeight: '500px',
                        overflowY: 'auto',
                    }}>
                        {logs.slice(-20).reverse().map((log, i) => (
                            <div key={i} style={{
                                marginBottom: '8px',
                                padding: '8px',
                                background: '#1a1a1a',
                                borderRadius: '4px',
                                borderLeft: '3px solid #ff4444',
                            }}>
                                <div style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                                    {log.timestamp}
                                </div>
                                <div style={{ color: '#fff' }}>
                                    <strong style={{ color: '#ffaa00' }}>{log.type}</strong>
                                </div>
                                <pre style={{
                                    margin: '4px 0 0 0',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    color: '#ccc',
                                    fontSize: '11px',
                                }}>
                                    {JSON.stringify(log, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{
                    background: '#2a1a1a',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #ff4444',
                }}>
                    <h3 style={{ color: '#ff4444', margin: '0 0 8px 0' }}>What to do:</h3>
                    <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                        <li>Take a screenshot of this debug screen</li>
                        <li>Share it with the developer</li>
                        <li>Check browser console for any red errors</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default DebugOverlay;
