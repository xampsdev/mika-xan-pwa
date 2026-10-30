/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PricingCycleBreakdown, StayPricingCalculation } from '@/types/schema';

export const RATE_WEEKDAY_FULL = 79.0;
export const RATE_WEEKDAY_HALF = 39.5;
export const RATE_WEEKEND_HOLIDAY_FULL = 89.0;
export const RATE_WEEKEND_HOLIDAY_HALF = 44.5;

/**
 * Fixed National (Brazil) and São Paulo (State/City) Holidays.
 * Stored as MM-DD keys.
 */
export const FIXED_HOLIDAYS_SP: Record<string, string> = {
  '01-01': 'Confraternização Universal (Ano Novo)',
  '01-25': 'Aniversário de São Paulo',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '07-09': 'Revolução Constitucionalista (SP)',
  '09-07': 'Independência do Brasil',
  '10-12': 'N. Sra. Aparecida (Padroeira do Brasil)',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Dia Nacional da Consciência Negra',
  '12-24': 'Véspera de Natal',
  '12-25': 'Natal',
  '12-31': 'Véspera de Ano Novo',
};

/**
 * Butcher's Algorithm to compute Easter Sunday for any given Gregorian year.
 */
export function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed month
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month, day, 12, 0, 0);
}

/**
 * Computes movable holidays tied to Easter:
 * - Carnaval (Segunda-Feira): Easter - 48 days
 * - Carnaval (Terça-Feira): Easter - 47 days
 * - Sexta-Feira Santa (Paixão de Cristo): Easter - 2 days
 * - Corpus Christi: Easter + 60 days
 */
export function getMovableHolidaysForYear(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const easter = calculateEasterSunday(year);

  const addRelativeDays = (base: Date, days: number, name: string) => {
    const target = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    holidays.set(`${mm}-${dd}`, name);
  };

  addRelativeDays(easter, -48, 'Segunda-Feira de Carnaval');
  addRelativeDays(easter, -47, 'Terça-Feira de Carnaval');
  addRelativeDays(easter, -2, 'Sexta-Feira Santa (Paixão de Cristo)');
  addRelativeDays(easter, 60, 'Corpus Christi');

  return holidays;
}

/**
 * Checks whether a given Date is a recognized Brazil/SP Holiday.
 */
export function getHolidayInfo(date: Date): { isHoliday: boolean; holidayName?: string } {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;

  if (FIXED_HOLIDAYS_SP[key]) {
    return { isHoliday: true, holidayName: FIXED_HOLIDAYS_SP[key] };
  }

  const movableMap = getMovableHolidaysForYear(date.getFullYear());
  if (movableMap.has(key)) {
    return { isHoliday: true, holidayName: movableMap.get(key) };
  }

  return { isHoliday: false };
}

/**
 * Determines whether a date qualifies as Weekend (Friday, Saturday, Sunday) or Holiday.
 * Day of week: 0 = Sunday, 5 = Friday, 6 = Saturday.
 */
export function evaluateDateRate(date: Date): {
  isWeekendOrHoliday: boolean;
  isWeekend: boolean;
  holidayName?: string | null;
  dayOfWeek: number;
  fullRate: number;
  halfRate: number;
  dayLabel: string;
} {
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Sun, Fri, Sat
  const holiday = getHolidayInfo(date);
  const isWeekendOrHoliday = isWeekend || holiday.isHoliday;

  const fullRate = isWeekendOrHoliday ? RATE_WEEKEND_HOLIDAY_FULL : RATE_WEEKDAY_FULL;
  const halfRate = isWeekendOrHoliday ? RATE_WEEKEND_HOLIDAY_HALF : RATE_WEEKDAY_HALF;

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dayLabel = `${dayNames[dayOfWeek]}, ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

  return {
    isWeekendOrHoliday,
    isWeekend,
    holidayName: holiday.holidayName || null,
    dayOfWeek,
    fullRate,
    halfRate,
    dayLabel,
  };
}

/**
 * Currency formatter for Brazilian Real (R$).
 */
export function formatBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * 24-Hour Cycle + Half-Day Dynamic Pricing Engine.
 *
 * Rules:
 * 1. Base 24-hour cycle calculated from combined check-in to check-out.
 * 2. If duration <= 24h: Minimum 1 full daily rate based on check-in day.
 * 3. Each full 24h block takes the daily rate corresponding to its calendar cycle start date.
 *    - Mon-Thu non-holiday: R$ 79,00
 *    - Fri, Sat, Sun OR Holiday: R$ 89,00
 * 4. Overtime hours (extraHours):
 *    - <= 0.5 hours (30 mins): Tolerance courtesy (R$ 0,00)
 *    - > 0.5 hours to <= 6.0 hours: +0.5 diária (Meia Diária: R$ 39,50 or R$ 44,50 based on checkout day)
 *    - > 6.0 hours: +1.0 full diária (R$ 79,00 or R$ 89,00 based on checkout day)
 */
export function calculateStayPricing(
  checkInDate: string,
  checkInTime: string,
  checkOutDate: string,
  checkOutTime: string
): StayPricingCalculation | null {
  if (!checkInDate || !checkInTime || !checkOutDate || !checkOutTime) {
    return null;
  }

  const start = new Date(`${checkInDate}T${checkInTime}:00`);
  const end = new Date(`${checkOutDate}T${checkOutTime}:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }

  const diffMs = end.getTime() - start.getTime();
  const rawTotalHours = diffMs / (1000 * 60 * 60);
  const totalHours = Math.round(rawTotalHours * 10) / 10;

  const fullCycles = Math.floor(rawTotalHours / 24);
  const extraHours = Math.round((rawTotalHours - fullCycles * 24) * 10) / 10;

  const cyclesBreakdown: PricingCycleBreakdown[] = [];
  let totalAmount = 0;
  let overtimeType: 'none' | 'tolerance' | 'half_day' | 'full_day' = 'none';

  // CASE A: Less than 24 hours total -> Minimum 1 full daily rate
  if (fullCycles === 0) {
    const rateInfo = evaluateDateRate(start);
    totalAmount += rateInfo.fullRate;

    const desc = rateInfo.holidayName
      ? `1 Diária Mínima (${rateInfo.dayLabel} - Feriado: ${rateInfo.holidayName})`
      : rateInfo.isWeekend
        ? `1 Diária Mínima (${rateInfo.dayLabel} - Final de Semana)`
        : `1 Diária Mínima (${rateInfo.dayLabel} - Dia Útil)`;

    cyclesBreakdown.push({
      cycleIndex: 1,
      type: 'same_day_minimum',
      dateLabel: rateInfo.dayLabel,
      dateKey: checkInDate,
      dayOfWeek: rateInfo.dayOfWeek,
      isWeekendOrHoliday: rateInfo.isWeekendOrHoliday,
      holidayName: rateInfo.holidayName,
      rate: rateInfo.fullRate,
      description: desc,
      hoursCovered: totalHours,
    });

    const summaryText = `${totalHours}h de estadia (1 diária mínima)`;

    return {
      checkInDateTime: `${checkInDate}T${checkInTime}`,
      checkOutDateTime: `${checkOutDate}T${checkOutTime}`,
      totalHours,
      fullCycles: 1,
      extraHours: 0,
      overtimeType: 'none',
      estimatedTotal: totalAmount,
      hasHalfDay: false,
      fullDaysCount: 1,
      cyclesBreakdown,
      summaryText,
    };
  }

  // CASE B: 1 or more full 24-hour cycles
  for (let i = 0; i < fullCycles; i++) {
    const cycleStartDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const rateInfo = evaluateDateRate(cycleStartDate);
    totalAmount += rateInfo.fullRate;

    const cycleNum = i + 1;
    const tag = rateInfo.holidayName
      ? `Feriado: ${rateInfo.holidayName}`
      : rateInfo.isWeekend
        ? 'Fim de Semana'
        : 'Seg a Qui';

    cyclesBreakdown.push({
      cycleIndex: cycleNum,
      type: 'full_cycle',
      dateLabel: rateInfo.dayLabel,
      dateKey: cycleStartDate.toISOString().split('T')[0],
      dayOfWeek: rateInfo.dayOfWeek,
      isWeekendOrHoliday: rateInfo.isWeekendOrHoliday,
      holidayName: rateInfo.holidayName,
      rate: rateInfo.fullRate,
      description: `${cycleNum}º Ciclo 24h (${rateInfo.dayLabel} • ${tag})`,
      hoursCovered: 24,
    });
  }

  // Overtime evaluation based on Checkout Date rate
  const checkoutRateInfo = evaluateDateRate(end);

  if (extraHours > 0) {
    if (extraHours <= 0.5) {
      // 30-min tolerance courtesy
      overtimeType = 'tolerance';
      cyclesBreakdown.push({
        cycleIndex: fullCycles + 1,
        type: 'tolerance_courtesy',
        dateLabel: checkoutRateInfo.dayLabel,
        dateKey: checkOutDate,
        dayOfWeek: checkoutRateInfo.dayOfWeek,
        isWeekendOrHoliday: checkoutRateInfo.isWeekendOrHoliday,
        holidayName: checkoutRateInfo.holidayName,
        rate: 0,
        description: `Tolerância de Saída (+${extraHours}h até 30min • Cortesia R$ 0,00)`,
        hoursCovered: extraHours,
      });
    } else if (extraHours <= 6.0) {
      // Half-day overtime (+0.5 diária)
      overtimeType = 'half_day';
      totalAmount += checkoutRateInfo.halfRate;
      const tag = checkoutRateInfo.holidayName
        ? `Feriado: ${checkoutRateInfo.holidayName}`
        : checkoutRateInfo.isWeekend
          ? 'Fim de Semana'
          : 'Seg a Qui';

      cyclesBreakdown.push({
        cycleIndex: fullCycles + 1,
        type: 'overtime_half_day',
        dateLabel: checkoutRateInfo.dayLabel,
        dateKey: checkOutDate,
        dayOfWeek: checkoutRateInfo.dayOfWeek,
        isWeekendOrHoliday: checkoutRateInfo.isWeekendOrHoliday,
        holidayName: checkoutRateInfo.holidayName,
        rate: checkoutRateInfo.halfRate,
        description: `Meia Diária Adicional (+${extraHours}h até 6h • ${tag})`,
        hoursCovered: extraHours,
      });
    } else {
      // Over 6 hours -> +1 full diária
      overtimeType = 'full_day';
      totalAmount += checkoutRateInfo.fullRate;
      const tag = checkoutRateInfo.holidayName
        ? `Feriado: ${checkoutRateInfo.holidayName}`
        : checkoutRateInfo.isWeekend
          ? 'Fim de Semana'
          : 'Seg a Qui';

      cyclesBreakdown.push({
        cycleIndex: fullCycles + 1,
        type: 'overtime_full_day',
        dateLabel: checkoutRateInfo.dayLabel,
        dateKey: checkOutDate,
        dayOfWeek: checkoutRateInfo.dayOfWeek,
        isWeekendOrHoliday: checkoutRateInfo.isWeekendOrHoliday,
        holidayName: checkoutRateInfo.holidayName,
        rate: checkoutRateInfo.fullRate,
        description: `Diária Completa Adicional (+${extraHours}h > 6h • ${tag})`,
        hoursCovered: extraHours,
      });
    }
  }

  const hasHalfDay = overtimeType === 'half_day';
  const fullDaysCount = fullCycles + (overtimeType === 'full_day' ? 1 : 0);

  let summaryText = `${totalHours}h (${fullCycles} ${fullCycles === 1 ? 'diária' : 'diárias'}`;
  if (hasHalfDay) summaryText += ' e meia';
  else if (overtimeType === 'full_day') summaryText = `${totalHours}h (${fullDaysCount} diárias)`;
  else if (overtimeType === 'tolerance') summaryText += ' + tolerância';
  summaryText += ')';

  return {
    checkInDateTime: `${checkInDate}T${checkInTime}`,
    checkOutDateTime: `${checkOutDate}T${checkOutTime}`,
    totalHours,
    fullCycles,
    extraHours,
    overtimeType,
    estimatedTotal: Math.round(totalAmount * 100) / 100,
    hasHalfDay,
    fullDaysCount,
    cyclesBreakdown,
    summaryText,
  };
}
