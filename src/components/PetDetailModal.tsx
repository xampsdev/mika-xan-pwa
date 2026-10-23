/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
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
} from 'lucide-react';
import { compressImageToDataUrl } from '@/utils/imageCompression';
import type { Pet, Tutor, Stay, StayStatus } from '@/types/schema';

interface PetDetailModalProps {
  pet: Pet | null;
  tutor: Tutor | null;
  isOpen: boolean;
  onClose: () => void;
  onPetUpdated?: (updatedPet: Pet) => void;
}

export const PetDetailModal: React.FC<PetDetailModalProps> = ({
  pet,
  tutor,
  isOpen,
  onClose,
  onPetUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'stays'>('profile');
  const [stays, setStays] = useState<Stay[]>([]);
  const [loadingStays, setLoadingStays] = useState<boolean>(true);
  const [staysMetadataFromCache, setStaysMetadataFromCache] = useState<boolean>(false);

  // Photo Upload State
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string>('');

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
        snapshot.forEach((docSnap: any) => {
          staysList.push({ id: docSnap.id, ...docSnap.data() } as Stay);
        });

        staysList.sort(
          (a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
        );

        setStays(staysList);
        setLoadingStays(false);
      },
      (error: any) => {
        console.warn('Stays listener error (offline cache active):', error);
        setLoadingStays(false);
      }
    );

    return () => unsubscribe();
  }, [pet, isOpen]);

  if (!isOpen || !pet) return null;

  // Handle Photo Upload (Direct compressed DataURL to Firestore)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 600, 0.7);

      await updateDoc(doc(db, 'pets', pet.id), {
        photoUrl: dataUrl,
        updatedAt: serverTimestamp(),
      });

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

  // Update Stay Status
  const handleUpdateStayStatus = async (stayId: string, newStatus: StayStatus) => {
    try {
      const updates: Partial<Stay> = {
        status: newStatus,
      };
      if (newStatus === 'completed') {
        updates.actualCheckOutDate = new Date().toISOString();
      }
      await updateDoc(doc(db, 'stays', stayId), updates);
    } catch (err) {
      console.error('Error updating stay status:', err);
      alert('Erro ao atualizar status da estadia.');
    }
  };

  // Create New Stay Record
  const handleCreateNewStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pet) return;

    setSubmittingStay(true);
    try {
      const newStayData = {
        petId: pet.id,
        tutorId: pet.tutorId,
        checkInDate: newStayCheckIn,
        checkOutDate: newStayCheckOut,
        status: 'active' as StayStatus,
        specialStayNotes: newStayNotes.trim(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'stays'), newStayData);
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      {/* Mobile Bottom Sheet & Desktop Centered Modal */}
      <div className="fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl overflow-hidden bg-white border-t border-[#E7E2D8] shadow-2xl flex flex-col text-[#1C1917] sm:static sm:inset-auto sm:max-h-[88vh] sm:max-w-3xl sm:w-full sm:rounded-3xl sm:border sm:border-[#E7E2D8]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 border-b border-[#E7E2D8] p-4 sm:p-5 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt={pet.nameAndBreed}
                className="w-12 h-12 rounded-2xl object-cover border border-[#E7E2D8] shadow-sm shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB] flex items-center justify-center shrink-0">
                <Dog className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-[#1C1917] tracking-tight truncate">
                  {pet.nameAndBreed}
                </h2>
                {pet.isNeutered && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E8F0EA] text-[#245235] border border-[#C5DDCB]">
                    Castrado
                  </span>
                )}
                {pet.vaccinationUpToDate ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                    Vacinas OK
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                    Vacinas Pendentes
                  </span>
                )}
              </div>
              <p className="text-xs text-[#78716C] truncate mt-0.5">
                {pet.ageAndWeight} • Tutor: <strong className="text-[#1C1917]">{tutor?.fullName || 'Não localizado'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-[#FAF7F2] hover:bg-[#F0ECE4] text-[#78716C] hover:text-[#1C1917] transition shrink-0 ml-2"
            title="Fechar Ficha"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Large Touch-Friendly Navigation Tabs */}
        <div className="border-b border-[#E7E2D8] bg-[#FAF7F2] px-4 sm:px-6 flex gap-3 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('profile')}
            className={`min-h-[44px] py-2.5 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'border-[#D96B43] text-[#D96B43]'
                : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Dog className="w-4 h-4" />
            <span>Ficha Completa (22 Campos)</span>
          </button>
          <button
            onClick={() => setActiveTab('stays')}
            className={`min-h-[44px] py-2.5 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'stays'
                ? 'border-[#D96B43] text-[#D96B43]'
                : 'border-transparent text-[#78716C] hover:text-[#1C1917]'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Histórico de Estadias ({stays.length})</span>
            {staysMetadataFromCache && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">
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
                <div className="p-4 rounded-2xl bg-[#FEE2E2] border border-[#FECACA] space-y-2">
                  <div className="flex items-center gap-2 text-[#991B1B] font-bold text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Alertas Médicos &amp; Cuidados Críticos</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {pet.allergiesAndProtocol && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Alergias e Protocolo:</span>
                        <span className="text-[#1C1917]">{pet.allergiesAndProtocol}</span>
                      </div>
                    )}
                    {pet.continuousTreatmentDetails && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Medicação Contínua:</span>
                        <span className="text-[#1C1917]">{pet.continuousTreatmentDetails}</span>
                      </div>
                    )}
                    {pet.destroysOrIngestsObjects && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Risco de Ingestão:</span>
                        <span className="text-[#1C1917]">Destrói ou engole objetos não alimentares!</span>
                      </div>
                    )}
                    {pet.dietaryOrPhysicalRestrictions && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Restrição Alimentar/Física:</span>
                        <span className="text-[#1C1917]">{pet.dietaryOrPhysicalRestrictions}</span>
                      </div>
                    )}
                    {pet.pastSevereIllnessOrChronic && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Histórico de Doenças/Cirurgias:</span>
                        <span className="text-[#1C1917]">{pet.pastSevereIllnessOrChronic}</span>
                      </div>
                    )}
                    {!pet.vaccinationUpToDate && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-[#FECACA]">
                        <span className="font-bold text-[#991B1B] block">Atenção Vacinal:</span>
                        <span className="text-[#1C1917]">Carteira de vacinação desatualizada</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photo & Uploader Fallback */}
              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {currentPhotoUrl ? (
                    <img
                      src={currentPhotoUrl}
                      alt={pet.nameAndBreed}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-[#D96B43] shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-[#E7E2D8] flex flex-col items-center justify-center text-[#78716C] shrink-0">
                      <Camera className="w-5 h-5 mb-0.5 text-[#D96B43]" />
                      <span className="text-[10px]">Sem foto</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#1C1917] block truncate">
                      {currentPhotoUrl ? 'Foto Cadastrada (Campo 22)' : 'Sem Foto Cadastrada'}
                    </span>
                    <p className="text-[11px] text-[#78716C] mt-0.5">
                      Atualize ou tire uma foto com a câmera para reconhecimento rápido.
                    </p>
                  </div>
                </div>

                <label className="cursor-pointer min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold shadow-sm transition shrink-0">
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
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
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#D96B43] font-bold text-xs uppercase tracking-wider border-b border-[#E7E2D8] pb-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>Contatos e Veterinário (1 a 3)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      1. Nome do Tutor
                    </span>
                    <span className="text-sm font-bold text-[#1C1917]">
                      {tutor?.fullName || 'Não preenchido'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      2. Telefone / WhatsApp com DDD
                    </span>
                    {tutor?.phoneDDD ? (
                      <a
                        href={`https://wa.me/55${tutor.phoneDDD.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-[#D96B43] hover:underline flex items-center gap-1.5 font-bold"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{tutor.phoneDDD}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-[#78716C]">Não informado</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      3. Veterinário Responsável
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {tutor?.vetNameAndPhone || 'Não informado'}
                    </span>
                  </div>
                </div>

                {/* SECTION 2: Identification & Basic Info (Fields 4-6, 12) */}
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#D96B43] font-bold text-xs uppercase tracking-wider border-b border-[#E7E2D8] pb-1.5">
                    <Dog className="w-3.5 h-3.5" />
                    <span>Identificação e Porte (4 a 6, 12)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                        4. Nome &amp; Raça
                      </span>
                      <span className="text-sm font-bold text-[#1C1917]">{pet.nameAndBreed}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                        5. Idade &amp; Peso
                      </span>
                      <span className="text-xs text-[#1C1917]">{pet.ageAndWeight}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E7E2D8]">
                    <div>
                      <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                        6. Castrado
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          pet.isNeutered ? 'text-[#245235]' : 'text-[#78716C]'
                        }`}
                      >
                        {pet.isNeutered ? 'Sim (Castrado)' : 'Não castrado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                        12. Vacinas
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          pet.vaccinationUpToDate ? 'text-[#245235]' : 'text-[#991B1B]'
                        }`}
                      >
                        {pet.vaccinationUpToDate ? 'Em dia' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Routine & Feeding (Fields 15-18) */}
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#D96B43] font-bold text-xs uppercase tracking-wider border-b border-[#E7E2D8] pb-1.5">
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Alimentação e Passeios (15 a 18)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      15. Ração (Quantidade e Horários)
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.foodAmountAndSchedule || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      16. Petiscos e Alimentação Natural
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.treatsAndNaturalDiet || 'Sem restrições relatadas'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      17. Passeios Habitual
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.walkFrequencyAndDuration || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      18. Onde e Como Dorme
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.sleepBedAndLocation || 'Não informado'}
                    </span>
                  </div>
                </div>

                {/* SECTION 4: Behavior & Hygiene (Fields 7, 13, 14, 19-21) */}
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[#D96B43] font-bold text-xs uppercase tracking-wider border-b border-[#E7E2D8] pb-1.5">
                    <HeartPulse className="w-3.5 h-3.5" />
                    <span>Comportamento e Higiene (7, 13, 14, 19-21)</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      7. Comportamento com Pessoas/Animais
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.behaviorPeopleAndAnimals || 'Não informado'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-2 rounded-xl bg-white border border-[#E7E2D8]">
                      <span className="text-[9px] text-[#78716C] uppercase block">Sozinho</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.calmWhenAlone ? 'text-[#245235]' : 'text-[#92400E]'
                        }`}
                      >
                        {pet.calmWhenAlone ? 'Calmo' : 'Ansioso'}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white border border-[#E7E2D8]">
                      <span className="text-[9px] text-[#78716C] uppercase block">Risco</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.destroysOrIngestsObjects ? 'text-[#991B1B]' : 'text-[#245235]'
                        }`}
                      >
                        {pet.destroysOrIngestsObjects ? 'Destrói' : 'Não rói'}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white border border-[#E7E2D8]">
                      <span className="text-[9px] text-[#78716C] uppercase block">Higiene</span>
                      <span
                        className={`text-xs font-bold ${
                          pet.pottyTrained ? 'text-[#245235]' : 'text-[#78716C]'
                        }`}
                      >
                        {pet.pottyTrained ? 'Correto' : 'Erra'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      20. Banho e Higiene
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.bathProtocol || 'Não informado'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#78716C] uppercase font-semibold block">
                      21. Observações e Manias
                    </span>
                    <span className="text-xs text-[#1C1917]">
                      {pet.generalNotes || 'Sem observações adicionais'}
                    </span>
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
                  <h3 className="text-sm font-bold text-[#1C1917]">Histórico de Hospedagens</h3>
                  <p className="text-xs text-[#78716C]">
                    Estadias ativas, pendentes e concluídas de {pet.nameAndBreed}.
                  </p>
                </div>

                <button
                  onClick={() => setShowNewStayForm(!showNewStayForm)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold transition shadow-sm self-stretch sm:self-auto"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>{showNewStayForm ? 'Cancelar' : 'Nova Estadia'}</span>
                </button>
              </div>

              {/* New Stay Form */}
              {showNewStayForm && (
                <form
                  onSubmit={handleCreateNewStay}
                  className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F2] border border-[#D96B43]/50 shadow-sm space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center gap-1.5 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
                    <CalendarPlus className="w-4 h-4" />
                    <span>Lançar Nova Estadia</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1C1917] mb-1">
                        Data e Hora de Check-in *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={newStayCheckIn}
                        onChange={(e) => setNewStayCheckIn(e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#E7E2D8] focus:border-[#D96B43] rounded-xl px-3.5 py-2.5 text-base text-[#1C1917] font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1C1917] mb-1">
                        Data e Hora de Check-out Previsto *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={newStayCheckOut}
                        onChange={(e) => setNewStayCheckOut(e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#E7E2D8] focus:border-[#D96B43] rounded-xl px-3.5 py-2.5 text-base text-[#1C1917] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1C1917] mb-1">
                      Instruções Específicas / Pertences
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Ração para 3 dias, coleira extra, medicação às 19h"
                      value={newStayNotes}
                      onChange={(e) => setNewStayNotes(e.target.value)}
                      className="w-full min-h-[48px] bg-white border border-[#E7E2D8] focus:border-[#D96B43] rounded-xl px-3.5 py-2.5 text-base text-[#1C1917]"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewStayForm(false)}
                      className="min-h-[44px] px-4 rounded-xl border border-[#E7E2D8] text-[#78716C] text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submittingStay}
                      className="min-h-[44px] px-5 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      {submittingStay && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Salvar e Iniciar Estadia</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Stays List */}
              {loadingStays ? (
                <div className="p-6 text-center text-xs text-[#78716C] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" />
                  <span>Carregando estadias...</span>
                </div>
              ) : stays.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] text-xs text-[#78716C]">
                  Nenhuma estadia registrada ainda para este pet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stays.map((stay) => {
                    const isActive = stay.status === 'active';
                    const isPending = stay.status === 'pending';
                    const isCompleted = stay.status === 'completed';

                    return (
                      <div
                        key={stay.id}
                        className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-[#E8F0EA] border-[#C5DDCB]'
                            : isPending
                              ? 'bg-[#FEF3C7] border-[#FDE68A]'
                              : 'bg-[#FAF7F2] border-[#E7E2D8]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isActive
                                  ? 'bg-[#245235] text-white'
                                  : isPending
                                    ? 'bg-[#92400E] text-white'
                                    : 'bg-stone-300 text-[#1C1917]'
                              }`}
                            >
                              {isActive ? 'Estadia Ativa' : isPending ? 'Check-in Pendente' : 'Concluída'}
                            </span>
                            <span className="text-[11px] text-[#78716C] font-mono">
                              ID: {stay.id.slice(0, 8)}
                            </span>
                          </div>

                          <div className="text-xs text-[#1C1917] font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>
                              Entrada: {new Date(stay.checkInDate).toLocaleString('pt-BR')}
                            </span>
                            <span>→</span>
                            <span>
                              Saída: {new Date(stay.checkOutDate).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          {stay.specialStayNotes && (
                            <p className="text-xs text-[#78716C] italic">
                              "{stay.specialStayNotes}"
                            </p>
                          )}
                        </div>

                        {/* Status Change Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isPending && (
                            <button
                              onClick={() => handleUpdateStayStatus(stay.id, 'active')}
                              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[#245235] hover:bg-[#1C412A] text-white text-xs font-bold transition shadow-sm"
                            >
                              Confirmar Entrada (Ativar)
                            </button>
                          )}

                          {isActive && (
                            <button
                              onClick={() => handleUpdateStayStatus(stay.id, 'completed')}
                              className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-white border border-[#E7E2D8] hover:bg-[#FAF7F2] text-[#1C1917] text-xs font-bold transition shadow-sm"
                            >
                              Finalizar Estadia (Check-out)
                            </button>
                          )}

                          {isCompleted && (
                            <span className="text-xs text-[#78716C] flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#245235]" />
                              Concluída
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PetDetailModal;
