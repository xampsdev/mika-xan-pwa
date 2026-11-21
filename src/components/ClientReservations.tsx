/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  deepCleanUndefined,
} from '@/lib/firebase';
import {
  Calendar,
  Clock,
  Dog,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  PlusCircle,
  Calculator,
  ArrowRight,
} from 'lucide-react';
import { calculateStayPricing, formatBRL } from '@/lib/pricingCalculator';
import type { Tutor, Pet, Stay, StayStatus } from '@/types/schema';

type ReservationSegment = 'pending' | 'active' | 'completed';

export interface ClientReservationsProps {
  tutor: Tutor;
  pets: Pet[];
  onNewBooking: () => void;
  onSwitchPhone: () => void;
}

/**
 * Splits a stored ISO datetime string (e.g., "2026-12-20T09:00" or "2026-12-20T09:00:00")
 * into date ("YYYY-MM-DD") and time ("HH:mm") parts for native date/time inputs.
 */
function splitDateTimeParts(isoStr: string | undefined | null): { date: string; time: string } {
  if (!isoStr || typeof isoStr !== 'string') {
    return { date: '', time: '09:00' };
  }
  const trimmed = isoStr.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/);
  if (match && !/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return {
      date: match[1],
      time: match[2] || '09:00',
    };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '09:00' };
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

/**
 * Parses a stay date/datetime string into a local Date object for future-check comparison.
 */
function parseStayDateTime(isoStr: string | undefined | null): Date | null {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const trimmed = isoStr.trim();
  if (!trimmed) return null;
  // Normalize "YYYY-MM-DD" without time to end of morning or start of day locally
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats an ISO date/datetime string into readable Brazilian Portuguese format ("DD/MM/YYYY às HH:mm").
 */
function formatDateTimeBR(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const { date, time } = splitDateTimeParts(isoStr);
  if (!date) return isoStr;
  const [y, m, d] = date.split('-');
  return time ? `${d}/${m}/${y} às ${time}` : `${d}/${m}/${y}`;
}

/**
 * Resolves the effective dog count for a stay (defaults to 1 for legacy records).
 */
function getStayDogCount(stay: Stay): number {
  if (typeof stay.dogCount === 'number' && Number.isFinite(stay.dogCount) && stay.dogCount >= 1) {
    return Math.floor(stay.dogCount);
  }
  if (
    typeof stay.pricingBreakdown?.dogCount === 'number' &&
    Number.isFinite(stay.pricingBreakdown.dogCount) &&
    stay.pricingBreakdown.dogCount >= 1
  ) {
    return Math.floor(stay.pricingBreakdown.dogCount);
  }
  if (Array.isArray(stay.petIds) && stay.petIds.length > 0) {
    return stay.petIds.length;
  }
  return 1;
}

/**
 * Strictly determines whether a stay is eligible for client self-service editing:
 * status must be 'pending' AND check-in timestamp must be strictly in the future.
 */
function canClientEditStay(stay: Stay): boolean {
  if (stay.status !== 'pending') return false;
  const checkIn = parseStayDateTime(stay.checkInDate);
  if (!checkIn) return false;
  return checkIn.getTime() > Date.now();
}

export const ClientReservations: React.FC<ClientReservationsProps> = ({
  tutor,
  pets,
  onNewBooking,
  onSwitchPhone,
}) => {
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<ReservationSegment>('pending');
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Edit Modal State
  const [editingStay, setEditingStay] = useState<Stay | null>(null);
  const [editCheckInDate, setEditCheckInDate] = useState<string>('');
  const [editCheckInTime, setEditCheckInTime] = useState<string>('09:00');
  const [editCheckOutDate, setEditCheckOutDate] = useState<string>('');
  const [editCheckOutTime, setEditCheckOutTime] = useState<string>('17:00');
  const [editValidationError, setEditValidationError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const petsByIdMap = useMemo(() => {
    const map = new Map<string, Pet>();
    pets.forEach((p) => map.set(p.id, p));
    return map;
  }, [pets]);

  const fetchClientStays = useCallback(async () => {
    if (!tutor?.id) {
      setStays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);
    try {
      // Single-field equality filter on tutorId avoids composite index requirements;
      // chronological sorting is handled client-side inside segmentedStays.
      const staysQuery = query(collection(db, 'stays'), where('tutorId', '==', tutor.id));
      const snap = await getDocs(staysQuery);
      const loaded: Stay[] = [];
      snap.forEach((docSnap: any) => {
        loaded.push({ id: docSnap.id, ...docSnap.data() } as Stay);
      });
      setStays(loaded);
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'permission-denied') {
        // Live Firebase Console rules still restrict /stays reads to isAdmin() until firestore.rules is published
        console.warn('Firestore Rules pending publish for /stays:', error?.message || error);
        setFetchError(
          'Permissão pendente no Firebase Console: publique o arquivo firestore.rules atualizado (Firestore Database → Regras → Publicar) para liberar a leitura de reservas pelo cliente.'
        );
      } else if (code === 'failed-precondition') {
        console.error('Firestore Fetch Error:', error);
        setFetchError(
          'Índice composto do Firestore necessário. Abra o Console do navegador para acessar o link de criação.'
        );
      } else {
        console.error('Firestore Fetch Error:', error);
        setFetchError('Não foi possível carregar suas reservas no momento. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }, [tutor?.id]);

  useEffect(() => {
    fetchClientStays();
  }, [fetchClientStays]);

  // Segment reservations into Futuras (pending), Em andamento (active), and Concluídas (completed)
  const segmentedStays = useMemo(() => {
    const pending: Stay[] = [];
    const active: Stay[] = [];
    const completed: Stay[] = [];

    stays.forEach((stay) => {
      if (stay.status === 'pending') pending.push(stay);
      else if (stay.status === 'active') active.push(stay);
      else if (stay.status === 'completed') completed.push(stay);
    });

    pending.sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
    active.sort((a, b) => (a.checkOutDate || '').localeCompare(b.checkOutDate || ''));
    completed.sort((a, b) => (b.checkInDate || '').localeCompare(a.checkInDate || ''));

    return { pending, active, completed };
  }, [stays]);

  const displayedStays = segmentedStays[activeSegment];

  const resolveStayPetNames = (stay: Stay): string[] => {
    if (Array.isArray(stay.petIds) && stay.petIds.length > 0) {
      const resolved = stay.petIds
        .map((id, idx) => petsByIdMap.get(id)?.nameAndBreed || stay.petNames?.[idx])
        .filter((name): name is string => Boolean(name && name.trim()));
      if (resolved.length > 0) return resolved;
    }
    if (Array.isArray(stay.petNames) && stay.petNames.length > 0) {
      return stay.petNames.filter(Boolean);
    }
    const primary = petsByIdMap.get(stay.petId);
    if (primary?.nameAndBreed) return [primary.nameAndBreed];
    return ['Pet cadastrado'];
  };

  // Open Edit Modal pre-filled with the stay's current checkIn / checkOut datetimes
  const handleOpenEditModal = (stay: Stay) => {
    if (!canClientEditStay(stay)) return;
    const inParts = splitDateTimeParts(stay.checkInDate);
    const outParts = splitDateTimeParts(stay.checkOutDate);

    setEditingStay(stay);
    setEditCheckInDate(inParts.date);
    setEditCheckInTime(inParts.time);
    setEditCheckOutDate(outParts.date);
    setEditCheckOutTime(outParts.time);
    setEditValidationError(null);
  };

  const handleCloseEditModal = () => {
    if (savingEdit) return;
    setEditingStay(null);
    setEditValidationError(null);
  };

  // Dynamic Price Recalculation whenever client updates dates/times inside Edit Modal
  const editingDogCount = editingStay ? getStayDogCount(editingStay) : 1;

  const recalculatedPricing = useMemo(() => {
    if (!editingStay) return null;
    return calculateStayPricing(
      editCheckInDate,
      editCheckInTime,
      editCheckOutDate,
      editCheckOutTime,
      editingDogCount
    );
  }, [
    editingStay,
    editCheckInDate,
    editCheckInTime,
    editCheckOutDate,
    editCheckOutTime,
    editingDogCount,
  ]);

  const checkInIsInFuture = useMemo(() => {
    if (!editCheckInDate || !editCheckInTime) return false;
    const dt = new Date(`${editCheckInDate}T${editCheckInTime}:00`);
    return !Number.isNaN(dt.getTime()) && dt.getTime() > Date.now();
  }, [editCheckInDate, editCheckInTime]);

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStay || !canClientEditStay(editingStay)) return;
    setEditValidationError(null);

    if (!editCheckInDate || !editCheckInTime || !editCheckOutDate || !editCheckOutTime) {
      setEditValidationError('Preencha a data e o horário de entrada e saída.');
      return;
    }

    const nextCheckIn = new Date(`${editCheckInDate}T${editCheckInTime}:00`);
    const nextCheckOut = new Date(`${editCheckOutDate}T${editCheckOutTime}:00`);

    if (Number.isNaN(nextCheckIn.getTime()) || Number.isNaN(nextCheckOut.getTime())) {
      setEditValidationError('Informe datas e horários válidos.');
      return;
    }

    if (nextCheckIn.getTime() <= Date.now()) {
      setEditValidationError('A nova data/horário de entrada precisa ser no futuro.');
      return;
    }

    if (nextCheckOut.getTime() <= nextCheckIn.getTime()) {
      setEditValidationError('A data/horário de saída deve ser posterior à entrada.');
      return;
    }

    if (!recalculatedPricing) {
      setEditValidationError('Não foi possível calcular o valor para o período informado.');
      return;
    }

    setSavingEdit(true);
    try {
      const nextCheckInCombined = `${editCheckInDate}T${editCheckInTime}`;
      const nextCheckOutCombined = `${editCheckOutDate}T${editCheckOutTime}`;

      const cleanedPricingBreakdown = deepCleanUndefined({
        ...recalculatedPricing,
        cyclesBreakdown: recalculatedPricing.cyclesBreakdown.map((c) => ({
          ...c,
          holidayName: c.holidayName ?? null,
        })),
      });

      const updatePayload = deepCleanUndefined({
        checkInDate: nextCheckInCombined,
        checkOutDate: nextCheckOutCombined,
        estimatedTotal: recalculatedPricing.totalPrice,
        finalTotal: recalculatedPricing.totalPrice,
        totalPrice: recalculatedPricing.totalPrice,
        totalHours: recalculatedPricing.totalHours,
        pricingBreakdown: cleanedPricingBreakdown,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'stays', editingStay.id), updatePayload);

      // Update local state immediately so UI reflects the new dates & total without extra reads
      setStays((prev) =>
        prev.map((s) =>
          s.id === editingStay.id
            ? {
                ...s,
                checkInDate: nextCheckInCombined,
                checkOutDate: nextCheckOutCombined,
                estimatedTotal: recalculatedPricing.totalPrice,
                finalTotal: recalculatedPricing.totalPrice,
                totalPrice: recalculatedPricing.totalPrice,
                totalHours: recalculatedPricing.totalHours,
                pricingBreakdown: cleanedPricingBreakdown,
              }
            : s
        )
      );

      setEditingStay(null);
      setFeedbackToast({
        type: 'success',
        message: `Reserva atualizada com sucesso! Novo total: ${formatBRL(recalculatedPricing.totalPrice)}.`,
      });
      setTimeout(() => setFeedbackToast(null), 5000);
    } catch (error: any) {
      console.error('Firestore Update Error:', error);
      if (error?.code === 'permission-denied') {
        setEditValidationError(
          'Permissão negada ao atualizar a reserva. Publique o arquivo firestore.rules atualizado no Firebase Console.'
        );
      } else {
        setEditValidationError(
          'Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.'
        );
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="bg-white border border-[#dec2cb]/60 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5 my-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#dec2cb]/60 pb-4 gap-2">
        <div>
          <p className="text-xs font-bold text-[#2D3E5E]">Minhas Reservas</p>
          <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] mt-0.5 tracking-tight">
            Olá, {tutor.fullName}!
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            WhatsApp:{' '}
            <strong className="text-[#1E293B] font-mono">{tutor.phoneDDD}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={onSwitchPhone}
          className="text-xs font-bold text-[#1E293B] underline underline-offset-2 hover:opacity-80 self-start sm:self-auto min-h-[44px] flex items-center cursor-pointer"
        >
          Trocar Telefone
        </button>
      </div>

      {/* Client Portal Switcher: Novo Check-in | Minhas Reservas */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#F3EFF2] border border-[#dec2cb]/70">
        <button
          type="button"
          onClick={onNewBooking}
          className="min-h-[44px] px-3 rounded-xl bg-transparent hover:bg-white/70 text-[#475569] hover:text-[#1E293B] border border-transparent text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition cursor-pointer"
        >
          <Dog className="w-4 h-4 shrink-0" />
          <span>Novo Check-in</span>
        </button>
        <button
          type="button"
          aria-current="page"
          className="min-h-[44px] px-3 rounded-xl bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>Minhas Reservas</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackToast && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border ${
            feedbackToast.type === 'success'
              ? 'bg-[#d2e3d8] border-[#a3cbb1] text-[#133E26]'
              : 'bg-[#f7cac9]/70 border-[#dec2cb] text-[#7F1D1D]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            aria-label="Fechar aviso"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Status Tabs: Futuras | Em andamento | Concluídas */}
      <div
        role="tablist"
        aria-label="Filtrar reservas por status"
        className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#F3EFF2] border border-[#dec2cb]/70"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'pending'}
          onClick={() => setActiveSegment('pending')}
          className={`min-h-[44px] px-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer ${
            activeSegment === 'pending'
              ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
              : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
          }`}
        >
          <span>Futuras</span>
          <span className="tabular-nums">({segmentedStays.pending.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'active'}
          onClick={() => setActiveSegment('active')}
          className={`min-h-[44px] px-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer ${
            activeSegment === 'active'
              ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
              : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
          }`}
        >
          <span>Em andamento</span>
          <span className="tabular-nums">({segmentedStays.active.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'completed'}
          onClick={() => setActiveSegment('completed')}
          className={`min-h-[44px] px-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer ${
            activeSegment === 'completed'
              ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2] shadow-sm'
              : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
          }`}
        >
          <span>Concluídas</span>
          <span className="tabular-nums">({segmentedStays.completed.length})</span>
        </button>
      </div>

      {/* Reservations List */}
      {loading ? (
        <div className="py-10 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#92a8d1]" />
          <span>Buscando suas reservas...</span>
        </div>
      ) : fetchError ? (
        <div className="p-4 rounded-2xl bg-[#f7cac9]/50 border border-[#dec2cb] text-xs text-[#7F1D1D] space-y-3 text-center">
          <p className="font-bold">{fetchError}</p>
          <button
            type="button"
            onClick={fetchClientStays}
            className="min-h-[44px] px-4 rounded-xl bg-white border border-[#dec2cb] text-[#1E293B] font-bold text-xs cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      ) : displayedStays.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#f7cac9]/40 border border-[#dec2cb] text-[#2D3E5E] mx-auto flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-[#1E293B]">
            {activeSegment === 'pending' && 'Nenhuma reserva futura agendada'}
            {activeSegment === 'active' && 'Nenhuma hospedagem em andamento'}
            {activeSegment === 'completed' && 'Nenhuma hospedagem concluída ainda'}
          </p>
          <p className="text-xs text-[#64748B]">
            {activeSegment === 'pending'
              ? 'Quando você agendar uma estadia, poderá acompanhar e ajustar datas por aqui.'
              : 'As estadias nesta categoria aparecerão automaticamente nesta lista.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedStays.map((stay) => {
            const petNames = resolveStayPetNames(stay);
            const dogCount = getStayDogCount(stay);
            const editable = canClientEditStay(stay);
            const displayPrice =
              stay.finalTotal ?? stay.totalPrice ?? stay.estimatedTotal ?? 0;
            const statusInfo = getClientStatusMeta(stay.status);

            return (
              <article
                key={stay.id}
                className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/70 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D3E5E]">
                      <Dog className="w-3.5 h-3.5 shrink-0" />
                      <span className="tabular-nums">
                        {dogCount} {dogCount === 1 ? 'cão' : 'cães'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={statusInfo.textClass}>{statusInfo.label}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-[#1E293B] mt-0.5 leading-snug">
                      {petNames.join(', ')}
                    </h3>
                  </div>

                  {displayPrice > 0 && (
                    <div className="text-right shrink-0">
                      <span className="block text-[11px] text-[#64748B] font-medium">
                        Total estimado
                      </span>
                      <span className="text-base font-black text-[#1E293B] tabular-nums">
                        {formatBRL(displayPrice)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-[#dec2cb]/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#1E293B]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#2D3E5E] shrink-0" />
                    <div className="tabular-nums">
                      <span className="text-[#64748B] font-medium">Entrada: </span>
                      <strong className="font-bold">{formatDateTimeBR(stay.checkInDate)}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#2D3E5E] shrink-0" />
                    <div className="tabular-nums">
                      <span className="text-[#64748B] font-medium">Saída: </span>
                      <strong className="font-bold">{formatDateTimeBR(stay.checkOutDate)}</strong>
                    </div>
                  </div>
                </div>

                {stay.pricingBreakdown?.summaryText && (
                  <p className="text-xs text-[#64748B] tabular-nums">
                    {stay.pricingBreakdown.summaryText}
                    {dogCount > 1 && stay.pricingBreakdown.unitStayPrice !== undefined
                      ? ` · ${formatBRL(stay.pricingBreakdown.unitStayPrice)} × ${dogCount} cães`
                      : ''}
                  </p>
                )}

                {editable && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(stay)}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] border border-[#7b93c2] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4 shrink-0" />
                      <span>Editar Data/Horário</span>
                    </button>
                  </div>
                )}

                {stay.status === 'pending' && !editable && (
                  <p className="text-[11px] text-[#64748B]">
                    A data de entrada já passou. Fale com a equipe Mika &amp; Xan para ajustes.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Bottom Action: New Booking */}
      <div className="pt-2 border-t border-[#dec2cb]/60">
        <button
          type="button"
          onClick={onNewBooking}
          className="w-full min-h-[48px] px-5 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-[#92a8d1]" />
          <span>Agendar Nova Hospedagem</span>
          <ArrowRight className="w-4 h-4 text-[#92a8d1]" />
        </button>
      </div>

      {/* Edit Future Pending Reservation Modal */}
      {editingStay && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-reservation-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        >
          <div className="bg-white border border-[#dec2cb]/70 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-[#1E293B] max-h-[92dvh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#dec2cb]/60 pb-3">
              <div>
                <h3
                  id="edit-reservation-title"
                  className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight"
                >
                  Editar Data e Horário
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {resolveStayPetNames(editingStay).join(', ')} · {editingDogCount}{' '}
                  {editingDogCount === 1 ? 'cão' : 'cães'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={savingEdit}
                aria-label="Fechar janela de edição"
                className="min-h-[44px] min-w-[44px] rounded-xl text-[#64748B] hover:text-[#1E293B] hover:bg-[#FAF8F9] flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEdit} className="space-y-4">
              {/* Check-in Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-checkin-date"
                    className="block text-xs font-bold text-[#1E293B] mb-1.5"
                  >
                    Nova Data de Entrada *
                  </label>
                  <input
                    id="edit-checkin-date"
                    type="date"
                    required
                    value={editCheckInDate}
                    onChange={(e) => {
                      setEditCheckInDate(e.target.value);
                      setEditValidationError(null);
                    }}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-checkin-time"
                    className="block text-xs font-bold text-[#1E293B] mb-1.5"
                  >
                    Horário de Entrada *
                  </label>
                  <input
                    id="edit-checkin-time"
                    type="time"
                    required
                    value={editCheckInTime}
                    onChange={(e) => {
                      setEditCheckInTime(e.target.value);
                      setEditValidationError(null);
                    }}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Check-out Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-checkout-date"
                    className="block text-xs font-bold text-[#1E293B] mb-1.5"
                  >
                    Nova Data de Saída *
                  </label>
                  <input
                    id="edit-checkout-date"
                    type="date"
                    required
                    value={editCheckOutDate}
                    onChange={(e) => {
                      setEditCheckOutDate(e.target.value);
                      setEditValidationError(null);
                    }}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-checkout-time"
                    className="block text-xs font-bold text-[#1E293B] mb-1.5"
                  >
                    Horário de Saída *
                  </label>
                  <input
                    id="edit-checkout-time"
                    type="time"
                    required
                    value={editCheckOutTime}
                    onChange={(e) => {
                      setEditCheckOutTime(e.target.value);
                      setEditValidationError(null);
                    }}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Live Recalculated Price Preview */}
              {recalculatedPricing ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#f7cac9]/30 via-[#c5b9cd]/25 to-[#92a8d1]/30 border border-[#dec2cb] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-[#2D3E5E]" />
                      <span>Novo Valor Recalculado</span>
                    </span>
                    <span className="text-xs font-semibold text-[#475569] tabular-nums">
                      {recalculatedPricing.summaryText}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <div className="text-xs text-[#475569] tabular-nums">
                      {editingDogCount > 1 ? (
                        <span>
                          {formatBRL(recalculatedPricing.unitStayPrice)} × {editingDogCount} cães
                        </span>
                      ) : (
                        <span>
                          Valor anterior:{' '}
                          {formatBRL(
                            editingStay.finalTotal ??
                              editingStay.totalPrice ??
                              editingStay.estimatedTotal ??
                              0
                          )}
                        </span>
                      )}
                    </div>
                    <span className="text-xl font-black text-[#1E293B] tabular-nums">
                      {formatBRL(recalculatedPricing.totalPrice)}
                    </span>
                  </div>

                  {recalculatedPricing.cyclesBreakdown.length > 0 && (
                    <div className="pt-2 border-t border-[#dec2cb]/70 space-y-1 max-h-32 overflow-y-auto">
                      {recalculatedPricing.cyclesBreakdown.map((cycle) => (
                        <div
                          key={`${cycle.cycleIndex}-${cycle.type}`}
                          className="flex items-center justify-between gap-2 text-[11px] text-[#334155]"
                        >
                          <span className="truncate">{cycle.description}</span>
                          <span className="font-bold text-[#1E293B] tabular-nums shrink-0">
                            {formatBRL(cycle.rate)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-xs text-[#64748B]">
                  Selecione uma data/horário de saída posterior à entrada para visualizar o novo
                  valor.
                </div>
              )}

              {!checkInIsInFuture && editCheckInDate && editCheckInTime && (
                <div className="p-3 rounded-2xl bg-[#f7cac9]/60 border border-[#dec2cb] text-xs text-[#7F1D1D] font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>A data e horário de entrada devem estar no futuro.</span>
                </div>
              )}

              {editValidationError && (
                <div className="p-3 rounded-2xl bg-[#f7cac9]/70 border border-[#dec2cb] text-xs text-[#7F1D1D] font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editValidationError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleCloseEditModal}
                  className="min-h-[48px] px-4 rounded-xl border border-[#c5b9cd] bg-white hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !recalculatedPricing || !checkInIsInFuture}
                  className="min-h-[48px] px-5 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#92a8d1]" />
                      <span>Salvando alteração...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#92a8d1]" />
                      <span>Confirmar Nova Data</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function getClientStatusMeta(status: StayStatus): { label: string; textClass: string } {
  switch (status) {
    case 'pending':
      return { label: 'Aguardando confirmação', textClass: 'text-[#9F1239]' };
    case 'active':
      return { label: 'Hospedado agora', textClass: 'text-[#133E26]' };
    case 'completed':
      return { label: 'Concluída', textClass: 'text-[#64748B]' };
    default:
      return { label: String(status), textClass: 'text-[#64748B]' };
  }
}

export default ClientReservations;
