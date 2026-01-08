
'use client'

import { useState } from 'react';
import { syncIRacingEvents } from '@/app/actions/sync-events';

export default function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage('Syncing...');

    const result = await syncIRacingEvents();

    if (result.success) {
      setMessage(`Successfully synced ${result.count} events!`);
    } else {
      setMessage(`Error: ${result.error}`);
    }

    setIsSyncing(false);

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <button
        onClick={handleSync}
        disabled={isSyncing}
        style={{
          backgroundColor: isSyncing ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '5px',
          cursor: isSyncing ? 'not-allowed' : 'pointer',
        }}
      >
        {isSyncing ? 'Syncing...' : 'Sync iRacing Events'}
      </button>
      {message && <span style={{ marginLeft: '10px', fontSize: '14px' }}>{message}</span>}
    </div>
  );
}
