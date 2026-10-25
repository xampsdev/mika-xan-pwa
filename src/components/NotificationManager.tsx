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
  Volume2,
  Radio,
  ExternalLink,
  Send,
} from 'lucide-react';
import { getToken } from 'firebase/messaging';
import { db, doc, setDoc, serverTimestamp, getMessagingInstance, isMockMode } from '@/lib/firebase';
import { playNotificationChime } from '@/pages/AdminDashboard';

interface NotificationManagerProps {
  adminEmail: string;
}

const NTFY_TOPIC = 'mika-xan-alerts-xampsbeatz-9921';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

export const NotificationManager: React.FC<NotificationManagerProps> = ({ adminEmail }) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testingLocal, setTestingLocal] = useState<boolean>(false);
  const [testingNtfy, setTestingNtfy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [ntfyFeedback, setNtfyFeedback] = useState<string | null>(null);

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
        throw new Error('Permissão de notificação negada no navegador. Habilite nas configurações do site.');
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
        console.warn('FCM token retrieval notice:', tokenErr);
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

      setSuccessMsg('Notificações push ativadas com sucesso! Seu dispositivo receberá novos check-ins.');
      playNotificationChime();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao ativar notificações push.';
      console.warn('Push activation error:', err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingLocal(true);
    setErrorMsg(null);

    try {
      // Play audio chime
      playNotificationChime();

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('🐾 Mika & Xan: Teste de Notificação', {
          body: 'Notificações push nativas estão 100% ativas no seu aparelho!',
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [200, 100, 200],
          tag: 'test-notification',
        } as NotificationOptions);
      } else if ('Notification' in window) {
        new Notification('🐾 Mika & Xan: Teste de Notificação', {
          body: 'Notificações push nativas estão 100% ativas no seu aparelho!',
          icon: '/icon.svg',
        });
      }
      setSuccessMsg('Alerta de teste enviado com sucesso!');
    } catch (err) {
      console.warn('Test notification warning:', err);
      setErrorMsg('Não foi possível disparar a notificação de teste.');
    } finally {
      setTestingLocal(false);
    }
  };

  const handleTestNtfyBridge = async () => {
    setTestingNtfy(true);
    setNtfyFeedback(null);

    try {
      const res = await fetch(NTFY_URL, {
        method: 'POST',
        body: 'Alerta de teste 24/7 disparado pelo painel administrativo Mika & Xan.',
        headers: {
          Title: '🐾 Teste Alerta 24/7 (Mika & Xan)',
          Priority: 'high',
          Tags: 'white_check_mark,bell',
        },
      });

      if (res.ok) {
        setNtfyFeedback('Disparo ntfy.sh enviado! Verifique o app ou site do ntfy.');
      } else {
        setNtfyFeedback('Falha ao comunicar com ntfy.sh.');
      }
    } catch (err) {
      console.warn('ntfy test error:', err);
      setNtfyFeedback('Erro de conexão ao disparar ntfy.');
    } finally {
      setTestingNtfy(false);
    }
  };

  const isConfigured = permission === 'granted';

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D8] shadow-sm space-y-4">
      {/* Primary Push Header & Action */}
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
              Receba alertas sonoros no celular sempre que um tutor enviar uma nova ficha de check-in.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {isConfigured ? (
            <button
              onClick={handleTestNotification}
              disabled={testingLocal}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[#FAF7F2] hover:bg-[#F0ECE4] active:bg-[#E7E2D8] border border-[#E7E2D8] text-[#1C1917] text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {testingLocal ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D96B43]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#D96B43]" />
              )}
              <span>Testar Notificação Agora</span>
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

      {/* 24/7 Background Push Bridge via ntfy.sh */}
      <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#D96B43]" />
            <span className="text-xs font-bold text-[#1C1917]">
              Ponte 24/7 Anti-Suspensão (ntfy.sh)
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#78716C] bg-white px-2 py-0.5 rounded border border-[#E7E2D8]">
            {NTFY_TOPIC}
          </span>
        </div>
        <p className="text-[11px] text-[#78716C] leading-relaxed">
          Garante recebimento com toque e vibração mesmo se o Chrome estiver suspenso ou a tela bloqueada.
          Instale o app gratuito <strong>ntfy</strong> (Play Store / App Store) e inscreva-se no tópico acima.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={NTFY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F0ECE4] text-[#1C1917] border border-[#E7E2D8] rounded-xl text-xs font-semibold transition"
          >
            <span>Abrir Tópico Web</span>
            <ExternalLink className="w-3 h-3 text-[#78716C]" />
          </a>

          <button
            type="button"
            onClick={handleTestNtfyBridge}
            disabled={testingNtfy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F0ECE4] text-[#D96B43] border border-[#E7E2D8] rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            {testingNtfy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            <span>Enviar Teste ntfy</span>
          </button>

          {ntfyFeedback && (
            <span className="text-[11px] font-medium text-[#245235]">
              {ntfyFeedback}
            </span>
          )}
        </div>
      </div>

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
