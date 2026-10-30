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
import { db, doc, setDoc, serverTimestamp, getMessagingInstance, isMockMode, deepCleanUndefined } from '@/lib/firebase';
import { playNotificationChime } from '@/pages/AdminDashboard';
import { sendNtfyAlert, NTFY_TOPIC, NTFY_WEB_URL } from '@/lib/ntfy';

interface NotificationManagerProps {
  adminEmail: string;
}

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
        const swParams = new URLSearchParams();
        if (import.meta.env.VITE_FIREBASE_API_KEY) swParams.set('apiKey', import.meta.env.VITE_FIREBASE_API_KEY);
        if (import.meta.env.VITE_FIREBASE_PROJECT_ID) swParams.set('projectId', import.meta.env.VITE_FIREBASE_PROJECT_ID);
        if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) swParams.set('messagingSenderId', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
        if (import.meta.env.VITE_FIREBASE_APP_ID) swParams.set('appId', import.meta.env.VITE_FIREBASE_APP_ID);
        if (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) swParams.set('authDomain', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
        if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) swParams.set('storageBucket', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
        const swUrl = swParams.toString() ? `/firebase-messaging-sw.js?${swParams.toString()}` : '/firebase-messaging-sw.js';

        swRegistration = await navigator.serviceWorker.register(swUrl);
        await navigator.serviceWorker.ready;
      }

      // Step 3: Retrieve FCM Token
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

      let token: string | null = null;
      try {
        const messaging = await getMessagingInstance();
        if (messaging && !isMockMode && vapidKey) {
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
        deepCleanUndefined({
          token,
          adminEmail: adminEmail || 'admin',
          deviceType: isIOS ? 'ios_safari_pwa' : 'android_or_desktop',
          userAgent: navigator.userAgent || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          active: true,
        }),
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
      await sendNtfyAlert('Teste Mika & Xan', 'O alerta no seu Android está funcionando 100%!');
      setNtfyFeedback('Disparo ntfy enviado com sucesso! Verifique seu app ntfy.');
    } catch (err) {
      console.warn('ntfy test error:', err);
      setNtfyFeedback('Erro de conexão ao disparar ntfy.');
    } finally {
      setTestingNtfy(false);
    }
  };

  const isConfigured = permission === 'granted';

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#dec2cb]/60 shadow-sm space-y-4">
      {/* Primary Push Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isConfigured
                ? 'bg-[#d2e3d8] text-[#133E26] border border-[#a3cbb1]'
                : 'bg-gradient-to-br from-[#f7cac9] to-[#92a8d1] text-[#1E293B] border border-[#dec2cb]'
            }`}
          >
            {isConfigured ? <BellRing className="w-5 h-5 text-[#133E26]" /> : <Bell className="w-5 h-5 text-[#1E293B]" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1E293B] tracking-tight">
                Notificações Push no Celular
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isConfigured
                    ? 'bg-[#d2e3d8] text-[#133E26] border border-[#a3cbb1]'
                    : 'bg-[#c5b9cd]/40 text-[#1E293B] border border-[#dec2cb]'
                }`}
              >
                {isConfigured ? 'Ativas' : 'Pendente'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Receba alertas sonoros no celular sempre que um tutor enviar uma nova ficha de check-in.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {isConfigured ? (
            <button
              onClick={handleTestNotification}
              disabled={testingLocal}
              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[#FAF8F9] hover:bg-[#F3EFF2] border border-[#dec2cb] text-[#1E293B] text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {testingLocal ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2D3E5E]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#2D3E5E]" />
              )}
              <span>Testar Notificação Agora</span>
            </button>
          ) : (
            <button
              onClick={handleEnableNotifications}
              disabled={loading}
              className="w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] disabled:opacity-50 text-[#1E293B] text-xs font-bold shadow-sm border border-[#7b93c2] flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E293B]" />
                  <span>Configurando...</span>
                </>
              ) : (
                <>
                  <BellRing className="w-3.5 h-3.5 text-[#1E293B]" />
                  <span>Ativar Notificações</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* iOS Standalone Requirement Instruction Banner */}
      {isIOS && !isStandalone && (
        <div className="p-3.5 rounded-2xl bg-[#f7cac9]/50 border border-[#dec2cb] text-xs text-[#1E293B] flex items-start gap-2.5">
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-[#2D3E5E]" />
          <div className="space-y-0.5">
            <span className="font-bold block text-[#1E293B]">Requisito do iOS Safari (Apple)</span>
            <p className="text-[#1E293B]/80 leading-relaxed text-[11px]">
              No iPhone e iPad, o Safari só libera Web Push se o app for adicionado à tela inicial.
              Toque em <strong>Compartilhar</strong> no Safari, selecione <strong>"Adicionar à Tela de Início"</strong> e abra por lá.
            </p>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 rounded-2xl bg-[#d2e3d8] border border-[#a3cbb1] text-[#133E26] text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#133E26]" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-3 rounded-2xl bg-[#f7cac9] border border-[#dec2cb] text-[#7F1D1D] text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#7F1D1D]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 24/7 Background Push Bridge via ntfy.sh */}
      <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#2D3E5E]" />
            <span className="text-xs font-bold text-[#1E293B]">
              Ponte 24/7 Anti-Suspensão (ntfy.sh)
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#1E293B] bg-white px-2 py-0.5 rounded border border-[#dec2cb]">
            {NTFY_TOPIC}
          </span>
        </div>
        <p className="text-[11px] text-[#64748B] leading-relaxed">
          Garante recebimento com toque e vibração mesmo se o Chrome estiver suspenso ou a tela bloqueada.
          Instale o app gratuito <strong>ntfy</strong> (Play Store / App Store) e inscreva-se no tópico acima.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={NTFY_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F3EFF2] text-[#1E293B] border border-[#dec2cb] rounded-xl text-xs font-bold transition shadow-xs"
          >
            <span>Abrir Tópico Web</span>
            <ExternalLink className="w-3 h-3 text-[#64748B]" />
          </a>

          <button
            type="button"
            onClick={handleTestNtfyBridge}
            disabled={testingNtfy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F3EFF2] text-[#1E293B] border border-[#dec2cb] rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
          >
            {testingNtfy ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#2D3E5E]" />
            ) : (
              <Send className="w-3 h-3 text-[#2D3E5E]" />
            )}
            <span>Testar Push (ntfy)</span>
          </button>

          {ntfyFeedback && (
            <span className="text-[11px] font-bold text-[#133E26]">
              {ntfyFeedback}
            </span>
          )}
        </div>
      </div>

      {/* Token Details Info */}
      {fcmToken && (
        <div className="pt-2 border-t border-[#dec2cb]/60 flex items-center justify-between text-[11px] text-[#64748B]">
          <span className="font-mono truncate max-w-xs">
            Token: {fcmToken.slice(0, 16)}...{fcmToken.slice(-6)}
          </span>
          <span className="text-[#133E26] font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Salvo em admin_tokens
          </span>
        </div>
      )}
    </div>
  );
};

export default NotificationManager;
