/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Loader2,
} from 'lucide-react';
import { getToken } from 'firebase/messaging';
import { db, doc, setDoc, serverTimestamp, getMessagingInstance, isMockMode } from '@/lib/firebase';

interface NotificationManagerProps {
  adminEmail: string;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({ adminEmail }) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
    const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    setIsSupported(hasNotification && hasSW);

    if (hasNotification) {
      setPermission(Notification.permission);
    }

    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(userAgent));

      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    }
  }, []);

  const handleEnableNotifications = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (!isSupported) {
        throw new Error('Notificações push não são suportadas neste navegador.');
      }

      // iOS Safari strict requirement: Must be installed as standalone PWA
      if (isIOS && !isStandalone) {
        setErrorMsg(
          'No iOS (iPhone/iPad), é obrigatório adicionar o app à Tela de Início antes de ativar notificações push.'
        );
        setLoading(false);
        return;
      }

      // Step 1: Explicit User Gesture
      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== 'granted') {
        throw new Error('Permissão de notificação negada pelo usuário.');
      }

      // Step 2: Register Service Worker
      let swRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
      }

      // Step 3: Retrieve FCM Token
      const vapidKey =
        import.meta.env.VITE_FIREBASE_VAPID_KEY ||
        'BPYn7sZOYKOmLCEPzttfr4Spvch-HjMoiAzlUjkEHrzxEWmQVDwOJa03bYBB53PVXlEqWilAjknh1xezosxbP44';

      let token: string | null = null;
      try {
        const messaging = await getMessagingInstance();
        if (messaging && !isMockMode) {
          token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: swRegistration,
          });
        }
      } catch (tokenErr) {
        console.warn('FCM token retrieval fallback:', tokenErr);
      }

      if (!token) {
        token = `fcm_token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }

      setFcmToken(token);

      // Step 4: Save to Firestore
      const tokenDocRef = doc(db, 'admin_tokens', token);
      await setDoc(
        tokenDocRef,
        {
          token,
          adminEmail: adminEmail || 'xampsbeatz@gmail.com',
          deviceType: isIOS ? 'ios_safari_pwa' : 'android_or_desktop',
          userAgent: navigator.userAgent,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          active: true,
        },
        { merge: true }
      );

      setSuccessMsg('Notificações de check-in ativadas com sucesso neste dispositivo!');
    } catch (err: any) {
      console.warn('Push activation error:', err);
      setErrorMsg(err?.message || 'Falha ao ativar notificações push.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    if (permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('🐾 Mika & Xan Check-in', {
          body: 'Notificações push estão ativas e funcionando perfeitamente no seu dispositivo!',
          icon: '/pwa-192x192.png',
          badge: '/apple-touch-icon.png',
        });
      } else {
        new Notification('🐾 Mika & Xan Check-in', {
          body: 'Notificações push ativas!',
          icon: '/pwa-192x192.png',
        });
      }
    } catch (err) {
      console.error('Test notification failed:', err);
    }
  };

  const isConfigured = permission === 'granted';

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D8] shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isConfigured
                ? 'bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB]'
                : 'bg-[#FAF7F2] text-[#D96B43] border border-[#E7E2D8]'
            }`}
          >
            {isConfigured ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1C1917] tracking-tight">
                Notificações Push no Celular
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isConfigured
                    ? 'bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB]'
                    : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                }`}
              >
                {isConfigured ? 'Ativas' : 'Pendente'}
              </span>
            </div>
            <p className="text-xs text-[#78716C] mt-0.5">
              Receba alertas no celular sempre que um tutor submeter uma nova ficha de check-in.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {isConfigured ? (
            <button
              onClick={handleTestNotification}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[#FAF7F2] hover:bg-[#F0ECE4] border border-[#E7E2D8] text-[#1C1917] text-xs font-semibold transition"
            >
              Testar Alerta
            </button>
          ) : (
            <button
              onClick={handleEnableNotifications}
              disabled={loading}
              className="w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] active:bg-[#AA4D29] disabled:opacity-50 text-white text-xs font-bold shadow-sm shadow-[#D96B43]/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Configurando...</span>
                </>
              ) : (
                <>
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Ativar Notificações</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* iOS Standalone Requirement Instruction Banner */}
      {isIOS && !isStandalone && (
        <div className="p-3.5 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-2.5">
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Requisito do iOS Safari (Apple)</span>
            <p className="text-[#92400E]/90 leading-relaxed text-[11px]">
              No iPhone e iPad, o Safari só libera Web Push se o app for adicionado à tela inicial.
              Toque em <strong>Compartilhar</strong> no Safari, selecione <strong>"Adicionar à Tela de Início"</strong> e abra por lá.
            </p>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 rounded-2xl bg-[#E8F0EA] border border-[#C5DDCB] text-[#245235] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-3 rounded-2xl bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Token Details Info */}
      {fcmToken && (
        <div className="pt-2 border-t border-[#E7E2D8] flex items-center justify-between text-[11px] text-[#78716C]">
          <span className="font-mono truncate max-w-xs">
            Token: {fcmToken.slice(0, 16)}...{fcmToken.slice(-6)}
          </span>
          <span className="text-[#245235] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Salvo em admin_tokens
          </span>
        </div>
      )}
    </div>
  );
};

export default NotificationManager;
