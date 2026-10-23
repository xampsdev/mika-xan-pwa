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
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#FAF7F2] text-[#1C1917] flex flex-col font-sans selection:bg-[#D96B43] selection:text-white">
      <OfflineIndicator />

      {/* Header: Compact h-14 with warm border and backdrop blur */}
      <header className="border-b border-[#E7E2D8] bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {/* Brand Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#D96B43] text-white flex items-center justify-center shadow-sm shadow-[#D96B43]/30 shrink-0">
              <Dog className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm font-bold text-[#1C1917] tracking-tight leading-none truncate">
                  Mika &amp; Xan
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB]">
                  PWA • Hospedagem
                </span>
              </div>
              <p className="text-[11px] text-[#78716C] leading-none mt-0.5 truncate hidden xs:block">
                Pet Boarding &amp; Daycare
              </p>
            </div>
          </div>

          {/* Action & Navigation Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Switcher */}
            <nav className="inline-flex rounded-xl bg-[#F0ECE4] p-0.5 border border-[#E4DEC9] text-xs">
              <button
                type="button"
                onClick={() => setCurrentView('client_flow')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                  currentView === 'client_flow'
                    ? 'bg-[#D96B43] text-white shadow-sm'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Check-in</span>
                <span className="sm:hidden text-xs">Cliente</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('admin_dashboard')}
                className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                  currentView === 'admin_dashboard'
                    ? 'bg-[#D96B43] text-white shadow-sm'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Painel</span>
                <span className="sm:hidden text-xs">Admin</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('architecture')}
                className={`min-h-[34px] px-2 rounded-lg font-semibold hidden md:flex items-center gap-1.5 transition ${
                  currentView === 'architecture'
                    ? 'bg-[#D96B43] text-white shadow-sm'
                    : 'text-[#78716C] hover:text-[#1C1917]'
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
                className="hidden sm:inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg bg-[#245235] hover:bg-[#1C412A] text-white text-xs font-semibold shadow-sm transition"
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </button>
            )}

            {isIOS && !isInstalled && (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="inline-flex items-center gap-1 min-h-[34px] px-2 rounded-lg border border-[#E7E2D8] bg-white text-[#78716C] hover:text-[#1C1917] text-xs font-medium transition"
              >
                <Share2 className="w-3.5 h-3.5 text-[#D96B43]" />
                <span className="hidden sm:inline">Instalar iOS</span>
              </button>
            )}

            {isInstalled && (
              <span className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#E8F0EA] text-[#245235] text-[11px] font-medium border border-[#C5DDCB]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#245235]" />
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
          <div className="border-b border-[#E7E2D8] bg-white">
            <div className="max-w-6xl mx-auto px-4 flex gap-4 text-xs font-semibold overflow-x-auto">
              <button
                onClick={() => setActiveArchTab('overview')}
                className={`py-3 border-b-2 font-medium whitespace-nowrap transition ${
                  activeArchTab === 'overview'
                    ? 'border-[#D96B43] text-[#D96B43]'
                    : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                Módulo 1: Visão Geral
              </button>
              <button
                onClick={() => setActiveArchTab('schema')}
                className={`py-3 border-b-2 font-medium whitespace-nowrap transition ${
                  activeArchTab === 'schema'
                    ? 'border-[#D96B43] text-[#D96B43]'
                    : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                Normalização dos 22 Campos
              </button>
              <button
                onClick={() => setActiveArchTab('firebase')}
                className={`py-3 border-b-2 font-medium whitespace-nowrap transition ${
                  activeArchTab === 'firebase'
                    ? 'border-[#D96B43] text-[#D96B43]'
                    : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
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
                <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E7E2D8] shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E8F0EA] text-[#245235] text-xs font-semibold border border-[#C5DDCB] mb-2">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Módulos 1, 2, 3, 4 &amp; 5 Ativos
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] tracking-tight">
                        Arquitetura Mika &amp; Xan
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-[#78716C] max-w-2xl leading-relaxed">
                        PWA mobile-first com cache persistente multi-aba via IndexedDB, 22 campos normalizados
                        em 3 coleções e Web Push standalone para iOS/Android.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-[#E7E2D8]">
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                      <UserCheck className="w-5 h-5 text-[#D96B43] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#78716C]">Coleção 1</h3>
                        <p className="text-sm font-bold text-[#1C1917]">Tutor (Campos 1 a 3)</p>
                        <p className="text-xs text-[#78716C] mt-0.5">Nome, Telefone/DDD e Veterinário</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                      <Dog className="w-5 h-5 text-[#245235] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#78716C]">Coleção 2</h3>
                        <p className="text-sm font-bold text-[#1C1917]">Pet (Campos 4 a 22)</p>
                        <p className="text-xs text-[#78716C] mt-0.5">Saúde, rotina, alimentação e foto</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                      <CalendarCheck className="w-5 h-5 text-[#D96B43] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#78716C]">Coleção 3</h3>
                        <p className="text-sm font-bold text-[#1C1917]">Stay (Histórico)</p>
                        <p className="text-xs text-[#78716C] mt-0.5">Check-in, check-out e status</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E7E2D8] space-y-2">
                    <div className="flex items-center gap-2 text-[#245235] font-bold text-sm">
                      <Database className="w-4 h-4" />
                      <span>Firestore Multi-Tab Cache</span>
                    </div>
                    <p className="text-xs text-[#78716C] leading-relaxed">
                      Sincronização offline nativa usando <code className="text-[#D96B43] bg-[#FAF7F2] px-1 py-0.5 rounded">persistentLocalCache</code>. Gravações ocorrem localmente de forma instantânea.
                    </p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E7E2D8] space-y-2">
                    <div className="flex items-center gap-2 text-[#D96B43] font-bold text-sm">
                      <Smartphone className="w-4 h-4" />
                      <span>PWA Standalone &amp; Web Push</span>
                    </div>
                    <p className="text-xs text-[#78716C] leading-relaxed">
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
                    <h3 className="text-base font-bold text-[#1C1917]">Mapeamento dos 22 Campos Normalizados</h3>
                    <p className="text-xs text-[#78716C]">
                      Estrutura estrita definida em <code className="text-[#D96B43]">src/types/schema.ts</code>
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-[#E8F0EA] text-[#245235] font-bold">
                    22 Campos
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[#E7E2D8] bg-white">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="bg-[#FAF7F2] text-[#78716C] uppercase tracking-wider font-semibold border-b border-[#E7E2D8]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Campo</th>
                        <th className="py-2.5 px-3">Chave</th>
                        <th className="py-2.5 px-3">Coleção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E2D8] text-[#1C1917]">
                      {FORM_FIELD_DEFINITIONS.map((def) => {
                        const isTutor = def.entity === 'tutor';
                        return (
                          <tr key={def.fieldNumber} className="hover:bg-[#FAF7F2] transition">
                            <td className="py-2 px-3 font-bold text-[#D96B43]">
                              {String(def.fieldNumber).padStart(2, '0')}
                            </td>
                            <td className="py-2 px-3 font-medium text-[#1C1917]">
                              {def.label}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs text-[#78716C]">{def.key}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  isTutor
                                    ? 'bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB]'
                                    : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
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
              <div className="p-5 rounded-2xl bg-white border border-[#E7E2D8] space-y-4">
                <h3 className="text-base font-bold text-[#1C1917] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#D96B43]" />
                  Instâncias Ativas e Verificação
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="text-[#78716C] block text-[10px] uppercase font-semibold">Firestore</span>
                    <span className="text-[#245235] font-medium flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Multi-Tab Cache
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="text-[#78716C] block text-[10px] uppercase font-semibold">Auth</span>
                    <span className="text-[#245235] font-medium flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Inicializado
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="text-[#78716C] block text-[10px] uppercase font-semibold">Storage</span>
                    <span className="text-[#245235] font-medium flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Base64 / DataURL
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="text-[#78716C] block text-[10px] uppercase font-semibold">Messaging</span>
                    <span className="text-[#D96B43] font-medium flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
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
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E7E2D8] p-6 shadow-2xl text-[#1C1917]">
            <h3 className="text-base font-bold text-[#1C1917] flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#D96B43]" />
              Instalar no iPhone / iPad
            </h3>
            <div className="mt-3 text-xs text-[#78716C] space-y-2 leading-relaxed">
              <p>
                1. No Safari, toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima).
              </p>
              <p>
                2. Role a lista e selecione <strong>Adicionar à Tela de Início</strong>.
              </p>
              <p>
                3. Confirme em <strong>Adicionar</strong> no canto superior direito.
              </p>
              <div className="p-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-[11px] text-[#92400E]">
                O modo <strong>standalone</strong> é obrigatório para notificações Web Push no iOS.
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold transition shadow-sm"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
