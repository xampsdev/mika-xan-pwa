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
} from '@/lib/firebase';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Dog,
  Clock,
  Users,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { Pet, Tutor, Stay, StayStatus } from '@/types/schema';
import { formatBRL } from '@/lib/pricingCalculator';

const VALID_STAY_STATUSES: StayStatus[] = ['active', 'pending', 'completed'];

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

// Module-level cache prevents redundant Firestore reads on tab remounts
let cachedCalendarData: {
  stays: Stay[];
  tutors: Map<string, Tutor>;
  pets: Pet[];
  fetchedAt: number;
} | null = null;

/**
 * Formats a local Date instance as YYYY-MM-DD without UTC drift.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts a timezone-safe local YYYY-MM-DD key from an ISO date or datetime string.
 */
function extractDateKey(isoStr: string | undefined | null): string | null {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const trimmed = isoStr.trim();
  if (!trimmed) return null;

  // If explicit UTC/offset suffix exists, convert to local calendar day
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : toDateKey(parsed);
  }

  // Local ISO string (YYYY-MM-DD or YYYY-MM-DDTHH:mm) — extract calendar date directly
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : toDateKey(fallback);
}

/**
 * Formats an ISO date/datetime string as "DD/MM às HH:mm" or "DD/MM" if no time is specified.
 */
function formatDateTimeShort(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const trimmed = isoStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (match && !/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const [, , month, day, hour, minute] = match;
    return hour && minute ? `${day}/${month} às ${hour}:${minute}` : `${day}/${month}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${day}/${month} às ${hour}:${minute}`;
}

/**
 * Formats a YYYY-MM-DD key into a full Portuguese display label (e.g., "Sexta-feira, 20 de Novembro de 2026").
 */
function formatSelectedDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1);
  const weekdayFull = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
  const capitalized = weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1);
  return `${capitalized}, ${d} de ${MONTHS_PT[(m || 1) - 1]} de ${y}`;
}

/**
 * Resolves the effective dog count for a stay (falls back to 1 for legacy records).
 */
export function resolveStayDogCount(stay: Stay): number {
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

interface DayOccupancySummary {
  dateKey: string;
  totalDogs: number;
  activeDogs: number;
  pendingDogs: number;
  completedDogs: number;
  hasActive: boolean;
  hasPending: boolean;
  hasCompleted: boolean;
  stays: Stay[];
}

export interface AdminCalendarProps {
  /** Pre-fetched stays from AdminDashboard real-time cache to avoid extra Firestore reads */
  stays?: Stay[];
  /** Pre-fetched tutors map from AdminDashboard */
  tutors?: Map<string, Tutor>;
  /** Pre-fetched pets list from AdminDashboard */
  pets?: Pet[];
  /** Opens PetDetailModal when clicking a stay in the daily summary */
  onSelectPet?: (pet: Pet) => void;
  /** Quick approval action for pending stays directly from the daily summary */
  onApproveStay?: (stayId: string) => Promise<void> | void;
}

export const AdminCalendar: React.FC<AdminCalendarProps> = ({
  stays: externalStays,
  tutors: externalTutors,
  pets: externalPets,
  onSelectPet,
  onApproveStay,
}) => {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());

  // Local cache used when component is mounted standalone without pre-fetched props
  const [localStays, setLocalStays] = useState<Stay[]>(() => cachedCalendarData?.stays ?? []);
  const [localTutors, setLocalTutors] = useState<Map<string, Tutor>>(
    () => cachedCalendarData?.tutors ?? new Map()
  );
  const [localPets, setLocalPets] = useState<Pet[]>(() => cachedCalendarData?.pets ?? []);
  const [loading, setLoading] = useState<boolean>(
    () => externalStays === undefined && cachedCalendarData === null
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [approvingStayId, setApprovingStayId] = useState<string | null>(null);

  const fetchAndCacheFirestoreData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const staysQuery = query(
        collection(db, 'stays'),
        where('status', 'in', VALID_STAY_STATUSES)
      );
      const [staysSnap, tutorsSnap, petsSnap] = await Promise.all([
        getDocs(staysQuery),
        getDocs(collection(db, 'tutors')),
        getDocs(collection(db, 'pets')),
      ]);

      const fetchedStays: Stay[] = [];
      staysSnap.forEach((docSnap: any) => {
        fetchedStays.push({ id: docSnap.id, ...docSnap.data() } as Stay);
      });

      const fetchedTutors = new Map<string, Tutor>();
      tutorsSnap.forEach((docSnap: any) => {
        fetchedTutors.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Tutor);
      });

      const fetchedPets: Pet[] = [];
      petsSnap.forEach((docSnap: any) => {
        fetchedPets.push({ id: docSnap.id, ...docSnap.data() } as Pet);
      });

      cachedCalendarData = {
        stays: fetchedStays,
        tutors: fetchedTutors,
        pets: fetchedPets,
        fetchedAt: Date.now(),
      };

      setLocalStays(fetchedStays);
      setLocalTutors(fetchedTutors);
      setLocalPets(fetchedPets);
    } catch (err) {
      console.warn('AdminCalendar fetch warning:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Only query Firestore if parent did not supply cached real-time state and module cache is empty
  useEffect(() => {
    if (externalStays !== undefined) {
      setLoading(false);
      return;
    }
    if (!cachedCalendarData) {
      fetchAndCacheFirestoreData(false);
    }
  }, [externalStays, fetchAndCacheFirestoreData]);

  // Unified data sources (prefer parent real-time snapshot cache when available)
  const effectiveStays = useMemo(() => {
    const source = externalStays !== undefined ? externalStays : localStays;
    return source.filter((s) => VALID_STAY_STATUSES.includes(s.status));
  }, [externalStays, localStays]);

  const effectiveTutors = externalTutors ?? localTutors;
  const effectivePets = externalPets ?? localPets;

  const petsByIdMap = useMemo(() => {
    const map = new Map<string, Pet>();
    effectivePets.forEach((pet) => map.set(pet.id, pet));
    return map;
  }, [effectivePets]);

  // Pre-normalize stay date bounds once per stays update
  const normalizedStays = useMemo(() => {
    return effectiveStays
      .map((stay) => {
        const startKey = extractDateKey(stay.checkInDate);
        const rawEndKey = extractDateKey(stay.checkOutDate);
        if (!startKey) return null;
        const endKey = rawEndKey && rawEndKey >= startKey ? rawEndKey : startKey;
        return {
          stay,
          startKey,
          endKey,
          dogCount: resolveStayDogCount(stay),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [effectiveStays]);

  // Build calendar grid cells for viewYear / viewMonth
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: Array<{ dateKey: string; dayNumber: number; isCurrentMonth: boolean }> = [];

    // Leading padding days from previous month
    const prevMonthLastDate = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevMonthLastDate - i);
      cells.push({
        dateKey: toDateKey(d),
        dayNumber: d.getDate(),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      cells.push({
        dateKey: toDateKey(d),
        dayNumber: day,
        isCurrentMonth: true,
      });
    }

    // Trailing padding days to complete 7-column grid
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      const trailingCount = 7 - remainder;
      for (let i = 1; i <= trailingCount; i++) {
        const d = new Date(viewYear, viewMonth + 1, i);
        cells.push({
          dateKey: toDateKey(d),
          dayNumber: d.getDate(),
          isCurrentMonth: false,
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth]);

  // Precompute occupancy map for every visible cell in the current month grid
  const occupancyByDate = useMemo(() => {
    const map = new Map<string, DayOccupancySummary>();
    if (calendarDays.length === 0) return map;

    const gridStartKey = calendarDays[0].dateKey;
    const gridEndKey = calendarDays[calendarDays.length - 1].dateKey;

    calendarDays.forEach((cell) => {
      map.set(cell.dateKey, {
        dateKey: cell.dateKey,
        totalDogs: 0,
        activeDogs: 0,
        pendingDogs: 0,
        completedDogs: 0,
        hasActive: false,
        hasPending: false,
        hasCompleted: false,
        stays: [],
      });
    });

    normalizedStays.forEach(({ stay, startKey, endKey, dogCount }) => {
      if (endKey < gridStartKey || startKey > gridEndKey) return;

      for (const cell of calendarDays) {
        if (cell.dateKey >= startKey && cell.dateKey <= endKey) {
          const entry = map.get(cell.dateKey)!;
          entry.totalDogs += dogCount;
          entry.stays.push(stay);
          if (stay.status === 'active') {
            entry.activeDogs += dogCount;
            entry.hasActive = true;
          } else if (stay.status === 'pending') {
            entry.pendingDogs += dogCount;
            entry.hasPending = true;
          } else if (stay.status === 'completed') {
            entry.completedDogs += dogCount;
            entry.hasCompleted = true;
          }
        }
      }
    });

    return map;
  }, [calendarDays, normalizedStays]);

  // Selected date summary (works even if selectedDateKey is outside the currently visible month grid)
  const selectedDaySummary = useMemo<DayOccupancySummary>(() => {
    const fromGrid = occupancyByDate.get(selectedDateKey);
    if (fromGrid) {
      return {
        ...fromGrid,
        stays: [...fromGrid.stays].sort(compareStaysForDay),
      };
    }

    const summary: DayOccupancySummary = {
      dateKey: selectedDateKey,
      totalDogs: 0,
      activeDogs: 0,
      pendingDogs: 0,
      completedDogs: 0,
      hasActive: false,
      hasPending: false,
      hasCompleted: false,
      stays: [],
    };

    normalizedStays.forEach(({ stay, startKey, endKey, dogCount }) => {
      if (selectedDateKey >= startKey && selectedDateKey <= endKey) {
        summary.totalDogs += dogCount;
        summary.stays.push(stay);
        if (stay.status === 'active') {
          summary.activeDogs += dogCount;
          summary.hasActive = true;
        } else if (stay.status === 'pending') {
          summary.pendingDogs += dogCount;
          summary.hasPending = true;
        } else if (stay.status === 'completed') {
          summary.completedDogs += dogCount;
          summary.hasCompleted = true;
        }
      }
    });

    summary.stays.sort(compareStaysForDay);
    return summary;
  }, [occupancyByDate, selectedDateKey, normalizedStays]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDateKey(toDateKey(now));
  };

  const handleSelectDay = (cell: { dateKey: string; isCurrentMonth: boolean }) => {
    setSelectedDateKey(cell.dateKey);
    if (!cell.isCurrentMonth) {
      const [y, m] = cell.dateKey.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  };

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
    const primaryPet = petsByIdMap.get(stay.petId);
    if (primaryPet?.nameAndBreed) return [primaryPet.nameAndBreed];
    return ['Pet não identificado'];
  };

  const handleTriggerApprove = async (e: React.MouseEvent, stayId: string) => {
    e.stopPropagation();
    if (!onApproveStay || approvingStayId) return;
    setApprovingStayId(stayId);
    try {
      await onApproveStay(stayId);
    } finally {
      setApprovingStayId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-2 rounded-3xl bg-white border border-[#dec2cb]/60 shadow-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#92a8d1]" />
        <span>Carregando calendário de reservas...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Calendar Grid Card */}
      <section className="lg:col-span-7 bg-white border border-[#dec2cb]/60 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
        {/* Month Navigation Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#dec2cb]/60">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#dec2cb] bg-[#FAF8F9] hover:bg-[#92a8d1]/20 text-[#1E293B] flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#92a8d1]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Próximo mês"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#dec2cb] bg-[#FAF8F9] hover:bg-[#92a8d1]/20 text-[#1E293B] flex items-center justify-center transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#92a8d1]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight text-center tabular-nums">
            {MONTHS_PT[viewMonth]} {viewYear}
          </h3>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleJumpToToday}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] border border-[#7b93c2] text-[#1E293B] text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D3E5E]"
            >
              Hoje
            </button>
            {externalStays === undefined && (
              <button
                type="button"
                onClick={() => fetchAndCacheFirestoreData(true)}
                disabled={refreshing}
                aria-label="Atualizar reservas"
                title="Atualizar reservas do servidor"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-[#dec2cb] bg-white hover:bg-[#FAF8F9] text-[#1E293B] flex items-center justify-center transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#92a8d1]' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Weekday Column Labels */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
          {WEEKDAYS_PT.map((dayLabel) => (
            <div
              key={dayLabel}
              className="py-1 text-[11px] font-bold text-[#64748B] tracking-wide select-none"
            >
              {dayLabel}
            </div>
          ))}
        </div>

        {/* Month Day Cells Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {calendarDays.map((cell) => {
            const occ = occupancyByDate.get(cell.dateKey);
            const totalDogs = occ?.totalDogs ?? 0;
            const isSelected = cell.dateKey === selectedDateKey;
            const isToday = cell.dateKey === todayKey;

            let cellStyle =
              'bg-[#FAF8F9]/60 border-transparent text-[#1E293B] hover:bg-[#FAF8F9] hover:border-[#dec2cb]';

            if (!cell.isCurrentMonth) {
              cellStyle = 'bg-transparent border-transparent text-[#94A3B8] hover:bg-[#FAF8F9]/70';
            }

            if (totalDogs > 0 && !isSelected) {
              if (occ?.hasActive) {
                cellStyle =
                  'bg-[#92a8d1]/15 border-[#92a8d1] text-[#1E293B] hover:bg-[#92a8d1]/25';
              } else if (occ?.hasPending) {
                cellStyle =
                  'bg-[#f7cac9]/30 border-[#dec2cb] text-[#1E293B] hover:bg-[#f7cac9]/45';
              } else if (occ?.hasCompleted) {
                cellStyle =
                  'bg-[#F3EFF2] border-[#c5b9cd]/70 text-[#475569] hover:bg-[#EAE4EA]';
              }
            }

            if (isSelected) {
              cellStyle =
                'bg-[#2D3E5E] border-[#1E293B] text-white shadow-sm';
            }

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => handleSelectDay(cell)}
                aria-pressed={isSelected}
                aria-label={`${cell.dayNumber} de ${MONTHS_PT[viewMonth]}, ${totalDogs} ${
                  totalDogs === 1 ? 'cão' : 'cães'
                }`}
                className={`relative min-h-[52px] sm:min-h-[60px] rounded-2xl border p-1.5 flex flex-col items-center justify-between transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#92a8d1] ${cellStyle} ${
                  isToday && !isSelected ? 'ring-2 ring-[#92a8d1]/70 ring-offset-1' : ''
                }`}
              >
                <span
                  className={`text-xs sm:text-sm tabular-nums leading-none ${
                    isToday || isSelected ? 'font-black' : 'font-semibold'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {/* Occupancy Indicator Dots & Compact Dog Count */}
                {totalDogs > 0 ? (
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <div className="flex items-center justify-center gap-1">
                      {occ?.hasActive && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-[#92a8d1]' : 'bg-[#4E6E9E]'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      {occ?.hasPending && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-[#f7cac9]' : 'bg-[#C97C86]'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      {occ?.hasCompleted && !occ.hasActive && !occ.hasPending && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-slate-300' : 'bg-[#64748B]'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold tabular-nums leading-none ${
                        isSelected ? 'text-[#f7cac9]' : 'text-[#2D3E5E]'
                      }`}
                    >
                      {totalDogs} {totalDogs === 1 ? 'cão' : 'cães'}
                    </span>
                  </div>
                ) : (
                  <span className="h-3" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Clean Unboxed Legend */}
        <div className="pt-2 border-t border-[#dec2cb]/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4E6E9E]" aria-hidden="true" />
              <span className="font-medium text-[#1E293B]">Ativa</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#C97C86]" aria-hidden="true" />
              <span className="font-medium text-[#1E293B]">Pendente</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#64748B]" aria-hidden="true" />
              <span className="font-medium text-[#1E293B]">Concluída</span>
            </span>
          </div>
          <span className="tabular-nums text-[#64748B]">
            Toque em um dia para ver detalhes
          </span>
        </div>
      </section>

      {/* Daily Summary Panel */}
      <section className="lg:col-span-5 bg-white border border-[#dec2cb]/60 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="pb-3 border-b border-[#dec2cb]/60 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#64748B] flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-[#2D3E5E]" />
              <span>Resumo Diário</span>
            </span>
            {selectedDateKey === todayKey && (
              <span className="text-xs font-bold text-[#2D3E5E]">Hoje</span>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight">
            {formatSelectedDateHeading(selectedDateKey)}
          </h3>
        </div>

        {selectedDaySummary.totalDogs === 0 ? (
          <div className="py-10 px-4 text-center rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/50 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#f7cac9]/40 border border-[#dec2cb] text-[#2D3E5E] mx-auto flex items-center justify-center">
              <Dog className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-[#1E293B]">
              Nenhuma reserva para esta data
            </p>
            <p className="text-xs text-[#64748B]">
              Agenda livre neste dia. Selecione outra data destacada no calendário para consultar
              hóspedes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Daily Capacity Total Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#f7cac9]/30 via-[#c5b9cd]/25 to-[#92a8d1]/30 border border-[#dec2cb]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg sm:text-xl font-black text-[#1E293B] tabular-nums">
                  Total de cães: {selectedDaySummary.totalDogs}
                </p>
                <span className="text-xs font-semibold text-[#2D3E5E] tabular-nums">
                  {selectedDaySummary.stays.length}{' '}
                  {selectedDaySummary.stays.length === 1 ? 'reserva' : 'reservas'}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#475569] tabular-nums">
                {selectedDaySummary.activeDogs > 0 && (
                  <span className="font-semibold text-[#133E26]">
                    {selectedDaySummary.activeDogs}{' '}
                    {selectedDaySummary.activeDogs === 1 ? 'ativo' : 'ativos'}
                  </span>
                )}
                {selectedDaySummary.activeDogs > 0 &&
                  (selectedDaySummary.pendingDogs > 0 || selectedDaySummary.completedDogs > 0) && (
                    <span aria-hidden="true">·</span>
                  )}
                {selectedDaySummary.pendingDogs > 0 && (
                  <span className="font-semibold text-[#7F1D1D]">
                    {selectedDaySummary.pendingDogs}{' '}
                    {selectedDaySummary.pendingDogs === 1 ? 'pendente' : 'pendentes'}
                  </span>
                )}
                {selectedDaySummary.pendingDogs > 0 && selectedDaySummary.completedDogs > 0 && (
                  <span aria-hidden="true">·</span>
                )}
                {selectedDaySummary.completedDogs > 0 && (
                  <span className="font-medium text-[#64748B]">
                    {selectedDaySummary.completedDogs}{' '}
                    {selectedDaySummary.completedDogs === 1 ? 'concluído' : 'concluídos'}
                  </span>
                )}
              </div>
            </div>

            {/* Intersecting Stays List */}
            <div className="divide-y divide-[#dec2cb]/60 border-t border-b border-[#dec2cb]/60">
              {selectedDaySummary.stays.map((stay) => {
                const tutor = effectiveTutors.get(stay.tutorId);
                const petNames = resolveStayPetNames(stay);
                const dogCount = resolveStayDogCount(stay);
                const primaryPet =
                  petsByIdMap.get(stay.petId) ||
                  (Array.isArray(stay.petIds)
                    ? stay.petIds.map((id) => petsByIdMap.get(id)).find(Boolean)
                    : undefined);

                const statusMeta = getStatusDisplayMeta(stay.status);
                const displayTotal = stay.finalTotal ?? stay.estimatedTotal;

                return (
                  <div
                    key={stay.id}
                    onClick={() => {
                      if (primaryPet && onSelectPet) {
                        onSelectPet(primaryPet);
                      }
                    }}
                    className={`py-3.5 px-1 space-y-2 transition ${
                      primaryPet && onSelectPet
                        ? 'cursor-pointer hover:bg-[#FAF8F9] rounded-xl px-2 -mx-1'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-[#1E293B] leading-snug">
                          {petNames.join(', ')}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] mt-0.5">
                          <Users className="w-3.5 h-3.5 text-[#2D3E5E] shrink-0" />
                          <span className="font-semibold text-[#1E293B] truncate">
                            {tutor?.fullName || 'Tutor não informado'}
                          </span>
                          {tutor?.phoneDDD && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px] shrink-0">
                                {tutor.phoneDDD}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <span className={`block text-xs font-bold ${statusMeta.textClass}`}>
                          {statusMeta.label}
                        </span>
                        <span className="block text-[11px] font-semibold text-[#475569] tabular-nums">
                          {dogCount} {dogCount === 1 ? 'cão' : 'cães'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
                      <div className="flex items-center gap-1.5 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-[#2D3E5E] shrink-0" />
                        <span>
                          <strong className="text-[#1E293B]">Entrada:</strong>{' '}
                          {formatDateTimeShort(stay.checkInDate)}
                        </span>
                        <span aria-hidden="true">→</span>
                        <span>
                          <strong className="text-[#1E293B]">Saída:</strong>{' '}
                          {formatDateTimeShort(stay.checkOutDate)}
                        </span>
                      </div>

                      {displayTotal !== undefined && displayTotal > 0 && (
                        <span className="text-xs font-black text-[#1E293B] tabular-nums">
                          {formatBRL(displayTotal)}
                        </span>
                      )}
                    </div>

                    {stay.specialStayNotes?.trim() && (
                      <p className="text-[11px] text-[#64748B] line-clamp-2">
                        Obs: {stay.specialStayNotes.trim()}
                      </p>
                    )}

                    {stay.status === 'pending' && onApproveStay && (
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={approvingStayId === stay.id}
                          onClick={(e) => handleTriggerApprove(e, stay.id)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] disabled:opacity-50 border border-[#7b93c2] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          {approvingStayId === stay.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Aprovar Hospedagem</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

function compareStaysForDay(a: Stay, b: Stay): number {
  const rank: Record<StayStatus, number> = {
    active: 0,
    pending: 1,
    completed: 2,
  };
  const statusDiff = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
  if (statusDiff !== 0) return statusDiff;
  return (a.checkInDate || '').localeCompare(b.checkInDate || '');
}

function getStatusDisplayMeta(status: StayStatus): { label: string; textClass: string } {
  switch (status) {
    case 'active':
      return { label: 'Hospedado', textClass: 'text-[#133E26]' };
    case 'pending':
      return { label: 'Pendente', textClass: 'text-[#9F1239]' };
    case 'completed':
      return { label: 'Concluída', textClass: 'text-[#64748B]' };
    default:
      return { label: String(status), textClass: 'text-[#64748B]' };
  }
}

export default AdminCalendar;
