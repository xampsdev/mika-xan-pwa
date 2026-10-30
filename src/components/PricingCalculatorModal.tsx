/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Calculator,
  Calendar,
  Clock,
  Copy,
  Check,
  Sparkles,
  Info,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { calculateStayPricing, formatBRL } from '@/lib/pricingCalculator';

interface PricingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PricingCalculatorModal: React.FC<PricingCalculatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [checkInDate, setCheckInDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [checkInTime, setCheckInTime] = useState<string>('08:00');

  const [checkOutDate, setCheckOutDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().split('T')[0];
  });
  const [checkOutTime, setCheckOutTime] = useState<string>('12:00');

  const [petName, setPetName] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const pricing = useMemo(() => {
    return calculateStayPricing(checkInDate, checkInTime, checkOutDate, checkOutTime);
  }, [checkInDate, checkInTime, checkOutDate, checkOutTime]);

  if (!isOpen) return null;

  // Preset Shortcuts
  const applyPreset = (type: 'weekend' | 'one_day' | 'one_and_half' | 'holiday') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === 'one_day') {
      const inD = new Date();
      const outD = new Date(inD.getTime() + 24 * 60 * 60 * 1000);
      setCheckInDate(toIsoDate(inD));
      setCheckInTime('09:00');
      setCheckOutDate(toIsoDate(outD));
      setCheckOutTime('09:00');
    } else if (type === 'one_and_half') {
      const inD = new Date();
      const outD = new Date(inD.getTime() + 24 * 60 * 60 * 1000);
      setCheckInDate(toIsoDate(inD));
      setCheckInTime('08:00');
      setCheckOutDate(toIsoDate(outD));
      setCheckOutTime('12:00');
    } else if (type === 'weekend') {
      // Next Friday to Sunday
      const friday = new Date();
      const day = friday.getDay();
      const daysUntilFri = (5 - day + 7) % 7 || 7;
      friday.setDate(friday.getDate() + daysUntilFri);

      const sunday = new Date(friday);
      sunday.setDate(sunday.getDate() + 2);

      setCheckInDate(toIsoDate(friday));
      setCheckInTime('18:00');
      setCheckOutDate(toIsoDate(sunday));
      setCheckOutTime('18:00');
    } else if (type === 'holiday') {
      // 3 days
      const inD = new Date();
      const outD = new Date(inD.getTime() + 3 * 24 * 60 * 60 * 1000);
      setCheckInDate(toIsoDate(inD));
      setCheckInTime('08:00');
      setCheckOutDate(toIsoDate(outD));
      setCheckOutTime('17:00');
    }
  };

  const handleCopyWhatsApp = () => {
    if (!pricing) return;

    const inDateParts = checkInDate.split('-');
    const inFormatted = `${inDateParts[2]}/${inDateParts[1]}`;
    const outDateParts = checkOutDate.split('-');
    const outFormatted = `${outDateParts[2]}/${outDateParts[1]}`;

    const petText = petName.trim() ? ` para *${petName.trim()}*` : '';

    const cyclesText = pricing.cyclesBreakdown
      .map((c) => `  • ${c.description}: ${c.rate === 0 ? 'Cortesia' : formatBRL(c.rate)}`)
      .join('\n');

    const message = `🐾 *Orçamento Hospedagem Mika & Xan*${petText}\n\n` +
      `📅 *Entrada:* ${inFormatted} às ${checkInTime}\n` +
      `📅 *Saída:* ${outFormatted} às ${checkOutTime}\n` +
      `⏱️ *Duração Total:* ${pricing.totalHours}h (${pricing.summaryText})\n\n` +
      `📋 *Composição dos Ciclos de 24h:*\n${cyclesText}\n\n` +
      `💰 *Valor Total:* *${formatBRL(pricing.estimatedTotal)}*\n\n` +
      `✨ *Diferenciais inclusos:*\n` +
      `• Supervisão familiar 24 horas no lar\n` +
      `• Rotina individualizada de alimentação e passeios\n` +
      `• Fotos, vídeos e atualizações diárias no WhatsApp\n` +
      `• Ambiente seguro, limpo e climatizado`;

    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white border border-[#dec2cb]/60 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] p-4 sm:p-5 flex items-center justify-between border-b border-[#dec2cb]/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/90 text-[#2D3E5E] flex items-center justify-center shadow-sm">
              <Calculator className="w-5 h-5 text-[#2D3E5E]" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#1E293B]">Calculadora 24h &amp; Orçamentos</h3>
              <p className="text-[11px] text-[#1E293B] font-medium opacity-90">
                Simulador de diárias exatas, feriados e meia diária de horas extras
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/70 hover:bg-white text-[#1E293B] flex items-center justify-center transition shadow-xs cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Preset Shortcuts */}
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block mb-1.5">
              Atalhos Rápidos:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('one_day')}
                className="min-h-[36px] px-2 py-1.5 rounded-xl bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] transition"
              >
                1 Diária (24h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('one_and_half')}
                className="min-h-[36px] px-2 py-1.5 rounded-xl bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] transition"
              >
                24h + Meia (28h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('weekend')}
                className="min-h-[36px] px-2 py-1.5 rounded-xl bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] transition"
              >
                Sex 18h → Dom 18h
              </button>
              <button
                type="button"
                onClick={() => applyPreset('holiday')}
                className="min-h-[36px] px-2 py-1.5 rounded-xl bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] transition"
              >
                Feriadão (3d)
              </button>
            </div>
          </div>

          {/* Optional Pet Name for WhatsApp copy */}
          <div>
            <label className="block text-xs font-bold text-[#1E293B] mb-1">
              Nome do Pet (Opcional, para o WhatsApp)
            </label>
            <input
              type="text"
              placeholder="Ex: Thor, Mel, Pipoca..."
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              className="w-full min-h-[44px] bg-[#FAF8F9] border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] focus:bg-white rounded-xl px-3.5 py-2 text-sm text-[#1E293B]"
            />
          </div>

          {/* Date & Time Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
            {/* Check-in */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-[#1E293B] uppercase tracking-wider block">
                Entrada (Check-in)
              </span>
              <div>
                <label className="block text-[10px] text-[#64748B] font-bold mb-0.5">Data</label>
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full min-h-[44px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-xl px-3 py-2 text-sm text-[#1E293B] font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#64748B] font-bold mb-0.5">Horário</label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-full min-h-[44px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-xl px-3 py-2 text-sm text-[#1E293B] font-mono"
                />
              </div>
            </div>

            {/* Check-out */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-[#1E293B] uppercase tracking-wider block">
                Saída (Check-out)
              </span>
              <div>
                <label className="block text-[10px] text-[#64748B] font-bold mb-0.5">Data</label>
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full min-h-[44px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-xl px-3 py-2 text-sm text-[#1E293B] font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#64748B] font-bold mb-0.5">Horário</label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-full min-h-[44px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-xl px-3 py-2 text-sm text-[#1E293B] font-mono"
                />
              </div>
            </div>
          </div>

          {/* Pricing Result Card */}
          {pricing ? (
            <div className="rounded-2xl border border-[#dec2cb] bg-white shadow-xs overflow-hidden">
              <div className="bg-[#c5b9cd]/30 px-4 py-2.5 flex items-center justify-between border-b border-[#dec2cb]/60">
                <span className="text-xs font-bold text-[#1E293B]">
                  Duração: {pricing.totalHours} horas
                </span>
                <span className="text-[11px] font-bold text-[#2D3E5E] bg-white px-2 py-0.5 rounded-full border border-[#dec2cb]">
                  {pricing.summaryText}
                </span>
              </div>

              <div className="p-3.5 space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                    Composição do Orçamento:
                  </span>
                  {pricing.cyclesBreakdown.map((cycle, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/50 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="w-2 h-2 rounded-full bg-[#92a8d1] shrink-0" />
                        <span className="text-[#1E293B] font-medium truncate">
                          {cycle.description}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[#1E293B] shrink-0">
                        {cycle.rate === 0 ? 'Cortesia' : formatBRL(cycle.rate)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grand Total */}
                <div className="pt-2 border-t border-[#dec2cb]/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#64748B] block">Valor Calculado</span>
                    <span className="text-[10px] text-[#64748B]">Tabela vigente 24h</span>
                  </div>
                  <span className="text-2xl font-black text-[#1E293B]">
                    {formatBRL(pricing.estimatedTotal)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-[#64748B] rounded-2xl bg-[#FAF8F9] border border-dashed border-[#dec2cb]">
              Informe datas e horários válidos (a saída deve ser posterior à entrada).
            </div>
          )}

          {/* Pricing Legend Reference */}
          <div className="p-3 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-[11px] space-y-1 text-[#64748B]">
            <p className="font-bold text-[#1E293B] flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-[#2D3E5E]" />
              Regras do Motor de Diárias:
            </p>
            <p>• <strong>Segunda a Quinta:</strong> R$ 79,00 (Meia = R$ 39,50)</p>
            <p>• <strong>Sexta, Sábado, Domingo ou Feriados:</strong> R$ 89,00 (Meia = R$ 44,50)</p>
            <p>• <strong>Horas Extras na Saída:</strong> Até 30min cortesia | Até 6h = +meia diária | Mais de 6h = +1 diária inteira</p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-[#dec2cb]/60 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-[#c5b9cd] bg-white hover:bg-[#FAF8F9] text-xs font-bold text-[#1E293B] transition"
          >
            Fechar
          </button>

          <button
            type="button"
            disabled={!pricing}
            onClick={handleCopyWhatsApp}
            className="min-h-[44px] px-5 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] active:scale-[0.99] text-white text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#92a8d1]" />
                <span>Copiado com Sucesso!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#92a8d1]" />
                <span>Copiar Orçamento WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
