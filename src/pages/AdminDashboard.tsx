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
  doc,
  updateDoc,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
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
  Trash2,
} from 'lucide-react';
import type { Pet, Tutor, Stay } from '@/types/schema';
import { PetDetailModal } from '@/components/PetDetailModal';
import { NotificationManager } from '@/components/NotificationManager';
import { downloadGeneratedIcons } from '@/lib/pwaIconGenerator';
import { sendNtfyAlert } from '@/lib/ntfy';
import { cascadeDeletePet } from '@/utils/petDeletion';

// Exclusive Administrator Account (Xan)
export const ALLOWED_ADMIN_EMAIL = 'xampsbeatz@gmail.com';
const STORAGE_ADMIN_PASSWORD_KEY = 'mikaxan_admin_password';

// Rate Limiting Configurations (3 strikes -> 60s lockout)
const SESSION_ATTEMPTS_KEY = 'mikaxan_admin_failed_attempts';
const SESSION_LOCKOUT_KEY = 'mikaxan_admin_lockout_until';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 1000;

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
  // Auth State (strict empty defaults, zero exposure of admin email)
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLocalAdminBypass, setIsLocalAdminBypass] = useState<boolean>(false);

  // Rate Limiting & Lockout State (3 strikes -> 60s cooldown)
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Cascade Pet Deletion State
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [isDeletingPet, setIsDeletingPet] = useState<boolean>(false);
  const [deleteToast, setDeleteToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Change Password Modal State (Admin panel settings only)
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

  // Force clean sign-out whenever leaving AdminDashboard (on unmount)
  useEffect(() => {
    return () => {
      signOut(auth).catch(() => {});
    };
  }, []);

  // Initialize lockout state from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedLockout = sessionStorage.getItem(SESSION_LOCKOUT_KEY);
    if (storedLockout) {
      const lockoutUntil = parseInt(storedLockout, 10);
      const diff = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (diff > 0) {
        setLockoutSeconds(diff);
        setFailedAttempts(MAX_FAILED_ATTEMPTS);
      } else {
        sessionStorage.removeItem(SESSION_LOCKOUT_KEY);
        sessionStorage.removeItem(SESSION_ATTEMPTS_KEY);
      }
    } else {
      const attempts = parseInt(sessionStorage.getItem(SESSION_ATTEMPTS_KEY) || '0', 10);
      setFailedAttempts(attempts);
    }
  }, []);

  // Active countdown timer when locked out
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          sessionStorage.removeItem(SESSION_LOCKOUT_KEY);
          sessionStorage.removeItem(SESSION_ATTEMPTS_KEY);
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

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

  // Auth Submit Handler with 3-strike rate limit & generic security messages
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setAuthError(null);
    setAuthLoading(true);

    const handleFailure = () => {
      const nextAttempts = failedAttempts + 1;
      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_LOCKOUT_KEY, String(lockoutUntil));
          sessionStorage.setItem(SESSION_ATTEMPTS_KEY, String(nextAttempts));
        }
        setFailedAttempts(nextAttempts);
        setLockoutSeconds(60);
        setAuthError('Muitas tentativas incorretas. Formulário bloqueado temporariamente por 60 segundos.');
      } else {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_ATTEMPTS_KEY, String(nextAttempts));
        }
        setFailedAttempts(nextAttempts);
        setAuthError('Credenciais inválidas ou acesso não autorizado.');
      }
      setAuthLoading(false);
    };

    const normalizedEmail = emailInput.trim().toLowerCase();

    // Verify authorized administrator without disclosing the email address
    if (normalizedEmail !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
      handleFailure();
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
          handleFailure();
          return;
        }
      }

      // Successful login: reset rate limit attempts
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_ATTEMPTS_KEY);
        sessionStorage.removeItem(SESSION_LOCKOUT_KEY);
      }
      setFailedAttempts(0);
      setLockoutSeconds(0);
      setAuthError(null);
    } catch (err: any) {
      console.warn('Firebase login error:', err?.code || err);
      if (isMockMode) {
        const storedPassword = localStorage.getItem(STORAGE_ADMIN_PASSWORD_KEY) || 'xan123456';
        if (passwordInput === storedPassword) {
          setIsLocalAdminBypass(true);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(SESSION_ATTEMPTS_KEY);
            sessionStorage.removeItem(SESSION_LOCKOUT_KEY);
          }
          setFailedAttempts(0);
          setLockoutSeconds(0);
          setAuthError(null);
          return;
        }
      }
      handleFailure();
    } finally {
      setAuthLoading(false);
    }
  };

  // Cascade Pet Deletion Handler
  const handleConfirmDeletePet = async () => {
    if (!petToDelete) return;
    setIsDeletingPet(true);
    try {
      const result = await cascadeDeletePet(petToDelete.id, petToDelete.tutorId);
      if (result.success) {
        setPets((prev) => prev.filter((p) => p.id !== petToDelete.id));
        if (selectedPet?.id === petToDelete.id) {
          setIsDetailModalOpen(false);
          setSelectedPet(null);
        }
        setDeleteToast({
          type: 'success',
          message: `Ficha de "${petToDelete.nameAndBreed}" e ${result.staysDeleted} estadia(s) foram excluídas.${
            result.tutorDeleted ? ' O cadastro do tutor também foi removido.' : ''
          }`,
        });
        setPetToDelete(null);
        setTimeout(() => setDeleteToast(null), 5000);
      } else {
        setDeleteToast({
          type: 'error',
          message: result.error || 'Erro ao excluir ficha do pet.',
        });
      }
    } catch (err: any) {
      setDeleteToast({
        type: 'error',
        message: err?.message || 'Erro inesperado ao excluir pet.',
      });
    } finally {
      setIsDeletingPet(false);
    }
  };

  // Change Local Password Handler (Admin Panel Settings)
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
    setEmailInput('');
    setPasswordInput('');
    setAuthError(null);
  };

  const handleApproveStay = async (stayId: string) => {
    try {
      await updateDoc(doc(db, 'stays', stayId), {
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      playNotificationChime();
      setDeleteToast({
        type: 'success',
        message: 'Hospedagem aprovada com sucesso! Check-in iniciado.',
      });
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (err: any) {
      console.error('Failed to approve stay:', err);
      alert('Erro ao aprovar estadia: ' + (err?.message || 'Erro desconhecido'));
    }
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
  // 1. AUTH GUARD: Hardened Login Screen (Zero Email Exposure, 3-Strike Lockout)
  // ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    const isLocked = lockoutSeconds > 0;

    return (
      <div className="w-full min-h-[80vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white border border-[#dec2cb]/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] text-[#1E293B] border border-[#dec2cb] mx-auto flex items-center justify-center shadow-sm">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-[#1E293B] tracking-tight">Mika &amp; Xan Admin</h2>
            <p className="text-xs text-[#64748B]">
              Área restrita de gestão. Acesso exclusivo com credenciais autorizadas.
            </p>
          </div>

          {isLocked && (
            <div className="p-3.5 rounded-2xl bg-[#f7cac9]/60 border border-[#dec2cb] text-[#7F1D1D] text-xs flex items-start gap-2.5 animate-pulse">
              <Clock className="w-4 h-4 text-[#7F1D1D] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Acesso temporariamente bloqueado</p>
                <p className="mt-0.5">
                  Muitas tentativas falhas. Aguarde <strong>{lockoutSeconds}s</strong> para tentar novamente.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                E-mail de Acesso
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <input
                  type="email"
                  required
                  autoComplete="off"
                  disabled={isLocked || authLoading}
                  placeholder="admin@exemplo.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] disabled:bg-stone-100 disabled:text-stone-400 rounded-xl pl-10 pr-4 py-3 text-base text-[#1E293B] focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                Senha de Acesso
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <input
                  type="password"
                  required
                  autoComplete="off"
                  disabled={isLocked || authLoading}
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] disabled:bg-stone-100 disabled:text-stone-400 rounded-xl pl-10 pr-4 py-3 text-base text-[#1E293B] focus:outline-none transition"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-2xl bg-[#f7cac9]/60 border border-[#dec2cb] text-[#7F1D1D] text-xs flex items-start gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-[#7F1D1D] shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || isLocked}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {isLocked ? (
                <>
                  <Clock className="w-4 h-4 animate-spin text-[#92a8d1]" />
                  <span>Acesso Bloqueado ({lockoutSeconds}s)</span>
                </>
              ) : authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#92a8d1]" />
                  <span>Validando credenciais...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-[#92a8d1]" />
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
        onPetDeleted={(deletedPetId) => {
          setPets((prev) => prev.filter((p) => p.id !== deletedPetId));
          setSelectedPet(null);
          setIsDetailModalOpen(false);
          setDeleteToast({
            type: 'success',
            message: 'Ficha do pet e estadias associadas excluídas com sucesso.',
          });
          setTimeout(() => setDeleteToast(null), 5000);
        }}
      />

      {/* Delete Confirmation Modal */}
      {petToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-[#dec2cb]/60 w-full max-w-md rounded-3xl p-6 shadow-2xl text-[#1E293B] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#f7cac9] text-[#7F1D1D] flex items-center justify-center shrink-0 border border-[#dec2cb]">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-[#1E293B]">
                  Excluir ficha de "{petToDelete.nameAndBreed}"?
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Esta ação é <strong>permanente e irreversível</strong>. Todas as estadias e histórico deste pet serão apagados do Firestore.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-xs space-y-1.5">
              <p className="font-bold text-[#1E293B]">O que será excluído:</p>
              <ul className="list-disc list-inside text-[#64748B] space-y-1">
                <li>Ficha cadastral com os 22 campos e foto</li>
                <li>Todas as estadias (ativas, pendentes e concluídas)</li>
                <li>Se for o único pet da família, o cadastro do tutor também é removido</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingPet}
                onClick={() => setPetToDelete(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[#c5b9cd] bg-white hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingPet}
                onClick={handleConfirmDeletePet}
                className="min-h-[44px] px-5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] active:bg-[#991B1B] disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-red-500/20"
              >
                {isDeletingPet ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excluindo do Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Excluir Definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Action / Delete Toast Notification */}
      {deleteToast && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm ${
            deleteToast.type === 'success'
              ? 'bg-[#d2e3d8] border border-[#a3cbb1] text-[#133E26]'
              : 'bg-[#f7cac9] border border-[#dec2cb] text-[#7F1D1D]'
          }`}
        >
          <div className="flex items-center gap-2">
            {deleteToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#133E26] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#7F1D1D] shrink-0" />
            )}
            <span>{deleteToast.message}</span>
          </div>
          <button
            onClick={() => setDeleteToast(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-[#64748B]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-[#dec2cb]/60 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[#1E293B] space-y-4">
            <div className="flex items-center justify-between border-b border-[#dec2cb]/60 pb-3">
              <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#2D3E5E]" />
                <span>Alterar Senha do Administrador</span>
              </h3>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordFeedback(null);
                }}
                className="p-1 rounded-xl text-[#64748B] hover:text-[#1E293B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1">
                  Nova Senha (mínimo 6 dígitos)
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                />
              </div>

              {changePasswordFeedback && (
                <div
                  className={`p-3 rounded-2xl text-xs flex items-center gap-1.5 font-semibold ${
                    changePasswordFeedback.includes('sucesso')
                      ? 'bg-[#d2e3d8] border border-[#a3cbb1] text-[#133E26]'
                      : 'bg-[#f7cac9] border border-[#dec2cb] text-[#7F1D1D]'
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
                  className="min-h-[44px] px-4 rounded-xl border border-[#c5b9cd] text-[#1E293B] text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] text-xs font-bold transition shadow-sm border border-[#7b93c2]"
                >
                  Salvar Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dashboard Top Bar & Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#dec2cb]/60">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] tracking-tight">
              Painel de Gestão Mika &amp; Xan
            </h2>

            {/* Offline / Synced Real-time Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                hasPendingWrites
                  ? 'bg-[#c5b9cd]/40 text-[#1E293B] border-[#dec2cb] animate-pulse'
                  : isMockMode
                    ? 'bg-[#d2e3d8] text-[#133E26] border-[#a3cbb1]'
                    : isFromCache
                      ? 'bg-[#c5b9cd]/40 text-[#1E293B] border-[#dec2cb]'
                      : 'bg-[#d2e3d8] text-[#133E26] border-[#a3cbb1]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  hasPendingWrites
                    ? 'bg-[#92a8d1]'
                    : isMockMode
                      ? 'bg-[#133E26]'
                      : isFromCache
                        ? 'bg-[#92a8d1]'
                        : 'bg-[#133E26]'
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
          <p className="text-xs text-[#64748B] mt-0.5">
            Admin autenticado: <strong className="text-[#1E293B] font-mono">{ALLOWED_ADMIN_EMAIL}</strong>
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
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#dec2cb] text-[#1E293B] text-xs font-bold transition cursor-pointer shadow-xs"
            title="Disparar alerta de teste instantâneo para o aplicativo ntfy no Android"
          >
            {testingHeaderNtfy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2D3E5E]" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-[#2D3E5E]" />
            )}
            <span className="hidden sm:inline">Testar Push (ntfy)</span>
            <span className="sm:hidden">Push ntfy</span>
          </button>

          <button
            onClick={handleDownloadPwaIcons}
            disabled={downloadingIcons}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#dec2cb] text-[#1E293B] text-xs font-semibold transition shadow-xs"
            title="Baixar os 4 ícones PNG gerados em alta resolução a partir do icon.svg"
          >
            {downloadingIcons ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2D3E5E]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#2D3E5E]" />
            )}
            <span className="hidden sm:inline">Baixar Ícones PNG</span>
            <span className="sm:hidden">Ícones PNG</span>
          </button>

          <button
            onClick={() => setShowChangePasswordModal(true)}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#dec2cb] text-[#1E293B] text-xs font-semibold transition shadow-xs"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#2D3E5E]" />
            <span className="hidden sm:inline">Alterar Senha</span>
          </button>

          <button
            onClick={handleLogout}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#dec2cb] text-[#1E293B] text-xs font-bold transition shadow-xs"
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
        <div className="p-4 rounded-2xl bg-white border border-[#dec2cb]/60 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Hospedados Agora
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#133E26]">{activeCount}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#d2e3d8] text-[#133E26] font-bold border border-[#a3cbb1]">
              Ativos
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#dec2cb]/60 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Check-ins Pendentes
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#1E293B]">{pendingCount}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#c5b9cd]/40 text-[#1E293B] font-bold border border-[#dec2cb]">
              Novos
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#dec2cb]/60 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Total de Pets
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#1E293B]">{pets.length}</span>
            <span className="text-xs text-[#64748B] font-medium">Cadastrados</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#dec2cb]/60 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
            Tutores
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#1E293B]">{tutors.size}</span>
            <span className="text-xs text-[#64748B] font-medium">Famílias</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="p-3 sm:p-4 rounded-3xl bg-white border border-[#dec2cb]/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Buscar por pet, raça, tutor ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[48px] bg-[#FAF8F9] border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto shrink-0 pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
                : 'bg-white text-[#64748B] hover:text-[#1E293B] border border-[#c5b9cd]'
            }`}
          >
            Todos ({pets.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
                : 'bg-white text-[#64748B] hover:text-[#1E293B] border border-[#c5b9cd]'
            }`}
          >
            Ativos ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
                : 'bg-white text-[#64748B] hover:text-[#1E293B] border border-[#c5b9cd]'
            }`}
          >
            Pendentes ({pendingCount})
          </button>
        </div>
      </div>

      {/* Pets Grid */}
      {loadingData ? (
        <div className="p-12 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#92a8d1]" />
          <span>Carregando dados dos pets em tempo real...</span>
        </div>
      ) : filteredPets.length === 0 ? (
        <div className="p-10 text-center rounded-3xl bg-white border border-[#dec2cb]/60 text-xs text-[#64748B] space-y-1.5 shadow-sm">
          <Dog className="w-8 h-8 mx-auto text-[#64748B]" />
          <p className="font-bold text-[#1E293B]">Nenhum pet encontrado para este filtro.</p>
          <p className="text-[#64748B]">
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
                className="bg-white border border-[#dec2cb]/60 hover:border-[#92a8d1] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between transition group"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {pet.photoUrl ? (
                      <img
                        src={pet.photoUrl}
                        alt={pet.nameAndBreed}
                        className="w-14 h-14 rounded-2xl object-cover border border-[#dec2cb] shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-[#c5b9cd]/30 border border-[#dec2cb] text-[#1E293B] flex flex-col items-center justify-center shrink-0">
                        <Dog className="w-6 h-6" />
                        <span className="text-[9px] mt-0.5 font-bold">Sem foto</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <h3 className="text-sm font-black text-[#1E293B] truncate tracking-tight">
                          {pet.nameAndBreed}
                        </h3>
                        {isActive && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#d2e3d8] text-[#133E26] border border-[#a3cbb1] shrink-0">
                            Hospedado
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#c5b9cd]/40 text-[#1E293B] border border-[#dec2cb] shrink-0">
                            Pendente
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#64748B] truncate mt-0.5 font-medium">{pet.ageAndWeight}</p>

                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#64748B]">
                        <Users className="w-3.5 h-3.5 text-[#2D3E5E] shrink-0" />
                        <span className="truncate font-semibold text-[#1E293B]">{tutor?.fullName || 'Tutor sem nome'}</span>
                      </div>
                    </div>
                  </div>

                  {hasAlerts && (
                    <div className="p-2.5 rounded-xl bg-[#f7cac9]/60 border border-[#dec2cb] text-[11px] space-y-1">
                      {pet.allergiesAndProtocol && (
                        <div className="text-[#7F1D1D] font-bold truncate flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Alergia: {pet.allergiesAndProtocol}</span>
                        </div>
                      )}
                      {pet.continuousTreatmentDetails && (
                        <div className="text-[#7F1D1D] font-bold truncate flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>Remédio: {pet.continuousTreatmentDetails}</span>
                        </div>
                      )}
                      {pet.destroysOrIngestsObjects && (
                        <div className="text-[#7F1D1D] font-bold truncate flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          <span>Destrói / ingere objetos</span>
                        </div>
                      )}
                      {!pet.vaccinationUpToDate && (
                        <div className="text-[#7F1D1D] font-bold truncate flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Vacinas desatualizadas</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-[#64748B] space-y-0.5">
                    {pet.foodAmountAndSchedule && (
                      <p className="truncate">
                        🥣 Ração: <span className="text-[#1E293B] font-medium">{pet.foodAmountAndSchedule}</span>
                      </p>
                    )}
                    {latestStay && (
                      <p className="truncate">
                        🗓️ {isActive ? 'Saída prevista' : 'Check-in'}:{' '}
                        <strong className="text-[#1E293B]">
                          {new Date(
                            isActive ? latestStay.checkOutDate : latestStay.checkInDate
                          ).toLocaleDateString('pt-BR')}
                        </strong>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3.5 space-y-2">
                  {isPending && latestStay && (
                    <button
                      type="button"
                      onClick={() => handleApproveStay(latestStay.id)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] border border-[#7b93c2] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#1E293B]" />
                      <span>Aprovar Hospedagem (Iniciar Check-in)</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPet(pet);
                        setIsDetailModalOpen(true);
                      }}
                      className="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#dec2cb] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <span>Ver Ficha (22 Campos)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPetToDelete(pet);
                      }}
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#991B1B] text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer shadow-sm border border-[#FECACA]"
                      title={`Excluir ficha de ${pet.nameAndBreed}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Excluir</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
