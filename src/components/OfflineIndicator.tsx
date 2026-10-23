/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center justify-center sm:justify-start gap-2 rounded-2xl bg-[#92400E] text-white px-4 py-2.5 text-xs font-semibold shadow-lg border border-[#FDE68A]/40 animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
      </span>
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo Offline • Gravações salvas no cache do aparelho</span>
    </aside>
  );
};

export default OfflineIndicator;
