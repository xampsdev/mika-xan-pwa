/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  ShieldCheck,
  Database,
  Smartphone,
  HardDriveDownload,
  Share2,
  CheckCircle2,
  Dog,
  UserCheck,
  CalendarCheck,
  ClipboardList,
  Cpu,
  LayoutDashboard,
} from 'lucide-react';
import { FORM_FIELD_DEFINITIONS } from '@/types/schema';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { ClientCheckIn } from '@/pages/ClientCheckIn';
import { AdminDashboard } from '@/pages/AdminDashboard';

export default function App() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [currentView, setCurrentView] = useState<'client_flow' | 'admin_dashboard' | 'architecture'>('client_flow');
  const [activeArchTab, setActiveArchTab] = useState<'overview' | 'schema' | 'firebase'>('overview');

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#FAF8F9] text-[#1E293B] flex flex-col font-sans selection:bg-[#92a8d1] selection:text-[#1E293B]">
      <OfflineIndicator />

      {/* Header: Compact h-14 with Rose Quartz / Serenity accents & backdrop blur */}
      <header className="border-b border-[#dec2cb]/60 bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {/* Brand Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] text-[#1E293B] flex items-center justify-center shadow-sm border border-[#dec2cb]/80 shrink-0">
              <Dog className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm font-black text-[#1E293B] tracking-tight leading-none truncate">
                  Mika &amp; Xan
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-[#c5b9cd]/30 text-[#1E293B] border border-[#dec2cb]">
                  PWA • Hospedagem
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] leading-none mt-0.5 truncate hidden xs:block">
                Pet Boarding &amp; Daycare
              </p>
            </div>
          </div>

          {/* Action & Navigation Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Switcher */}
            <nav className="inline-flex rounded-xl bg-[#F3EFF2] p-0.5 border border-[#dec2cb]/70 text-xs">
              <button
                type="button"
                onClick={() => setCurrentView('client_flow')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg font-bold flex items-center gap-1.5 transition ${
                  currentView === 'client_flow'
                    ? 'bg-[#92a8d1] text-[#1E293B] shadow-sm border border-[#7b93c2]/40'
                    : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Check-in</span>
                <span className="sm:hidden text-xs">Cliente</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('admin_dashboard')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg font-bold flex items-center gap-1.5 transition ${
                  currentView === 'admin_dashboard'
                    ? 'bg-[#92a8d1] text-[#1E293B] shadow-sm border border-[#7b93c2]/40'
                    : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Painel</span>
                <span className="sm:hidden text-xs">Admin</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('architecture')}
                className={`min-h-[34px] px-2 rounded-lg font-bold hidden md:flex items-center gap-1.5 transition ${
                  currentView === 'architecture'
                    ? 'bg-[#92a8d1] text-[#1E293B] shadow-sm border border-[#7b93c2]/40'
                    : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
                title="Arquitetura do Sistema"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Info</span>
              </button>
            </nav>

            {isInstallable && (
              <button
                onClick={install}
                className="hidden sm:inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg bg-[#2D3E5E] hover:bg-[#1E293B] text-white text-xs font-bold shadow-sm transition"
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </button>
            )}

            {isIOS && !isInstalled && (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="inline-flex items-center gap-1 min-h-[34px] px-2 rounded-lg border border-[#dec2cb] bg-white text-[#1E293B] hover:bg-[#FAF8F9] text-xs font-semibold transition"
              >
                <Share2 className="w-3.5 h-3.5 text-[#2D3E5E]" />
                <span className="hidden sm:inline">Instalar iOS</span>
              </button>
            )}

            {isInstalled && (
              <span className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#d2e3d8] text-[#133E26] text-[11px] font-bold border border-[#a3cbb1]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                Instalado
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      {currentView === 'client_flow' && (
        <main className="flex-1 w-full overflow-x-hidden">
          <ClientCheckIn />
        </main>
      )}

      {currentView === 'admin_dashboard' && (
        <main className="flex-1 w-full overflow-x-hidden">
          <AdminDashboard />
        </main>
      )}

      {currentView === 'architecture' && (
        <div className="flex-1 flex flex-col w-full overflow-x-hidden">
          {/* Sub-Navigation */}
          <div className="border-b border-[#dec2cb]/60 bg-white">
            <div className="max-w-6xl mx-auto px-4 flex gap-4 text-xs font-bold overflow-x-auto">
              <button
                onClick={() => setActiveArchTab('overview')}
                className={`py-3 border-b-2 font-bold whitespace-nowrap transition ${
                  activeArchTab === 'overview'
                    ? 'border-[#92a8d1] text-[#1E293B]'
                    : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                Módulo 1: Visão Geral
              </button>
              <button
                onClick={() => setActiveArchTab('schema')}
                className={`py-3 border-b-2 font-bold whitespace-nowrap transition ${
                  activeArchTab === 'schema'
                    ? 'border-[#92a8d1] text-[#1E293B]'
                    : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                Normalização dos 22 Campos
              </button>
              <button
                onClick={() => setActiveArchTab('firebase')}
                className={`py-3 border-b-2 font-bold whitespace-nowrap transition ${
                  activeArchTab === 'firebase'
                    ? 'border-[#92a8d1] text-[#1E293B]'
                    : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
                }`}
              >
                Configuração Offline Firebase
              </button>
            </div>
          </div>

          {/* Main Architecture Content */}
          <main className="max-w-6xl mx-auto px-4 py-6 flex-1 w-full">
            {activeArchTab === 'overview' && (
              <div className="space-y-4">
                <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#dec2cb]/60 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] text-[#1E293B] text-xs font-bold border border-[#dec2cb] mb-2 shadow-xs">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Módulos 1, 2, 3, 4 &amp; 5 Ativos
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] tracking-tight">
                        Arquitetura Mika &amp; Xan
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-[#64748B] max-w-2xl leading-relaxed">
                        PWA mobile-first com cache persistente multi-aba via IndexedDB, 22 campos normalizados
                        em 3 coleções e Web Push standalone para iOS/Android.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-[#dec2cb]/60">
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                      <UserCheck className="w-5 h-5 text-[#2D3E5E] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Coleção 1</h3>
                        <p className="text-sm font-bold text-[#1E293B]">Tutor (Campos 1 a 3)</p>
                        <p className="text-xs text-[#64748B] mt-0.5">Nome, Telefone/DDD e Veterinário</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                      <Dog className="w-5 h-5 text-[#2D3E5E] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Coleção 2</h3>
                        <p className="text-sm font-bold text-[#1E293B]">Pet (Campos 4 a 22)</p>
                        <p className="text-xs text-[#64748B] mt-0.5">Saúde, rotina, alimentação e foto</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                      <CalendarCheck className="w-5 h-5 text-[#2D3E5E] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Coleção 3</h3>
                        <p className="text-sm font-bold text-[#1E293B]">Stay (Histórico)</p>
                        <p className="text-xs text-[#64748B] mt-0.5">Check-in, check-out e status</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#dec2cb]/60 space-y-2">
                    <div className="flex items-center gap-2 text-[#1E293B] font-bold text-sm">
                      <Database className="w-4 h-4 text-[#92a8d1]" />
                      <span>Firestore Multi-Tab Cache</span>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      Sincronização offline nativa usando <code className="text-[#1E293B] bg-[#F3EFF2] px-1 py-0.5 rounded font-mono">persistentLocalCache</code>. Gravações ocorrem localmente de forma instantânea.
                    </p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#dec2cb]/60 space-y-2">
                    <div className="flex items-center gap-2 text-[#1E293B] font-bold text-sm">
                      <Smartphone className="w-4 h-4 text-[#92a8d1]" />
                      <span>PWA Standalone &amp; Web Push</span>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      Compatibilidade estrita com Web Push no iOS Safari 16.4+ via PWA adicionado à tela de início.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeArchTab === 'schema' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#1E293B]">Mapeamento dos 22 Campos Normalizados</h3>
                    <p className="text-xs text-[#64748B]">
                      Estrutura estrita definida em <code className="text-[#1E293B] font-mono">src/types/schema.ts</code>
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-md bg-[#92a8d1] text-[#1E293B] font-bold border border-[#7b93c2]/40">
                    22 Campos
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[#dec2cb]/60 bg-white">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="bg-[#FAF8F9] text-[#64748B] uppercase tracking-wider font-bold border-b border-[#dec2cb]/60">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Campo</th>
                        <th className="py-2.5 px-3">Chave</th>
                        <th className="py-2.5 px-3">Coleção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#dec2cb]/60 text-[#1E293B]">
                      {FORM_FIELD_DEFINITIONS.map((def) => {
                        const isTutor = def.entity === 'tutor';
                        return (
                          <tr key={def.fieldNumber} className="hover:bg-[#FAF8F9] transition">
                            <td className="py-2 px-3 font-black text-[#1E293B]">
                              {String(def.fieldNumber).padStart(2, '0')}
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#1E293B]">
                              {def.label}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs text-[#64748B]">{def.key}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isTutor
                                    ? 'bg-[#c5b9cd]/40 text-[#1E293B] border border-[#dec2cb]'
                                    : 'bg-[#92a8d1]/30 text-[#1E293B] border border-[#7b93c2]/40'
                                }`}
                              >
                                {def.entity}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeArchTab === 'firebase' && (
              <div className="p-5 rounded-2xl bg-white border border-[#dec2cb]/60 space-y-4">
                <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#92a8d1]" />
                  Instâncias Ativas e Verificação
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="text-[#64748B] block text-[10px] uppercase font-bold">Firestore</span>
                    <span className="text-[#133E26] font-bold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                      Multi-Tab Cache
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="text-[#64748B] block text-[10px] uppercase font-bold">Auth</span>
                    <span className="text-[#133E26] font-bold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                      Inicializado
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="text-[#64748B] block text-[10px] uppercase font-bold">Storage</span>
                    <span className="text-[#133E26] font-bold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                      Base64 / DataURL
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="text-[#64748B] block text-[10px] uppercase font-bold">Messaging</span>
                    <span className="text-[#133E26] font-bold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                      Push Ready
                    </span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* iOS Safari Installation Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#dec2cb]/60 p-6 shadow-2xl text-[#1E293B]">
            <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#2D3E5E]" />
              Instalar no iPhone / iPad
            </h3>
            <div className="mt-3 text-xs text-[#64748B] space-y-2 leading-relaxed">
              <p>
                1. No Safari, toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima).
              </p>
              <p>
                2. Role a lista e selecione <strong>Adicionar à Tela de Início</strong>.
              </p>
              <p>
                3. Confirme em <strong>Adicionar</strong> no canto superior direito.
              </p>
              <div className="p-3 rounded-xl bg-[#f7cac9]/40 border border-[#dec2cb] text-[11px] text-[#1E293B] font-medium">
                O modo <strong>standalone</strong> é obrigatório para notificações Web Push no iOS.
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] text-xs font-bold transition shadow-sm border border-[#7b93c2]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
