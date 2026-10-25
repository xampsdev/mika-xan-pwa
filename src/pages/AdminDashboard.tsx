/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  auth,
  db,
  collection,
  onSnapshot,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  isMockMode,
} from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  Lock,
  Mail,
  KeyRound,
  LogOut,
  Dog,
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Users,
  X,
  Download,
  Radio,
} from 'lucide-react';
import type { Pet, Tutor, Stay } from '@/types/schema';
import { PetDetailModal } from '@/components/PetDetailModal';
import { NotificationManager } from '@/components/NotificationManager';
import { downloadGeneratedIcons } from '@/lib/pwaIconGenerator';
import { sendNtfyAlert } from '@/lib/ntfy';

// Exclusive Administrator Account (Xan)
export const ALLOWED_ADMIN_EMAIL = 'xampsbeatz@gmail.com';
const STORAGE_ADMIN_PASSWORD_KEY = 'mikaxan_admin_password';

// Play dual-tone audio chime (D5 -> A5) via Web Audio API
export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.45);
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

// Trigger OS notification via active Service Worker or native Web Notification
export function triggerSystemNotification(stayId?: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.showNotification('🐾 Novo Check-in Mika & Xan!', {
          body: 'Uma nova ficha de hospedagem acabou de chegar no sistema!',
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [200, 100, 200],
          tag: stayId ? `stay-${stayId}` : `stay-${Date.now()}`,
        } as NotificationOptions);
      })
      .catch((err) => {
        console.warn('SW notification dispatch fallback:', err);
        try {
          new Notification('🐾 Novo Check-in Mika & Xan!', {
            body: 'Uma nova ficha de hospedagem acabou de chegar no sistema!',
            icon: '/icon.svg',
          });
        } catch {}
      });
  } else {
    try {
      new Notification('🐾 Novo Check-in Mika & Xan!', {
        body: 'Uma nova ficha de hospedagem acabou de chegar no sistema!',
        icon: '/icon.svg',
      });
    } catch {}
  }
}

type FilterType = 'all' | 'active' | 'pending';

export const AdminDashboard: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [emailInput, setEmailInput] = useState<string>(ALLOWED_ADMIN_EMAIL);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [isLocalAdminBypass, setIsLocalAdminBypass] = useState<boolean>(false);

  // Change Password Modal State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [changePasswordFeedback, setChangePasswordFeedback] = useState<string | null>(null);
  const [downloadingIcons, setDownloadingIcons] = useState<boolean>(false);
  const [testingHeaderNtfy, setTestingHeaderNtfy] = useState<boolean>(false);

  // Firestore Real-time Collections State
  const [pets, setPets] = useState<Pet[]>([]);
  const [tutors, setTutors] = useState<Map<string, Tutor>>(new Map());
  const [stays, setStays] = useState<Stay[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Sync / Offline Cache Metadata State
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [hasPendingWrites, setHasPendingWrites] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');

  // Selected Pet for Detail Modal
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email?.toLowerCase() === ALLOWED_ADMIN_EMAIL.toLowerCase()) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Stays initial load ref to avoid notifying about historical check-ins on first mount
  const isInitialStaysLoad = useRef<boolean>(true);

  // Listen to Firestore real-time snapshots with { includeMetadataChanges: true }
  useEffect(() => {
    if (!currentUser && !isLocalAdminBypass) return;

    setLoadingData(true);

    const unsubTutors = onSnapshot(
      collection(db, 'tutors'),
      { includeMetadataChanges: true },
      (snapshot: any) => {
        const tutorsMap = new Map<string, Tutor>();
        snapshot.forEach((docSnap: any) => {
          tutorsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Tutor);
        });
        setTutors(tutorsMap);
      },
      (err: any) => console.warn('Tutors snapshot warning:', err)
    );

    const unsubStays = onSnapshot(
      collection(db, 'stays'),
      { includeMetadataChanges: true },
      (snapshot: any) => {
        // Only trigger alerts for live additions after initial snapshot
        if (!isInitialStaysLoad.current && snapshot.docChanges) {
          try {
            const changes = typeof snapshot.docChanges === 'function' ? snapshot.docChanges() : [];
            changes.forEach((change: any) => {
              if (change.type === 'added') {
                const stayData = change.doc.data();
                if (stayData?.status === 'pending') {
                  playNotificationChime();
                  triggerSystemNotification(change.doc.id);
                }
              }
            });
          } catch (changeErr) {
            console.warn('Stay docChanges warning:', changeErr);
          }
        }
        isInitialStaysLoad.current = false;

        const staysList: Stay[] = [];
        snapshot.forEach((docSnap: any) => {
          staysList.push({ id: docSnap.id, ...docSnap.data() } as Stay);
        });
        setStays(staysList);
      },
      (err: any) => console.warn('Stays snapshot warning:', err)
    );

    const unsubPets = onSnapshot(
      collection(db, 'pets'),
      { includeMetadataChanges: true },
      (snapshot: any) => {
        setIsFromCache(Boolean(snapshot.metadata?.fromCache));
        setHasPendingWrites(Boolean(snapshot.metadata?.hasPendingWrites));

        const petsList: Pet[] = [];
        snapshot.forEach((docSnap: any) => {
          petsList.push({ id: docSnap.id, ...docSnap.data() } as Pet);
        });
        setPets(petsList);
        setLoadingData(false);
      },
      (err: any) => {
        console.warn('Pets snapshot warning:', err);
        setLoadingData(false);
      }
    );

    return () => {
      unsubTutors();
      unsubStays();
      unsubPets();
    };
  }, [currentUser, isLocalAdminBypass]);

  // Auth Submit Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setResetMessage(null);
    setAuthLoading(true);

    const normalizedEmail = emailInput.trim().toLowerCase();
    if (normalizedEmail !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
      setAuthError('Acesso restrito exclusivamente ao administrador (Xan).');
      setAuthLoading(false);
      return;
    }

    try {
      if (!isMockMode) {
        await signInWithEmailAndPassword(auth, normalizedEmail, passwordInput);
      } else {
        const storedPassword = localStorage.getItem(STORAGE_ADMIN_PASSWORD_KEY);
        if (!storedPassword) {
          const chosenPassword = passwordInput || 'xan123456';
          localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, chosenPassword);
          setIsLocalAdminBypass(true);
        } else if (passwordInput === storedPassword || passwordInput === 'xan123456') {
          setIsLocalAdminBypass(true);
        } else {
          setAuthError('Senha incorreta para xampsbeatz@gmail.com.');
        }
      }
    } catch (err: any) {
      console.warn('Firebase login error:', err?.code || err);
      if (isMockMode) {
        const storedPassword = localStorage.getItem(STORAGE_ADMIN_PASSWORD_KEY) || 'xan123456';
        if (passwordInput === storedPassword) {
          setIsLocalAdminBypass(true);
        } else {
          setAuthError('Senha incorreta para xampsbeatz@gmail.com.');
        }
      } else {
        setAuthError(
          'Email ou senha inválidos no Firebase Auth. Utilize a opção "Esqueci / Definir Senha" abaixo se necessário.'
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Password Reset Handler
  const handleForgotPassword = async () => {
    setAuthError(null);
    setResetLoading(true);
    setResetMessage(null);

    try {
      await sendPasswordResetEmail(auth, ALLOWED_ADMIN_EMAIL);
      setResetMessage(
        `E-mail de redefinição enviado com sucesso para ${ALLOWED_ADMIN_EMAIL}. Verifique sua caixa de entrada e spam.`
      );
    } catch (err: any) {
      console.warn('Password reset notice:', err);
      if (isMockMode) {
        setResetMessage(
          `Modo Preview: Link de redefinição gerado para ${ALLOWED_ADMIN_EMAIL}. A senha padrão local é "xan123456".`
        );
      } else {
        setAuthError('Falha ao enviar e-mail de redefinição de senha.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  // Change Local Password Handler
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordFeedback(null);

    if (newPassword.length < 6) {
      setChangePasswordFeedback('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordFeedback('As senhas não coincidem.');
      return;
    }

    localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, newPassword);
    setChangePasswordFeedback('Senha alterada com sucesso!');
    setTimeout(() => {
      setShowChangePasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setChangePasswordFeedback(null);
    }, 1200);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // non-blocking
    }
    setIsLocalAdminBypass(false);
    setCurrentUser(null);
  };

  const handleDownloadPwaIcons = async () => {
    setDownloadingIcons(true);
    try {
      await downloadGeneratedIcons();
    } catch (err) {
      console.error('Failed to download icons:', err);
      alert('Falha ao gerar e baixar ícones.');
    } finally {
      setDownloadingIcons(false);
    }
  };

  // PetId -> Current Active or Pending Stay
  const petLatestStayMap = useMemo(() => {
    const map = new Map<string, Stay>();
    const sorted = [...stays].sort(
      (a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
    );

    sorted.forEach((stay) => {
      if (!map.has(stay.petId)) {
        map.set(stay.petId, stay);
      } else {
        const existing = map.get(stay.petId)!;
        if (existing.status === 'completed' && (stay.status === 'active' || stay.status === 'pending')) {
          map.set(stay.petId, stay);
        }
      }
    });
    return map;
  }, [stays]);

  // Filtered & Searched Pets
  const filteredPets = useMemo(() => {
    return pets.filter((pet) => {
      const tutor = tutors.get(pet.tutorId);
      const stay = petLatestStayMap.get(pet.id);

      if (statusFilter === 'active' && stay?.status !== 'active') return false;
      if (statusFilter === 'pending' && stay?.status !== 'pending') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPetName = pet.nameAndBreed?.toLowerCase().includes(q);
        const matchesTutorName = tutor?.fullName?.toLowerCase().includes(q);
        const matchesPhone = tutor?.phoneDDD?.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchesNotes = pet.generalNotes?.toLowerCase().includes(q);
        return matchesPetName || matchesTutorName || matchesPhone || matchesNotes;
      }

      return true;
    });
  }, [pets, tutors, petLatestStayMap, statusFilter, searchQuery]);

  const activeCount = useMemo(
    () => stays.filter((s) => s.status === 'active').length,
    [stays]
  );
  const pendingCount = useMemo(
    () => stays.filter((s) => s.status === 'pending').length,
    [stays]
  );

  const isAuthenticated = Boolean(currentUser || isLocalAdminBypass);

  // ─────────────────────────────────────────────────────────────
  // 1. AUTH GUARD: Login Screen (Restricted to Xan)
  // ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-[80vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white border border-[#E7E2D8] rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#D96B43] text-white mx-auto flex items-center justify-center shadow-sm shadow-[#D96B43]/30">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-[#1C1917] tracking-tight">Mika &amp; Xan Admin</h2>
            <p className="text-xs text-[#78716C]">
              Acesso restrito exclusivamente ao administrador <strong>Xan</strong> (
              <span className="text-[#D96B43] font-mono font-semibold">{ALLOWED_ADMIN_EMAIL}</span>).
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider mb-1.5">
                E-mail do Administrador
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
                <input
                  type="email"
                  required
                  placeholder={ALLOWED_ADMIN_EMAIL}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl pl-10 pr-4 py-3 text-base text-[#1C1917] font-mono focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider">
                  Senha de Acesso
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-xs text-[#D96B43] hover:underline font-semibold flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Esqueci a Senha</span>
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl pl-10 pr-4 py-3 text-base text-[#1C1917] focus:outline-none transition"
                />
              </div>
              {isMockMode && (
                <p className="text-[11px] text-[#78716C] mt-1.5">
                  Preview local: senha padrão <code className="text-[#D96B43] font-mono font-bold">xan123456</code>
                </p>
              )}
            </div>

            {authError && (
              <div className="p-3 rounded-2xl bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#991B1B] shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {resetMessage && (
              <div className="p-3 rounded-2xl bg-[#E8F0EA] border border-[#C5DDCB] text-[#245235] text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#245235] shrink-0 mt-0.5" />
                <span>{resetMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] active:bg-[#AA4D29] disabled:opacity-50 text-white font-bold text-sm shadow-sm shadow-[#D96B43]/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando credenciais...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Acessar Painel Mika &amp; Xan</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. AUTHENTICATED DASHBOARD VIEW
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-5">
      {/* Detail Modal Component */}
      <PetDetailModal
        pet={selectedPet}
        tutor={selectedPet ? tutors.get(selectedPet.tutorId) || null : null}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedPet(null);
        }}
        onPetUpdated={(updatedPet) => {
          setPets((prev) => prev.map((p) => (p.id === updatedPet.id ? updatedPet : p)));
          setSelectedPet(updatedPet);
        }}
      />

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-[#E7E2D8] w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[#1C1917] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E2D8] pb-3">
              <h3 className="text-base font-bold text-[#1C1917] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#D96B43]" />
                <span>Alterar Senha do Administrador</span>
              </h3>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordFeedback(null);
                }}
                className="p-1 rounded-xl text-[#78716C] hover:text-[#1C1917]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider mb-1">
                  Nova Senha (mínimo 6 dígitos)
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] rounded-xl px-3.5 py-2.5 text-base text-[#1C1917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] rounded-xl px-3.5 py-2.5 text-base text-[#1C1917] focus:outline-none"
                />
              </div>

              {changePasswordFeedback && (
                <div
                  className={`p-3 rounded-2xl text-xs flex items-center gap-1.5 ${
                    changePasswordFeedback.includes('sucesso')
                      ? 'bg-[#E8F0EA] border border-[#C5DDCB] text-[#245235]'
                      : 'bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B]'
                  }`}
                >
                  {changePasswordFeedback.includes('sucesso') ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{changePasswordFeedback}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#E7E2D8] text-[#78716C] text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold transition shadow-sm"
                >
                  Salvar Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dashboard Top Bar & Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E7E2D8]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] tracking-tight">
              Painel de Gestão Mika &amp; Xan
            </h2>

            {/* Offline / Synced Real-time Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                hasPendingWrites
                  ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] animate-pulse'
                  : isMockMode
                    ? 'bg-[#E8F0EA] text-[#245235] border-[#C5DDCB]'
                    : isFromCache
                      ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                      : 'bg-[#E8F0EA] text-[#245235] border-[#C5DDCB]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  hasPendingWrites
                    ? 'bg-[#D97706]'
                    : isMockMode
                      ? 'bg-[#245235]'
                      : isFromCache
                        ? 'bg-[#D97706]'
                        : 'bg-[#245235]'
                }`}
              />
              <span>
                {hasPendingWrites
                  ? 'Gravando offline...'
                  : isMockMode
                    ? 'Offline / Mock Store'
                    : isFromCache
                      ? 'Cache Local (Offline)'
                      : 'Sincronizado'}
              </span>
            </div>
          </div>
          <p className="text-xs text-[#78716C] mt-0.5">
            Admin autenticado: <strong className="text-[#1C1917] font-mono">{ALLOWED_ADMIN_EMAIL}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={async () => {
              setTestingHeaderNtfy(true);
              try {
                await sendNtfyAlert('Teste Mika & Xan', 'O alerta no seu Android está funcionando 100%!');
              } finally {
                setTestingHeaderNtfy(false);
              }
            }}
            disabled={testingHeaderNtfy}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF7F2] border border-[#E7E2D8] text-[#D96B43] hover:text-[#C25B34] text-xs font-semibold transition cursor-pointer"
            title="Disparar alerta de teste instantâneo para o aplicativo ntfy no Android"
          >
            {testingHeaderNtfy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D96B43]" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-[#D96B43]" />
            )}
            <span className="hidden sm:inline">Testar Push (ntfy)</span>
            <span className="sm:hidden">Push ntfy</span>
          </button>

          <button
            onClick={handleDownloadPwaIcons}
            disabled={downloadingIcons}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF7F2] border border-[#E7E2D8] text-[#78716C] hover:text-[#1C1917] text-xs font-semibold transition"
            title="Baixar os 4 ícones PNG gerados em alta resolução a partir do icon.svg"
          >
            {downloadingIcons ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D96B43]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#D96B43]" />
            )}
            <span className="hidden sm:inline">Baixar Ícones PNG</span>
            <span className="sm:hidden">Ícones PNG</span>
          </button>

          <button
            onClick={() => setShowChangePasswordModal(true)}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF7F2] border border-[#E7E2D8] text-[#78716C] hover:text-[#1C1917] text-xs font-semibold transition"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#D96B43]" />
            <span className="hidden sm:inline">Alterar Senha</span>
          </button>

          <button
            onClick={handleLogout}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white hover:bg-[#FAF7F2] border border-[#E7E2D8] text-[#78716C] hover:text-[#1C1917] text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Push Notification Manager */}
      <NotificationManager adminEmail={ALLOWED_ADMIN_EMAIL} />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-[#E7E2D8] shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716C] block">
            Hospedados Agora
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#245235]">{activeCount}</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#E8F0EA] text-[#245235] font-bold border border-[#C5DDCB]">
              Ativos
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E7E2D8] shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716C] block">
            Check-ins Pendentes
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#D96B43]">{pendingCount}</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] font-bold border border-[#FDE68A]">
              Novos
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E7E2D8] shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716C] block">
            Total de Pets
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#1C1917]">{pets.length}</span>
            <span className="text-xs text-[#78716C]">Cadastrados</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E7E2D8] shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716C] block">
            Tutores
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#1C1917]">{tutors.size}</span>
            <span className="text-xs text-[#78716C]">Famílias</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="p-3 sm:p-4 rounded-3xl bg-white border border-[#E7E2D8] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
          <input
            type="text"
            placeholder="Buscar por pet, raça, tutor ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto shrink-0 pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-[#D96B43] text-white shadow-sm'
                : 'bg-[#FAF7F2] text-[#78716C] hover:text-[#1C1917] border border-[#E7E2D8]'
            }`}
          >
            Todos ({pets.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              statusFilter === 'active'
                ? 'bg-[#D96B43] text-white shadow-sm'
                : 'bg-[#FAF7F2] text-[#78716C] hover:text-[#1C1917] border border-[#E7E2D8]'
            }`}
          >
            Ativos ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              statusFilter === 'pending'
                ? 'bg-[#D96B43] text-white shadow-sm'
                : 'bg-[#FAF7F2] text-[#78716C] hover:text-[#1C1917] border border-[#E7E2D8]'
            }`}
          >
            Pendentes ({pendingCount})
          </button>
        </div>
      </div>

      {/* Pets Grid */}
      {loadingData ? (
        <div className="p-12 text-center text-xs text-[#78716C] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#D96B43]" />
          <span>Carregando dados dos pets em tempo real...</span>
        </div>
      ) : filteredPets.length === 0 ? (
        <div className="p-10 text-center rounded-3xl bg-white border border-[#E7E2D8] text-xs text-[#78716C] space-y-1.5 shadow-sm">
          <Dog className="w-8 h-8 mx-auto text-[#78716C]" />
          <p className="font-bold text-[#1C1917]">Nenhum pet encontrado para este filtro.</p>
          <p className="text-[#78716C]">
            {searchQuery
              ? 'Tente ajustar os termos da busca.'
              : 'Novos cadastros feitos pelos tutores aparecerão aqui automaticamente.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredPets.map((pet) => {
            const tutor = tutors.get(pet.tutorId);
            const latestStay = petLatestStayMap.get(pet.id);
            const isActive = latestStay?.status === 'active';
            const isPending = latestStay?.status === 'pending';

            const hasAlerts =
              Boolean(pet.allergiesAndProtocol?.trim()) ||
              Boolean(pet.continuousTreatmentDetails?.trim()) ||
              pet.destroysOrIngestsObjects ||
              !pet.vaccinationUpToDate;

            return (
              <div
                key={pet.id}
                className="bg-white border border-[#E7E2D8] hover:border-[#D96B43] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between transition group"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {pet.photoUrl ? (
                      <img
                        src={pet.photoUrl}
                        alt={pet.nameAndBreed}
                        className="w-14 h-14 rounded-2xl object-cover border border-[#E7E2D8] shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-[#E8F0EA] border border-[#C5DDCB] text-[#245235] flex flex-col items-center justify-center shrink-0">
                        <Dog className="w-6 h-6" />
                        <span className="text-[9px] mt-0.5">Sem foto</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <h3 className="text-sm font-black text-[#1C1917] truncate tracking-tight">
                          {pet.nameAndBreed}
                        </h3>
                        {isActive && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB] shrink-0">
                            Hospedado
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shrink-0">
                            Pendente
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#78716C] truncate mt-0.5">{pet.ageAndWeight}</p>

                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#78716C]">
                        <Users className="w-3.5 h-3.5 text-[#D96B43] shrink-0" />
                        <span className="truncate font-medium text-[#1C1917]">{tutor?.fullName || 'Tutor sem nome'}</span>
                      </div>
                    </div>
                  </div>

                  {hasAlerts && (
                    <div className="p-2.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[11px] space-y-1">
                      {pet.allergiesAndProtocol && (
                        <div className="text-[#991B1B] font-medium truncate flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Alergia: {pet.allergiesAndProtocol}</span>
                        </div>
                      )}
                      {pet.continuousTreatmentDetails && (
                        <div className="text-[#92400E] font-medium truncate flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>Remédio: {pet.continuousTreatmentDetails}</span>
                        </div>
                      )}
                      {pet.destroysOrIngestsObjects && (
                        <div className="text-[#991B1B] font-medium truncate flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          <span>Destrói / ingere objetos</span>
                        </div>
                      )}
                      {!pet.vaccinationUpToDate && (
                        <div className="text-[#991B1B] font-semibold truncate flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Vacinas desatualizadas</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-[#78716C] space-y-0.5">
                    {pet.foodAmountAndSchedule && (
                      <p className="truncate">
                        🥣 Ração: <span className="text-[#1C1917]">{pet.foodAmountAndSchedule}</span>
                      </p>
                    )}
                    {latestStay && (
                      <p className="truncate">
                        🗓️ {isActive ? 'Saída prevista' : 'Check-in'}:{' '}
                        <strong className="text-[#1C1917]">
                          {new Date(
                            isActive ? latestStay.checkOutDate : latestStay.checkInDate
                          ).toLocaleDateString('pt-BR')}
                        </strong>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedPet(pet);
                    setIsDetailModalOpen(true);
                  }}
                  className="mt-3.5 w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FAF7F2] hover:bg-[#D96B43] hover:text-white border border-[#E7E2D8] text-[#1C1917] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <span>Ver Ficha Completa (22 Campos)</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
