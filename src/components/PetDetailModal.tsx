/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  deepCleanUndefined,
} from '@/lib/firebase';
import {
  X,
  Dog,
  User,
  Phone,
  HeartPulse,
  Utensils,
  Camera,
  Calendar,
  CheckCircle2,
  CalendarPlus,
  Loader2,
  ShieldAlert,
  Trash2,
  FileText,
  Lock,
  Save,
  Calculator,
  DollarSign,
  Edit3,
  Check,
} from 'lucide-react';
import { compressImageToDataUrl } from '@/utils/imageCompression';
import { cascadeDeletePet } from '@/utils/petDeletion';
import { calculateStayPricing, formatBRL } from '@/lib/pricingCalculator';
import type { Pet, Tutor, Stay, StayStatus } from '@/types/schema';

interface PetDetailModalProps {
  pet: Pet | null;
  tutor: Tutor | null;
  isOpen: boolean;
  onClose: () => void;
  onPetUpdated?: (updatedPet: Pet) => void;
  onPetDeleted?: (petId: string) => void;
}

export const PetDetailModal: React.FC<PetDetailModalProps> = ({
  pet,
  tutor,
  isOpen,
  onClose,
  onPetUpdated,
  onPetDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'stays'>('profile');
  const [stays, setStays] = useState<Stay[]>([]);
  const [loadingStays, setLoadingStays] = useState<boolean>(true);
  const [staysMetadataFromCache, setStaysMetadataFromCache] = useState<boolean>(false);

  // Private Admin Internal Notes State (pet_admin_notes collection)
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [adminNotesUpdatedAt, setAdminNotesUpdatedAt] = useState<Date | null>(null);
  const [savingAdminNotes, setSavingAdminNotes] = useState<boolean>(false);
  const [adminNotesFeedback, setAdminNotesFeedback] = useState<string | null>(null);

  // Per-Stay Admin Notes State (Stay.adminStayNotes)
  const [editingStayNotes, setEditingStayNotes] = useState<Record<string, string>>({});
  const [savingStayNoteId, setSavingStayNoteId] = useState<string | null>(null);

  // Photo Upload State
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string>('');

  // Delete State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // New Stay Form State
  const [showNewStayForm, setShowNewStayForm] = useState<boolean>(false);
  const [newStayCheckIn, setNewStayCheckIn] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [newStayCheckOut, setNewStayCheckOut] = useState<string>(
    new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16)
  );
  const [newStayNotes, setNewStayNotes] = useState<string>('');
  const [submittingStay, setSubmittingStay] = useState<boolean>(false);

  // Price Adjustment State per stay
  const [editingPriceStayId, setEditingPriceStayId] = useState<string | null>(null);
  const [adjustedPriceInput, setAdjustedPriceInput] = useState<string>('');
  const [adjustedReasonInput, setAdjustedReasonInput] = useState<string>('');
  const [savingPriceStayId, setSavingPriceStayId] = useState<string | null>(null);

  // Live Pricing for New Stay form inside modal
  const newStayPricing = useMemo(() => {
    if (!newStayCheckIn || !newStayCheckOut) return null;
    const [inDate, inTime] = newStayCheckIn.split('T');
    const [outDate, outTime] = newStayCheckOut.split('T');
    return calculateStayPricing(inDate, inTime, outDate, outTime);
  }, [newStayCheckIn, newStayCheckOut]);

  useEffect(() => {
    if (pet) {
      setCurrentPhotoUrl(pet.photoUrl || '');
    }
  }, [pet]);

  // Subscribe to real-time stays for this specific pet
  useEffect(() => {
    if (!pet || !isOpen) return;

    setLoadingStays(true);
    const staysQuery = query(collection(db, 'stays'), where('petId', '==', pet.id));

    const unsubscribe = onSnapshot(
      staysQuery,
      { includeMetadataChanges: true },
      (snapshot: any) => {
        setStaysMetadataFromCache(Boolean(snapshot.metadata?.fromCache));
        const staysList: Stay[] = [];
        const notesMap: Record<string, string> = {};

        snapshot.forEach((docSnap: any) => {
          const stayData = { id: docSnap.id, ...docSnap.data() } as Stay;
          staysList.push(stayData);
          if (stayData.adminStayNotes !== undefined) {
            notesMap[stayData.id] = stayData.adminStayNotes;
          }
        });

        staysList.sort(
          (a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
        );

        setStays(staysList);
        setEditingStayNotes((prev) => ({ ...notesMap, ...prev }));
        setLoadingStays(false);
      },
      (error: any) => {
        console.warn('Stays listener error (offline cache active):', error);
        setLoadingStays(false);
      }
    );

    return () => unsubscribe();
  }, [pet, isOpen]);

  // Subscribe to private Admin Internal Notes (pet_admin_notes/{petId})
  useEffect(() => {
    if (!pet || !isOpen) return;

    const unsubAdminNotes = onSnapshot(
      doc(db, 'pet_admin_notes', pet.id),
      { includeMetadataChanges: true },
      (docSnap: any) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAdminNotes(data.internalNotes || '');
          if (data.updatedAt?.toDate) {
            setAdminNotesUpdatedAt(data.updatedAt.toDate());
          } else if (data.updatedAt) {
            setAdminNotesUpdatedAt(new Date(data.updatedAt));
          }
        } else {
          setAdminNotes('');
          setAdminNotesUpdatedAt(null);
        }
      },
      (err: any) => {
        console.warn('Admin internal notes listener notice:', err);
      }
    );

    return () => unsubAdminNotes();
  }, [pet, isOpen]);

  if (!isOpen || !pet) return null;

  // Handle saving fixed Admin Internal Notes for the Pet
  const handleSaveAdminNotes = async () => {
    if (!pet) return;
    setSavingAdminNotes(true);
    setAdminNotesFeedback(null);
    try {
      await setDoc(
        doc(db, 'pet_admin_notes', pet.id),
        deepCleanUndefined({
          petId: pet.id,
          internalNotes: adminNotes || '',
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      setAdminNotesFeedback('Observação salva com sucesso!');
      setAdminNotesUpdatedAt(new Date());
      setTimeout(() => setAdminNotesFeedback(null), 3500);
    } catch (err: any) {
      console.error('Failed to save admin internal notes:', err);
      alert('Erro ao salvar observação interna: ' + (err?.message || 'Erro de permissão'));
    } finally {
      setSavingAdminNotes(false);
    }
  };

  // Handle saving per-stay Admin Notes
  const handleSaveStayAdminNotes = async (stayId: string, notes: string) => {
    setSavingStayNoteId(stayId);
    try {
      await updateDoc(
        doc(db, 'stays', stayId),
        deepCleanUndefined({
          adminStayNotes: notes || '',
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err: any) {
      console.error('Failed to update stay admin notes:', err);
      alert('Erro ao salvar anotação desta estadia: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setSavingStayNoteId(null);
    }
  };

  // Handle Photo Upload (Direct compressed DataURL to Firestore)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 600, 0.7);

      await updateDoc(
        doc(db, 'pets', pet.id),
        deepCleanUndefined({
          photoUrl: dataUrl || '',
          updatedAt: serverTimestamp(),
        })
      );

      setCurrentPhotoUrl(dataUrl);
      if (onPetUpdated) {
        onPetUpdated({ ...pet, photoUrl: dataUrl });
      }
    } catch (err) {
      console.error('Failed to update photo:', err);
      alert('Falha ao processar ou atualizar a foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Delete Pet and Cascade Stays + Admin Notes
  const handleDeletePet = async () => {
    if (!pet) return;
    setIsDeleting(true);
    try {
      const result = await cascadeDeletePet(pet.id, pet.tutorId);
      if (result.success) {
        if (onPetDeleted) {
          onPetDeleted(pet.id);
        }
        setShowDeleteConfirm(false);
        onClose();
      } else {
        alert(result.error || 'Falha ao excluir a ficha do pet.');
      }
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado ao excluir o pet.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Update Stay Status (Stay Approval Workflow)
  const handleUpdateStayStatus = async (stayId: string, newStatus: StayStatus) => {
    try {
      const updates: Partial<Stay> & { updatedAt?: any } = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === 'completed') {
        updates.actualCheckOutDate = new Date().toISOString();
      }
      await updateDoc(doc(db, 'stays', stayId), deepCleanUndefined(updates));
    } catch (err) {
      console.error('Error updating stay status:', err);
      alert('Erro ao atualizar status da estadia.');
    }
  };


  // Handle saving customized price for a stay
  const handleSavePriceAdjustment = async (stayId: string) => {
    const num = parseFloat(adjustedPriceInput.replace(',', '.'));
    if (isNaN(num) || num < 0) {
      alert('Por favor informe um valor válido em R$.');
      return;
    }
    setSavingPriceStayId(stayId);
    try {
      await updateDoc(
        doc(db, 'stays', stayId),
        deepCleanUndefined({
          finalTotal: num,
          adminPricingAdjustmentReason: (adjustedReasonInput || '').trim(),
          updatedAt: serverTimestamp(),
        })
      );
      setEditingPriceStayId(null);
    } catch (err: any) {
      console.error('Failed to update stay price:', err);
      alert('Erro ao atualizar valor da estadia: ' + (err?.message || 'Erro'));
    } finally {
      setSavingPriceStayId(null);
    }
  };

  // Create New Stay Record
  const handleCreateNewStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pet) return;

    setSubmittingStay(true);
    try {
      const [inDate, inTime] = newStayCheckIn.split('T');
      const [outDate, outTime] = newStayCheckOut.split('T');
      const pricing = calculateStayPricing(inDate, inTime, outDate, outTime);

      const newStayData: Omit<Stay, 'id'> = deepCleanUndefined({
        petId: pet.id,
        tutorId: pet.tutorId,
        checkInDate: newStayCheckIn,
        checkOutDate: newStayCheckOut,
        status: 'active' as StayStatus,
        specialStayNotes: (newStayNotes || '').trim(),
        estimatedTotal: pricing?.estimatedTotal ?? 0,
        finalTotal: pricing?.estimatedTotal ?? 0,
        totalHours: pricing?.totalHours ?? 0,
        ...(pricing ? { pricingBreakdown: deepCleanUndefined(pricing) } : {}),
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'stays'), deepCleanUndefined(newStayData));
      setShowNewStayForm(false);
      setNewStayNotes('');
    } catch (err) {
      console.error('Error creating stay:', err);
      alert('Erro ao registrar nova estadia.');
    } finally {
      setSubmittingStay(false);
    }
  };

  const hasMedicalAlerts =
    Boolean(pet.allergiesAndProtocol?.trim()) ||
    Boolean(pet.continuousTreatmentDetails?.trim()) ||
    Boolean(pet.dietaryOrPhysicalRestrictions?.trim()) ||
    Boolean(pet.pastSevereIllnessOrChronic?.trim()) ||
    !pet.vaccinationUpToDate ||
    pet.destroysOrIngestsObjects;

  // Has at least one approved stay (active or completed)
  const hasApprovedStay = stays.some((s) => s.status === 'active' || s.status === 'completed');
  const pendingStay = stays.find((s) => s.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      {/* Mobile Bottom Sheet & Desktop Centered Modal */}
      <div className="fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl overflow-hidden bg-white border-t border-[#dec2cb]/60 shadow-2xl flex flex-col text-[#1E293B] sm:static sm:inset-auto sm:max-h-[88vh] sm:max-w-3xl sm:w-full sm:rounded-3xl sm:border sm:border-[#dec2cb]/60">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 border-b border-[#dec2cb]/60 p-4 sm:p-5 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt={pet.nameAndBreed}
                className="w-12 h-12 rounded-2xl object-cover border border-[#dec2cb] shadow-sm shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[#c5b9cd]/30 text-[#1E293B] border border-[#dec2cb] flex items-center justify-center shrink-0">
                <Dog className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-[#1E293B] tracking-tight truncate">
                  {pet.nameAndBreed}
                </h2>
                {pet.isNeutered && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#d2e3d8] text-[#133E26] border border-[#a3cbb1]">
                    Castrado
                  </span>
                )}
                {pet.vaccinationUpToDate ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#92a8d1]/30 text-[#1E293B] border border-[#7b93c2]/40">
                    Vacinas OK
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#f7cac9] text-[#7F1D1D] border border-[#dec2cb]">
                    Vacinas Pendentes
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] truncate mt-0.5">
                {pet.ageAndWeight} • Tutor: <strong className="text-[#1E293B]">{tutor?.fullName || 'Não localizado'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#991B1B] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-[#FECACA]"
              title="Excluir Ficha e Estadias deste Pet"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excluir Ficha</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#FAF8F9] hover:bg-[#F3EFF2] text-[#64748B] hover:text-[#1E293B] transition border border-[#dec2cb]/60"
              title="Fechar Ficha"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Large Touch-Friendly Navigation Tabs (horizontally scrollable, no-scrollbar) */}
        <div className="border-b border-[#dec2cb]/60 bg-[#FAF8F9] px-4 sm:px-6 flex gap-3 text-xs font-bold shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('profile')}
            className={`min-h-[44px] py-2.5 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'profile'
                ? 'border-[#92a8d1] text-[#1E293B]'
                : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            <Dog className="w-4 h-4 text-[#2D3E5E]" />
            <span>Ficha Completa (22 Campos)</span>
          </button>
          <button
            onClick={() => setActiveTab('stays')}
            className={`min-h-[44px] py-2.5 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'stays'
                ? 'border-[#92a8d1] text-[#1E293B]'
                : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            <Calendar className="w-4 h-4 text-[#2D3E5E]" />
            <span>Histórico de Estadias ({stays.length})</span>
            {staysMetadataFromCache && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#c5b9cd]/40 text-[#1E293B]">
                cache
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Medical Alerts Banner */}
              {hasMedicalAlerts && (
                <div className="p-4 rounded-2xl bg-[#f7cac9]/60 border border-[#dec2cb] space-y-2">
                  <div className="flex items-center gap-2 text-[#7F1D1D] font-bold text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 text-[#7F1D1D]" />
                    <span>Alertas Médicos &amp; Cuidados Críticos</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {pet.allergiesAndProtocol && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Alergias e Protocolo:</span>
                        <span className="text-[#1E293B] font-medium">{pet.allergiesAndProtocol}</span>
                      </div>
                    )}
                    {pet.continuousTreatmentDetails && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Medicação Contínua:</span>
                        <span className="text-[#1E293B] font-medium">{pet.continuousTreatmentDetails}</span>
                      </div>
                    )}
                    {pet.destroysOrIngestsObjects && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Risco de Ingestão:</span>
                        <span className="text-[#1E293B] font-medium">Destrói ou engole objetos não alimentares!</span>
                      </div>
                    )}
                    {pet.dietaryOrPhysicalRestrictions && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Restrição Alimentar/Física:</span>
                        <span className="text-[#1E293B] font-medium">{pet.dietaryOrPhysicalRestrictions}</span>
                      </div>
                    )}
                    {pet.pastSevereIllnessOrChronic && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Histórico de Doenças/Cirurgias:</span>
                        <span className="text-[#1E293B] font-medium">{pet.pastSevereIllnessOrChronic}</span>
                      </div>
                    )}
                    {!pet.vaccinationUpToDate && (
                      <div className="p-2.5 rounded-xl bg-white/90 border border-[#dec2cb]">
                        <span className="font-bold text-[#7F1D1D] block">Atenção Vacinal:</span>
                        <span className="text-[#1E293B] font-medium">Carteira de vacinação desatualizada</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  Observações Fixas do Admin sobre o Cão (pet_admin_notes)
                  Private to Admin - Zero Client Exposure
              ───────────────────────────────────────────────────────────── */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#dec2cb]/80 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#dec2cb]/60 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#f7cac9] to-[#92a8d1] flex items-center justify-center text-[#1E293B] border border-[#dec2cb]">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">
                          Observações Fixas do Admin sobre o Cão
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FAF8F9] border border-[#dec2cb] text-[#64748B]">
                          Privado
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">
                        Gravado exclusivamente na coleção isolada <code className="font-mono text-[#1E293B]">pet_admin_notes</code>.
                      </p>
                    </div>
                  </div>

                  {adminNotesUpdatedAt && (
                    <span className="text-[10px] font-semibold text-[#64748B] self-start sm:self-auto bg-[#FAF8F9] px-2.5 py-1 rounded-lg border border-[#dec2cb]">
                      Salvo em {adminNotesUpdatedAt.toLocaleDateString('pt-BR')} às {adminNotesUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {hasApprovedStay ? (
                  <div className="space-y-2.5">
                    <textarea
                      rows={4}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Ex: Cãozinho dócil, mas prefere comer isolado de outros machos. Gosta de carinho atrás da orelha antes de dormir. Tutor é pontual."
                      className="w-full min-h-[100px] text-base p-3.5 rounded-xl border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] bg-white text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition leading-relaxed"
                    />

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {adminNotesFeedback && (
                          <span className="text-xs font-bold text-[#133E26] flex items-center gap-1 bg-[#d2e3d8] px-2.5 py-1 rounded-lg border border-[#a3cbb1]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                            <span>{adminNotesFeedback}</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={savingAdminNotes}
                        onClick={handleSaveAdminNotes}
                        className="min-h-[44px] px-5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] disabled:opacity-50 text-[#1E293B] font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm border border-[#7b93c2] cursor-pointer"
                      >
                        {savingAdminNotes ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E293B]" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5 text-[#1E293B]" />
                            <span>Salvar Observação do Cão</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#FAF8F9] border border-[#dec2cb] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-[#64748B] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-[#1E293B]">
                          Anotações internas bloqueadas até a aprovação da hospedagem
                        </p>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          {pendingStay
                            ? 'Aprove a solicitação de check-in pendente para liberar o campo de anotações internas deste cão.'
                            : 'Inicie ou lance uma nova estadia para liberar o campo de anotações internas deste cão.'}
                        </p>
                      </div>
                    </div>

                    {pendingStay && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStayStatus(pendingStay.id, 'active')}
                        className="min-h-[44px] px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] text-[#1E293B] font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm border border-[#7b93c2] shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#1E293B]" />
                        <span>Aprovar Hospedagem (Iniciar Check-in)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Photo & Uploader */}
              <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {currentPhotoUrl ? (
                    <img
                      src={currentPhotoUrl}
                      alt={pet.nameAndBreed}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-[#92a8d1] shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-[#dec2cb] flex flex-col items-center justify-center text-[#64748B] shrink-0">
                      <Camera className="w-5 h-5 mb-0.5 text-[#2D3E5E]" />
                      <span className="text-[10px]">Sem foto</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#1E293B] block truncate">
                      {currentPhotoUrl ? 'Foto Cadastrada (Campo 22)' : 'Sem Foto Cadastrada'}
                    </span>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Atualize ou tire uma foto com a câmera para reconhecimento rápido.
                    </p>
                  </div>
                </div>

                <label className="cursor-pointer min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] text-xs font-bold border border-[#7b93c2] shadow-sm transition shrink-0">
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#1E293B]" />
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-[#1E293B]" />
                      <span>{currentPhotoUrl ? 'Atualizar Foto' : 'Adicionar Foto'}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* 22 Normalized Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* SECTION 1: Tutor & Contact (Fields 1-3) */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#1E293B] font-bold text-xs uppercase tracking-wider border-b border-[#dec2cb]/60 pb-1.5">
                    <User className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Contatos e Veterinário (1 a 3)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      1. Nome do Tutor
                    </span>
                    <span className="text-sm font-bold text-[#1E293B]">
                      {tutor?.fullName || 'Não preenchido'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      2. Telefone / WhatsApp com DDD
                    </span>
                    {tutor?.phoneDDD ? (
                      <a
                        href={`https://wa.me/55${tutor.phoneDDD.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-[#1E293B] underline underline-offset-2 hover:opacity-80 flex items-center gap-1.5 font-bold"
                      >
                        <Phone className="w-3.5 h-3.5 text-[#2D3E5E]" />
                        <span>{tutor.phoneDDD}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-[#64748B]">Não informado</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      3. Veterinário Responsável
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {tutor?.vetNameAndPhone || 'Não informado'}
                    </span>
                  </div>
                </div>

                {/* SECTION 2: Identification & Basic Info (Fields 4-6, 12) */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#1E293B] font-bold text-xs uppercase tracking-wider border-b border-[#dec2cb]/60 pb-1.5">
                    <Dog className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Identificação e Porte (4 a 6, 12)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                        4. Nome &amp; Raça
                      </span>
                      <span className="text-sm font-bold text-[#1E293B]">{pet.nameAndBreed}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                        5. Idade &amp; Peso
                      </span>
                      <span className="text-xs text-[#1E293B] font-medium">{pet.ageAndWeight}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#dec2cb]/60">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                        6. Castrado
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          pet.isNeutered ? 'text-[#133E26]' : 'text-[#64748B]'
                        }`}
                      >
                        {pet.isNeutered ? 'Sim (Castrado)' : 'Não castrado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                        12. Vacinas
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          pet.vaccinationUpToDate ? 'text-[#133E26]' : 'text-[#7F1D1D]'
                        }`}
                      >
                        {pet.vaccinationUpToDate ? 'Em dia' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Routine & Feeding (Fields 15-18) */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#1E293B] font-bold text-xs uppercase tracking-wider border-b border-[#dec2cb]/60 pb-1.5">
                    <Utensils className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Alimentação e Passeios (15 a 18)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      15. Ração (Quantidade e Horários)
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.foodAmountAndSchedule || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      16. Petiscos e Alimentação Natural
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.treatsAndNaturalDiet || 'Sem restrições relatadas'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      17. Passeios Habitual
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.walkFrequencyAndDuration || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      18. Onde e Como Dorme
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.sleepBedAndLocation || 'Não informado'}
                    </span>
                  </div>
                </div>

                {/* SECTION 4: Behavior & Hygiene (Fields 7, 13, 14, 19-21) */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#1E293B] font-bold text-xs uppercase tracking-wider border-b border-[#dec2cb]/60 pb-1.5">
                    <HeartPulse className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Comportamento e Higiene (7, 13, 14, 19-21)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      7. Comportamento com Pessoas/Animais
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.behaviorPeopleAndAnimals || 'Não informado'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-2 rounded-xl bg-white border border-[#dec2cb]/60">
                      <span className="text-[9px] text-[#64748B] uppercase font-bold block">Sozinho</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.calmWhenAlone ? 'text-[#133E26]' : 'text-[#1E293B]'
                        }`}
                      >
                        {pet.calmWhenAlone ? 'Calmo' : 'Ansioso'}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white border border-[#dec2cb]/60">
                      <span className="text-[9px] text-[#64748B] uppercase font-bold block">Risco</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.destroysOrIngestsObjects ? 'text-[#7F1D1D]' : 'text-[#133E26]'
                        }`}
                      >
                        {pet.destroysOrIngestsObjects ? 'Destrói' : 'Não rói'}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white border border-[#dec2cb]/60">
                      <span className="text-[9px] text-[#64748B] uppercase font-bold block">Higiene</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.pottyTrained ? 'text-[#133E26]' : 'text-[#64748B]'
                        }`}
                      >
                        {pet.pottyTrained ? 'Correto' : 'Erra'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      20. Banho e Higiene
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.bathProtocol || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                      21. Observações e Manias
                    </span>
                    <span className="text-xs text-[#1E293B] font-medium">
                      {pet.generalNotes || 'Sem observações adicionais'}
                    </span>
                  </div>

                  {/* Danger Zone: Pet & Stays Cascade Deletion */}
                  <div className="pt-3 border-t border-[#dec2cb]/60">
                    <div className="p-3.5 rounded-2xl bg-[#f7cac9]/40 border border-[#dec2cb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-[#7F1D1D] flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Zona de Perigo • Excluir Cadastro</span>
                        </h4>
                        <p className="text-[11px] text-[#7F1D1D] mt-0.5 font-medium">
                          Exclui permanentemente a ficha deste pet, histórico de estadias e anotações internas.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir Ficha / Pet</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STAYS HISTORY */}
          {activeTab === 'stays' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1E293B]">Histórico de Hospedagens</h3>
                  <p className="text-xs text-[#64748B]">
                    Estadias ativas, pendentes e concluídas de {pet.nameAndBreed}.
                  </p>
                </div>

                <button
                  onClick={() => setShowNewStayForm(!showNewStayForm)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] border border-[#7b93c2] text-xs font-bold transition shadow-sm self-stretch sm:self-auto cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[#1E293B]" />
                  <span>{showNewStayForm ? 'Cancelar' : 'Nova Estadia'}</span>
                </button>
              </div>

              {/* New Stay Form */}
              {showNewStayForm && (
                <form
                  onSubmit={handleCreateNewStay}
                  className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb] shadow-sm space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center gap-1.5 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                    <CalendarPlus className="w-4 h-4 text-[#2D3E5E]" />
                    <span>Lançar Nova Estadia</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1">
                        Data e Hora de Check-in *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={newStayCheckIn}
                        onChange={(e) => setNewStayCheckIn(e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1">
                        Data e Hora de Check-out Previsto *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={newStayCheckOut}
                        onChange={(e) => setNewStayCheckOut(e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E293B] mb-1">
                      Instruções Específicas / Pertences
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Ração para 3 dias, coleira extra, medicação às 19h"
                      value={newStayNotes}
                      onChange={(e) => setNewStayNotes(e.target.value)}
                      className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-3.5 py-2.5 text-base text-[#1E293B]"
                    />
                  </div>

                  {newStayPricing && (
                    <div className="p-3 rounded-xl bg-white border border-[#dec2cb] flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-[#1E293B] block">
                          Estimativa: {newStayPricing.totalHours}h ({newStayPricing.summaryText})
                        </span>
                        <span className="text-[10px] text-[#64748B]">
                          Seg-Qui: R$ 79 | Sex-Dom/Feriado: R$ 89 | Meia diária extra
                        </span>
                      </div>
                      <span className="text-base font-black text-[#1E293B]">
                        {formatBRL(newStayPricing.estimatedTotal)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewStayForm(false)}
                      className="min-h-[44px] px-4 rounded-xl border border-[#c5b9cd] bg-white text-[#1E293B] text-xs font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submittingStay}
                      className="min-h-[44px] px-5 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      {submittingStay && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Salvar e Iniciar Estadia</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Stays List */}
              {loadingStays ? (
                <div className="p-6 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#92a8d1]" />
                  <span>Carregando estadias...</span>
                </div>
              ) : stays.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-xs text-[#64748B]">
                  Nenhuma estadia registrada ainda para este pet.
                </div>
              ) : (
                <div className="space-y-3">
                  {stays.map((stay) => {
                    const isActive = stay.status === 'active';
                    const isPending = stay.status === 'pending';
                    const isCompleted = stay.status === 'completed';

                    return (
                      <div
                        key={stay.id}
                        className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                          isActive
                            ? 'bg-[#d2e3d8]/60 border-[#a3cbb1]'
                            : isPending
                              ? 'bg-[#c5b9cd]/30 border-[#dec2cb]'
                              : 'bg-[#FAF8F9] border-[#dec2cb]/60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  isActive
                                    ? 'bg-[#133E26] text-white'
                                    : isPending
                                      ? 'bg-[#92a8d1] text-[#1E293B] border border-[#7b93c2]'
                                      : 'bg-stone-200 text-[#1E293B]'
                                }`}
                              >
                                {isActive ? 'Estadia Ativa' : isPending ? 'Check-in Pendente' : 'Concluída'}
                              </span>
                              <span className="text-[11px] text-[#64748B] font-mono">
                                ID: {stay.id.slice(0, 8)}
                              </span>
                            </div>

                            <div className="text-xs text-[#1E293B] font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>
                                Entrada: {new Date(stay.checkInDate).toLocaleString('pt-BR')}
                              </span>
                              <span>→</span>
                              <span>
                                Saída: {new Date(stay.checkOutDate).toLocaleString('pt-BR')}
                              </span>
                            </div>

                            {stay.specialStayNotes && (
                              <p className="text-xs text-[#64748B] italic">
                                "{stay.specialStayNotes}"
                              </p>
                            )}
                          </div>

                          {/* Status Actions (Stay Approval Workflow) */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isPending && (
                              <button
                                onClick={() => handleUpdateStayStatus(stay.id, 'active')}
                                className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] text-[#1E293B] text-xs font-bold transition shadow-sm border border-[#7b93c2] flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4 text-[#1E293B]" />
                                <span>Aprovar Hospedagem (Iniciar Check-in)</span>
                              </button>
                            )}

                            {isActive && (
                              <button
                                onClick={() => handleUpdateStayStatus(stay.id, 'completed')}
                                className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-white border border-[#dec2cb] hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold transition shadow-sm"
                              >
                                Finalizar Estadia (Check-out)
                              </button>
                            )}

                            {isCompleted && (
                              <span className="text-xs text-[#133E26] flex items-center gap-1 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#133E26]" />
                                Concluída
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 24h Cycle Dynamic Pricing & Admin Adjustment */}
                        {(() => {
                          const stayPricing = stay.pricingBreakdown || (() => {
                            if (stay.checkInDate && stay.checkOutDate) {
                              const inParts = stay.checkInDate.includes('T') ? stay.checkInDate.split('T') : [stay.checkInDate, '10:00'];
                              const outParts = stay.checkOutDate.includes('T') ? stay.checkOutDate.split('T') : [stay.checkOutDate, '10:00'];
                              return calculateStayPricing(inParts[0], inParts[1].slice(0, 5), outParts[0], outParts[1].slice(0, 5));
                            }
                            return null;
                          })();

                          const isAdjustingThisPrice = editingPriceStayId === stay.id;
                          const finalOrEstTotal = stay.finalTotal ?? stay.estimatedTotal ?? stayPricing?.estimatedTotal ?? 0;
                          const hasAdjustment =
                            stay.finalTotal !== undefined &&
                            stay.estimatedTotal !== undefined &&
                            stay.finalTotal !== stay.estimatedTotal;

                          return (
                            <div className="mt-1 pt-2 border-t border-[#dec2cb]/60 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-[#dec2cb]/60 text-xs">
                                <div className="flex items-center gap-2">
                                  <Calculator className="w-4 h-4 text-[#2D3E5E]" />
                                  <div>
                                    <span className="font-black text-[#1E293B]">
                                      {formatBRL(finalOrEstTotal)}
                                    </span>
                                    {hasAdjustment && (
                                      <span className="text-[10px] text-[#64748B] ml-1.5 line-through">
                                        {formatBRL(stay.estimatedTotal!)}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-[#64748B] ml-1.5 font-medium">
                                      ({stay.totalHours || stayPricing?.totalHours || 24}h • {stayPricing?.summaryText || 'Ciclos 24h'})
                                    </span>
                                    {stay.adminPricingAdjustmentReason && (
                                      <span className="text-[10px] text-[#2D3E5E] font-medium ml-1.5 bg-[#FAF8F9] px-1.5 py-0.5 rounded border border-[#dec2cb]">
                                        Nota: {stay.adminPricingAdjustmentReason}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isAdjustingThisPrice) {
                                      setEditingPriceStayId(null);
                                    } else {
                                      setEditingPriceStayId(stay.id);
                                      setAdjustedPriceInput(String(finalOrEstTotal));
                                      setAdjustedReasonInput(stay.adminPricingAdjustmentReason || '');
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3 text-[#2D3E5E]" />
                                  <span>{isAdjustingThisPrice ? 'Fechar Ajuste' : 'Ajustar Valor'}</span>
                                </button>
                              </div>

                              {/* Inline Adjustment Editor & Cycles Breakdown */}
                              {isAdjustingThisPrice && (
                                <div className="p-3 bg-[#FAF8F9] rounded-xl border border-[#dec2cb] space-y-2.5 text-xs animate-in fade-in">
                                  {stayPricing && (
                                    <div className="space-y-1">
                                      <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                                        Detalhamento dos Ciclos de 24h:
                                      </span>
                                      {stayPricing.cyclesBreakdown.map((cycle, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-white border border-[#dec2cb]/40 text-[11px]"
                                        >
                                          <div className="flex items-center gap-1.5 truncate pr-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#92a8d1] shrink-0" />
                                            <span className="text-[#1E293B] truncate">{cycle.description}</span>
                                          </div>
                                          <span className="font-bold text-[#1E293B] shrink-0 font-mono">
                                            {cycle.rate === 0 ? 'Cortesia' : formatBRL(cycle.rate)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] font-bold text-[#1E293B] mb-0.5">
                                        Valor Final em R$
                                      </label>
                                      <input
                                        type="text"
                                        value={adjustedPriceInput}
                                        onChange={(e) => setAdjustedPriceInput(e.target.value)}
                                        placeholder="Ex: 120.00"
                                        className="w-full min-h-[38px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-lg px-3 py-1.5 text-xs font-mono text-[#1E293B]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-[#1E293B] mb-0.5">
                                        Motivo do Ajuste (Opcional)
                                      </label>
                                      <input
                                        type="text"
                                        value={adjustedReasonInput}
                                        onChange={(e) => setAdjustedReasonInput(e.target.value)}
                                        placeholder="Ex: Desconto fidelidade, cortesia saída"
                                        className="w-full min-h-[38px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] rounded-lg px-3 py-1.5 text-xs text-[#1E293B]"
                                      />
                                    </div>
                                  </div>

                                  {/* Quick Presets */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] text-[#64748B] font-bold">Atalhos:</span>
                                    {stayPricing && (
                                      <button
                                        type="button"
                                        onClick={() => setAdjustedPriceInput(String(stayPricing.estimatedTotal))}
                                        className="px-2 py-0.5 rounded bg-white border border-[#dec2cb] hover:bg-[#FAF8F9] text-[10px] font-semibold text-[#1E293B]"
                                      >
                                        Tabela ({formatBRL(stayPricing.estimatedTotal)})
                                      </button>
                                    )}
                                    {stayPricing && stayPricing.extraHours > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const baseCyclesTotal = stayPricing.cyclesBreakdown
                                            .filter((c) => c.type === 'full_cycle' || c.type === 'same_day_minimum')
                                            .reduce((acc, c) => acc + c.rate, 0);
                                          setAdjustedPriceInput(String(baseCyclesTotal));
                                          setAdjustedReasonInput('Cortesia horas extras na saída');
                                        }}
                                        className="px-2 py-0.5 rounded bg-white border border-[#dec2cb] hover:bg-[#FAF8F9] text-[10px] font-semibold text-[#1E293B]"
                                      >
                                        Cortesia Horas Extras
                                      </button>
                                    )}
                                    {stayPricing && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const disc = Math.round(stayPricing.estimatedTotal * 0.9 * 100) / 100;
                                          setAdjustedPriceInput(String(disc));
                                          setAdjustedReasonInput('Desconto 10%');
                                        }}
                                        className="px-2 py-0.5 rounded bg-white border border-[#dec2cb] hover:bg-[#FAF8F9] text-[10px] font-semibold text-[#1E293B]"
                                      >
                                        -10% Desconto
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex justify-end gap-2 pt-1 border-t border-[#dec2cb]/40">
                                    <button
                                      type="button"
                                      onClick={() => setEditingPriceStayId(null)}
                                      className="px-3 py-1.5 rounded-lg border border-[#c5b9cd] bg-white text-[#1E293B] text-xs font-bold"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingPriceStayId === stay.id}
                                      onClick={() => handleSavePriceAdjustment(stay.id)}
                                      className="px-3.5 py-1.5 rounded-lg bg-[#2D3E5E] hover:bg-[#1E293B] text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                                    >
                                      {savingPriceStayId === stay.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 text-[#92a8d1]" />
                                      )}
                                      <span>Salvar Valor da Estadia</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Anotações desta Hospedagem (Stay.adminStayNotes) - Unlocked for Approved Stays */}
                        {(isActive || isCompleted) && (
                          <div className="mt-2 pt-2.5 border-t border-[#dec2cb]/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-[#1E293B] flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-[#2D3E5E]" />
                                <span>Anotações desta Hospedagem (Admin)</span>
                              </label>
                              {savingStayNoteId === stay.id ? (
                                <span className="text-[10px] text-[#64748B] flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                                </span>
                              ) : null}
                            </div>
                            <textarea
                              rows={2}
                              value={editingStayNotes[stay.id] ?? (stay.adminStayNotes || '')}
                              onChange={(e) =>
                                setEditingStayNotes((prev) => ({
                                  ...prev,
                                  [stay.id]: e.target.value,
                                }))
                              }
                              placeholder="Como foi esta hospedagem? Alimentação, comportamento, passeios, medicação administrada..."
                              className="w-full min-h-[64px] text-xs p-2.5 rounded-xl border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] bg-white text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition leading-relaxed"
                            />
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={savingStayNoteId === stay.id}
                                onClick={() =>
                                  handleSaveStayAdminNotes(
                                    stay.id,
                                    editingStayNotes[stay.id] ?? (stay.adminStayNotes || '')
                                  )
                                }
                                className="min-h-[36px] px-3.5 rounded-xl bg-white hover:bg-[#FAF8F9] border border-[#c5b9cd] text-[#1E293B] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Save className="w-3.5 h-3.5 text-[#2D3E5E]" />
                                <span>Salvar Anotação da Estadia</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-[#dec2cb]/60 w-full max-w-md rounded-3xl p-6 shadow-2xl text-[#1E293B] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#f7cac9] text-[#7F1D1D] flex items-center justify-center shrink-0 border border-[#dec2cb]">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-[#1E293B]">
                  Excluir definitivamente "{pet.nameAndBreed}"?
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Esta ação é <strong>permanente e irreversível</strong>. Todos os dados cadastrais, foto, estadias e observações confidenciais do admin serão removidos do Firestore.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[#c5b9cd] bg-white hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeletePet}
                className="min-h-[44px] px-5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-red-500/20"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excluindo do Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Excluir Ficha</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PetDetailModal;
