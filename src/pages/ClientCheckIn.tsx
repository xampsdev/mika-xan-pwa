/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  deepCleanUndefined,
} from '@/lib/firebase';
import {
  Search,
  User,
  Phone,
  Camera,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ArrowRight,
  ArrowLeft,
  Dog,
  Utensils,
  Loader2,
  RotateCcw,
  Calculator,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { formatBrazilianPhone, isValidBrazilianPhone } from '@/utils/phone';
import { compressImageToDataUrl } from '@/utils/imageCompression';
import { sendNtfyAlert } from '@/lib/ntfy';
import { calculateStayPricing, formatBRL } from '@/lib/pricingCalculator';
import type { Tutor, Pet, Stay, StayStatus } from '@/types/schema';

type FlowStage = 'phone_lookup' | 'returning_client' | 'intake_form' | 'success_confirmation';
type FormSubStep = 'tutor_vet' | 'pet_health' | 'behavior_routine' | 'photo_stay';

interface FormDataState {
  // Tutor (Fields 1-3)
  fullName: string;
  phoneDDD: string;
  vetNameAndPhone: string;
  // Pet (Fields 4-22)
  nameAndBreed: string;
  ageAndWeight: string;
  isNeutered: boolean;
  behaviorPeopleAndAnimals: string;
  allergiesAndProtocol: string;
  continuousTreatmentDetails: string;
  dietaryOrPhysicalRestrictions: string;
  pastSevereIllnessOrChronic: string;
  vaccinationUpToDate: boolean;
  calmWhenAlone: boolean;
  destroysOrIngestsObjects: boolean;
  foodAmountAndSchedule: string;
  treatsAndNaturalDiet: string;
  walkFrequencyAndDuration: string;
  sleepBedAndLocation: string;
  pottyTrained: boolean;
  bathProtocol: string;
  generalNotes: string;
  photoUrl: string;
  // Stay Check-in Details
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  specialStayNotes: string;
}

const INITIAL_FORM_STATE: FormDataState = {
  fullName: '',
  phoneDDD: '',
  vetNameAndPhone: '',
  nameAndBreed: '',
  ageAndWeight: '',
  isNeutered: true,
  behaviorPeopleAndAnimals: '',
  allergiesAndProtocol: '',
  continuousTreatmentDetails: '',
  dietaryOrPhysicalRestrictions: '',
  pastSevereIllnessOrChronic: '',
  vaccinationUpToDate: true,
  calmWhenAlone: true,
  destroysOrIngestsObjects: false,
  foodAmountAndSchedule: '',
  treatsAndNaturalDiet: '',
  walkFrequencyAndDuration: '',
  sleepBedAndLocation: '',
  pottyTrained: true,
  bathProtocol: '',
  generalNotes: '',
  photoUrl: '',
  checkInDate: '',
  checkInTime: '',
  checkOutDate: '',
  checkOutTime: '',
  specialStayNotes: '',
};

export const ClientCheckIn: React.FC = () => {
  // Flow State
  const [stage, setStage] = useState<FlowStage>('phone_lookup');
  const [subStep, setSubStep] = useState<FormSubStep>('tutor_vet');
  const [stepTransitionLock, setStepTransitionLock] = useState<boolean>(false);
  const [dateConfirmationChecked, setDateConfirmationChecked] = useState<boolean>(false);
  const [lookupPhone, setLookupPhone] = useState<string>('');
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Transition Lock Helper (prevents ghost taps on Android touchscreens)
  const changeSubStep = (next: FormSubStep) => {
    setStepTransitionLock(true);
    setSubStep(next);
    setTimeout(() => {
      setStepTransitionLock(false);
    }, 500);
  };

  // Loaded Entities
  const [existingTutor, setExistingTutor] = useState<Tutor | null>(null);
  const [existingPets, setExistingPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  // Form & Image State
  const [formData, setFormData] = useState<FormDataState>(INITIAL_FORM_STATE);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionSuccessData, setSubmissionSuccessData] = useState<{
    tutor: Tutor;
    pet: Pet;
    stay: Stay;
  } | null>(null);

  // Live 24-Hour Cycle + Half-Day Dynamic Pricing Quote
  const livePricingQuote = useMemo(() => {
    return calculateStayPricing(
      formData.checkInDate,
      formData.checkInTime,
      formData.checkOutDate,
      formData.checkOutTime
    );
  }, [formData.checkInDate, formData.checkInTime, formData.checkOutDate, formData.checkOutTime]);

  // 1. Phone Lookup Handler
  const handlePhoneLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLookupError(null);

    const formatted = formatBrazilianPhone(lookupPhone);

    if (!isValidBrazilianPhone(formatted)) {
      setLookupError('Por favor, informe um telefone válido com DDD (ex: (11) 98765-4321).');
      return;
    }

    setLookupLoading(true);

    try {
      const tutorsRef = collection(db, 'tutors');
      const q = query(tutorsRef, where('phoneDDD', '==', formatted));
      const tutorSnap = await getDocs(q);

      if (!tutorSnap.empty) {
        const tutorDoc = tutorSnap.docs[0];
        const tutorData = { id: tutorDoc.id, ...tutorDoc.data() } as Tutor;
        setExistingTutor(tutorData);

        const petsRef = collection(db, 'pets');
        const petsQ = query(petsRef, where('tutorId', '==', tutorDoc.id));
        const petsSnap = await getDocs(petsQ);

        const petsList: Pet[] = [];
        petsSnap.forEach((docSnap: any) => {
          petsList.push({ id: docSnap.id, ...docSnap.data() } as Pet);
        });

        setExistingPets(petsList);
        setStage('returning_client');
      } else {
        setExistingTutor(null);
        setExistingPets([]);
        setSelectedPetId(null);
        setFormData({
          ...INITIAL_FORM_STATE,
          phoneDDD: formatted,
        });
        setDateConfirmationChecked(false);
        setSubStep('tutor_vet');
        setStage('intake_form');
        setStepTransitionLock(true);
        setTimeout(() => setStepTransitionLock(false), 500);
      }
    } catch (err: unknown) {
      console.warn('Firestore query error (fallback to new intake):', err);
      setFormData({
        ...INITIAL_FORM_STATE,
        phoneDDD: formatted,
      });
      setDateConfirmationChecked(false);
      setSubStep('tutor_vet');
      setStage('intake_form');
      setStepTransitionLock(true);
      setTimeout(() => setStepTransitionLock(false), 500);
    } finally {
      setLookupLoading(false);
    }
  };

  // Returning Client: Select existing Pet
  const handleSelectExistingPet = (pet: Pet) => {
    if (!existingTutor) return;
    setSelectedPetId(pet.id);
    setFormData({
      fullName: existingTutor.fullName || '',
      phoneDDD: existingTutor.phoneDDD || '',
      vetNameAndPhone: existingTutor.vetNameAndPhone || '',
      nameAndBreed: pet.nameAndBreed || '',
      ageAndWeight: pet.ageAndWeight || '',
      isNeutered: pet.isNeutered ?? true,
      behaviorPeopleAndAnimals: pet.behaviorPeopleAndAnimals || '',
      allergiesAndProtocol: pet.allergiesAndProtocol || '',
      continuousTreatmentDetails: pet.continuousTreatmentDetails || '',
      dietaryOrPhysicalRestrictions: pet.dietaryOrPhysicalRestrictions || '',
      pastSevereIllnessOrChronic: pet.pastSevereIllnessOrChronic || '',
      vaccinationUpToDate: pet.vaccinationUpToDate ?? true,
      calmWhenAlone: pet.calmWhenAlone ?? true,
      destroysOrIngestsObjects: pet.destroysOrIngestsObjects ?? false,
      foodAmountAndSchedule: pet.foodAmountAndSchedule || '',
      treatsAndNaturalDiet: pet.treatsAndNaturalDiet || '',
      walkFrequencyAndDuration: pet.walkFrequencyAndDuration || '',
      sleepBedAndLocation: pet.sleepBedAndLocation || '',
      pottyTrained: pet.pottyTrained ?? true,
      bathProtocol: pet.bathProtocol || '',
      generalNotes: pet.generalNotes || '',
      photoUrl: pet.photoUrl || '',
      checkInDate: '',
      checkInTime: '',
      checkOutDate: '',
      checkOutTime: '',
      specialStayNotes: '',
    });
    setCompressedPreview(pet.photoUrl || null);
    setDateConfirmationChecked(false);
    setSubStep('tutor_vet');
    setStage('intake_form');
    setStepTransitionLock(true);
    setTimeout(() => setStepTransitionLock(false), 500);
  };

  // Returning Client: Register new Pet under existing Tutor
  const handleRegisterNewPetForTutor = () => {
    if (!existingTutor) return;
    setSelectedPetId(null);
    setFormData({
      ...INITIAL_FORM_STATE,
      fullName: existingTutor.fullName,
      phoneDDD: existingTutor.phoneDDD,
      vetNameAndPhone: existingTutor.vetNameAndPhone,
      checkInDate: '',
      checkInTime: '',
      checkOutDate: '',
      checkOutTime: '',
    });
    setCompressedPreview(null);
    setDateConfirmationChecked(false);
    setSubStep('pet_health');
    setStage('intake_form');
    setStepTransitionLock(true);
    setTimeout(() => setStepTransitionLock(false), 500);
  };

  // Image Selection & Client-Side Compression (DataURL for Firestore)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageToDataUrl(file, 600, 0.7);
      setSelectedImageFile(file);
      setCompressedPreview(dataUrl);
      setFormData((prev) => ({ ...prev, photoUrl: dataUrl }));
    } catch (err) {
      console.error('Compression failed:', err);
    }
  };

  // Form Field Updates
  const updateField = <K extends keyof FormDataState>(key: K, value: FormDataState[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Submission to Firestore
  const handleFinalSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (stepTransitionLock || submitting) return;

    if (!formData.checkInDate || !formData.checkInTime || !formData.checkOutDate || !formData.checkOutTime) {
      alert('Por favor informe as datas e horários completos de Check-in e Check-out.');
      return;
    }

    if (!dateConfirmationChecked) {
      alert('Por favor confirme as datas e horários de entrada e saída marcando a caixa de confirmação.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Resolve Tutor Doc
      let tutorId = existingTutor?.id;
      const tutorPayload = deepCleanUndefined({
        fullName: (formData.fullName || '').trim(),
        phoneDDD: formatBrazilianPhone(formData.phoneDDD || ''),
        vetNameAndPhone: (formData.vetNameAndPhone || '').trim(),
        updatedAt: serverTimestamp(),
      });

      if (tutorId) {
        await setDoc(doc(db, 'tutors', tutorId), deepCleanUndefined(tutorPayload), { merge: true });
      } else {
        const newTutorRef = await addDoc(collection(db, 'tutors'), deepCleanUndefined({
          ...tutorPayload,
          createdAt: serverTimestamp(),
        }));
        tutorId = newTutorRef.id;
      }

      // 2. Prepare compressed photo DataURL
      let uploadedPhotoUrl = formData.photoUrl;
      if (selectedImageFile && (!uploadedPhotoUrl || uploadedPhotoUrl.length < 50)) {
        try {
          uploadedPhotoUrl = await compressImageToDataUrl(selectedImageFile, 600, 0.7);
        } catch (imgErr) {
          console.warn('Image processing fallback:', imgErr);
        }
      }

      // 3. Resolve Pet Doc
      let petId = selectedPetId;
      const resolvedTutorId = tutorId || `tutor_${Date.now()}`;
      const petPayload = deepCleanUndefined({
        tutorId: resolvedTutorId,
        nameAndBreed: (formData.nameAndBreed || '').trim(),
        ageAndWeight: (formData.ageAndWeight || '').trim(),
        isNeutered: Boolean(formData.isNeutered),
        behaviorPeopleAndAnimals: (formData.behaviorPeopleAndAnimals || '').trim(),
        allergiesAndProtocol: (formData.allergiesAndProtocol || '').trim(),
        continuousTreatmentDetails: (formData.continuousTreatmentDetails || '').trim(),
        dietaryOrPhysicalRestrictions: (formData.dietaryOrPhysicalRestrictions || '').trim(),
        pastSevereIllnessOrChronic: (formData.pastSevereIllnessOrChronic || '').trim(),
        vaccinationUpToDate: Boolean(formData.vaccinationUpToDate),
        calmWhenAlone: Boolean(formData.calmWhenAlone),
        destroysOrIngestsObjects: Boolean(formData.destroysOrIngestsObjects),
        foodAmountAndSchedule: (formData.foodAmountAndSchedule || '').trim(),
        treatsAndNaturalDiet: (formData.treatsAndNaturalDiet || '').trim(),
        walkFrequencyAndDuration: (formData.walkFrequencyAndDuration || '').trim(),
        sleepBedAndLocation: (formData.sleepBedAndLocation || '').trim(),
        pottyTrained: Boolean(formData.pottyTrained),
        bathProtocol: (formData.bathProtocol || '').trim(),
        generalNotes: (formData.generalNotes || '').trim(),
        photoUrl: uploadedPhotoUrl || '',
        updatedAt: serverTimestamp(),
      });

      if (petId) {
        await setDoc(doc(db, 'pets', petId), deepCleanUndefined(petPayload), { merge: true });
      } else {
        const newPetRef = await addDoc(collection(db, 'pets'), deepCleanUndefined({
          ...petPayload,
          createdAt: serverTimestamp(),
        }));
        petId = newPetRef.id;
      }

      // 4. Create Stay Doc (combined date + time) with 24h Cycle Pricing
      const resolvedPetId = petId || `pet_${Date.now()}`;
      const safeCheckInDate = formData.checkInDate || '';
      const safeCheckInTime = formData.checkInTime || '08:00';
      const safeCheckOutDate = formData.checkOutDate || '';
      const safeCheckOutTime = formData.checkOutTime || '18:00';
      const checkInCombined = `${safeCheckInDate}T${safeCheckInTime}`;
      const checkOutCombined = `${safeCheckOutDate}T${safeCheckOutTime}`;

      const pricing = calculateStayPricing(
        safeCheckInDate,
        safeCheckInTime,
        safeCheckOutDate,
        safeCheckOutTime
      );

      const cleanedPricingBreakdown = pricing ? deepCleanUndefined(pricing) : null;

      const stayPayload: Omit<Stay, 'id'> = deepCleanUndefined({
        petId: resolvedPetId,
        tutorId: resolvedTutorId,
        checkInDate: checkInCombined,
        checkOutDate: checkOutCombined,
        status: 'pending' as StayStatus,
        specialStayNotes: (formData.specialStayNotes || '').trim(),
        estimatedTotal: pricing?.estimatedTotal ?? 0,
        finalTotal: pricing?.estimatedTotal ?? 0,
        totalHours: pricing?.totalHours ?? 0,
        ...(cleanedPricingBreakdown ? { pricingBreakdown: cleanedPricingBreakdown } : {}),
        createdAt: serverTimestamp(),
      });

      const stayRef = await addDoc(collection(db, 'stays'), deepCleanUndefined(stayPayload));

      setSubmissionSuccessData({
        tutor: { id: resolvedTutorId, ...tutorPayload, createdAt: new Date() },
        pet: { id: resolvedPetId, ...petPayload, tutorId: resolvedTutorId, createdAt: new Date() },
        stay: { id: stayRef.id, ...stayPayload, tutorId: resolvedTutorId, petId: resolvedPetId, createdAt: new Date() },
      });

      // CORS-safe 24/7 background push alert with estimated pricing
      const priceText = pricing ? ` • Total: ${formatBRL(pricing.estimatedTotal)}` : '';
      await sendNtfyAlert(
        'Novo Check-in Mika & Xan!',
        `Pet: ${formData.nameAndBreed.trim()} | Tutor: ${formData.fullName.trim()}${priceText}`
      );

      setStage('success_confirmation');
    } catch (err: unknown) {
      console.error('Submission error:', err);
      alert('Erro ao salvar os dados. Por favor verifique sua conexão ou tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto min-h-[100dvh] flex flex-col justify-between bg-[#FAF8F9] overflow-x-hidden px-4 py-4 sm:py-6">
      {/* ─────────────────────────────────────────────────────────────
          STAGE 1: Phone Lookup (Field 2)
      ───────────────────────────────────────────────────────────── */}
      {stage === 'phone_lookup' && (
        <div className="bg-white border border-[#dec2cb]/60 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5 my-auto">
          <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-[#92a8d1]" />
            <span>Check-in Rápido de Hospedagem</span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] tracking-tight">
              Informe seu WhatsApp ou Telefone
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
              Se você já tem cadastro na Mika &amp; Xan, buscamos o perfil do seu pet para você só revisar e confirmar a estadia!
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handlePhoneLookup(); }} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                Telefone com DDD (Campo 2)
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 98765-4321"
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(formatBrazilianPhone(e.target.value))}
                  className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl pl-10 pr-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition font-mono"
                  autoFocus
                />
              </div>
              {lookupError && (
                <p className="mt-2 text-xs text-[#7F1D1D] bg-[#f7cac9]/60 border border-[#dec2cb] p-2.5 rounded-xl flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{lookupError}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handlePhoneLookup()}
              disabled={lookupLoading || !lookupPhone}
              className="w-full min-h-[48px] px-5 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] disabled:opacity-50 text-[#1E293B] font-bold text-sm shadow-sm border border-[#7b93c2] flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {lookupLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#1E293B]" />
                  <span>Buscando cadastro...</span>
                </>
              ) : (
                <>
                  <span>Prosseguir para Check-in</span>
                  <ArrowRight className="w-4 h-4 text-[#1E293B]" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STAGE 2: Returning Client Flow (List Existing Pets)
      ───────────────────────────────────────────────────────────── */}
      {stage === 'returning_client' && existingTutor && (
        <div className="bg-white border border-[#dec2cb]/60 rounded-3xl p-5 sm:p-7 shadow-sm space-y-5 my-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#dec2cb]/60 pb-4 gap-2">
            <div>
              <span className="text-[10px] font-bold text-[#133E26] bg-[#d2e3d8] px-2 py-0.5 rounded border border-[#a3cbb1] uppercase">
                Cliente Cadastrado
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] mt-1">
                Olá, {existingTutor.fullName}!
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                WhatsApp: <strong className="text-[#1E293B] font-mono">{existingTutor.phoneDDD}</strong>
              </p>
            </div>

            <button
              onClick={() => {
                setStage('phone_lookup');
                setExistingTutor(null);
                setExistingPets([]);
              }}
              className="text-xs font-bold text-[#1E293B] underline underline-offset-2 hover:opacity-80 self-start sm:self-auto min-h-[36px] flex items-center"
            >
              Trocar Telefone
            </button>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#1E293B] mb-1">
              Selecione o pet para a nova hospedagem:
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Os 22 campos do perfil selecionado serão preenchidos automaticamente.
            </p>

            {existingPets.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-xs text-[#64748B] text-center">
                Nenhum pet encontrado para este tutor.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {existingPets.map((pet) => (
                  <div
                    key={pet.id}
                    className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 hover:border-[#92a8d1] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {pet.photoUrl ? (
                        <img
                          src={pet.photoUrl}
                          alt={pet.nameAndBreed}
                          className="w-14 h-14 rounded-2xl object-cover border border-[#dec2cb] shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-[#c5b9cd]/30 text-[#1E293B] border border-[#dec2cb] flex items-center justify-center shrink-0">
                          <Dog className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-[#1E293B]">{pet.nameAndBreed}</h4>
                        <p className="text-xs text-[#64748B]">{pet.ageAndWeight}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pet.isNeutered && (
                            <span className="text-[10px] bg-[#d2e3d8] text-[#133E26] px-1.5 py-0.5 rounded border border-[#a3cbb1] font-bold">
                              Castrado
                            </span>
                          )}
                          {pet.vaccinationUpToDate && (
                            <span className="text-[10px] bg-[#92a8d1]/30 text-[#1E293B] px-1.5 py-0.5 rounded border border-[#7b93c2]/40 font-bold">
                              Vacinas OK
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectExistingPet(pet)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] text-xs font-bold border border-[#7b93c2] flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                      <span>Check-in com este Pet</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#dec2cb]/60">
            <button
              onClick={handleRegisterNewPetForTutor}
              className="w-full min-h-[48px] py-3 rounded-xl border border-dashed border-[#92a8d1] bg-white hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4 text-[#2D3E5E]" />
              <span>Cadastrar Outro Pet para {existingTutor.fullName}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STAGE 3: Multi-Step Intake Form (22 Fields Normalized)
      ───────────────────────────────────────────────────────────── */}
      {stage === 'intake_form' && (
        <div className="bg-white border border-[#dec2cb]/60 rounded-3xl shadow-sm overflow-hidden pb-24 sm:pb-28">
          {/* Progress Header with Rose Quartz & Serenity theme */}
          <div className="border-b border-[#dec2cb]/60 p-4 sm:p-5 bg-gradient-to-r from-[#f7cac9]/30 via-[#c5b9cd]/30 to-[#92a8d1]/30">
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="font-bold text-[#1E293B]">
                {selectedPetId
                  ? 'Revisão & Check-in'
                  : existingTutor
                    ? 'Novo Pet para Tutor'
                    : 'Ficha Cadastral (22 Campos)'}
              </span>
              <span className="text-[#64748B] font-bold text-[11px]">
                {subStep === 'tutor_vet' && '1/4: Tutor & Vet'}
                {subStep === 'pet_health' && '2/4: Pet & Saúde'}
                {subStep === 'behavior_routine' && '3/4: Rotina & Manejo'}
                {subStep === 'photo_stay' && '4/4: Foto & Hospedagem'}
              </span>
            </div>

            {/* Stepper Dots */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('tutor_vet')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'tutor_vet' ? 'bg-[#92a8d1] shadow-xs' : 'bg-[#dec2cb]/70'
                }`}
                title="Tutor & Veterinário"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('pet_health')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'pet_health' ? 'bg-[#92a8d1] shadow-xs' : 'bg-[#dec2cb]/70'
                }`}
                title="Pet & Saúde"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('behavior_routine')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'behavior_routine' ? 'bg-[#92a8d1] shadow-xs' : 'bg-[#dec2cb]/70'
                }`}
                title="Comportamento & Rotina"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('photo_stay')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'photo_stay' ? 'bg-[#92a8d1] shadow-xs' : 'bg-[#dec2cb]/70'
                }`}
                title="Foto & Hospedagem"
              />
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="p-4 sm:p-6 space-y-5">
            {/* ─────────────────────────────────────────────────────────
                SUBSTEP A: Tutor & Vet Info (Fields 1-3)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'tutor_vet' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                  <User className="w-4 h-4 text-[#2D3E5E]" />
                  <span>Etapa A: Informações do Tutor &amp; Emergência</span>
                </div>

                {/* Field 1 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    1. Nome Completo do Tutor *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Maria Clara dos Santos"
                    value={formData.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 2 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    2. Telefone / WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    placeholder="(11) 98765-4321"
                    value={formData.phoneDDD}
                    onChange={(e) => updateField('phoneDDD', formatBrazilianPhone(e.target.value))}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition font-mono"
                  />
                </div>

                {/* Field 3 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    3. Veterinário Responsável ou Clínica de Emergência
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Dr. Roberto / Clínica VetCare (11) 99999-0000"
                    value={formData.vetNameAndPhone}
                    onChange={(e) => updateField('vetNameAndPhone', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                  <span className="text-[11px] text-[#64748B] mt-1 block">
                    Contato do médico veterinário para urgências durante o período de estadia.
                  </span>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP B: Pet Profile & Health (Fields 4-12)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'pet_health' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                  <Dog className="w-4 h-4 text-[#2D3E5E]" />
                  <span>Etapa B: Identificação e Saúde do Pet</span>
                </div>

                {/* Field 4 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    4. Nome do Pet e Raça *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Thor - Golden Retriever"
                    value={formData.nameAndBreed}
                    onChange={(e) => updateField('nameAndBreed', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 5 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    5. Idade e Peso Aproximado *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 3 anos e meio - 28 kg"
                    value={formData.ageAndWeight}
                    onChange={(e) => updateField('ageAndWeight', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 6 & 12 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="block text-xs font-bold text-[#1E293B] mb-2">
                      6. O pet é castrado(a)?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('isNeutered', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.isNeutered
                            ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Sim (Castrado)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('isNeutered', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.isNeutered
                            ? 'bg-[#c5b9cd] text-[#1E293B] border-[#b09ebc]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Não castrado
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="block text-xs font-bold text-[#1E293B] mb-2">
                      12. Vacinas (V8/V10, Raiva, Gripe) em dia?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('vaccinationUpToDate', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.vaccinationUpToDate
                            ? 'bg-[#d2e3d8] text-[#133E26] border-[#a3cbb1]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Em dia
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('vaccinationUpToDate', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.vaccinationUpToDate
                            ? 'bg-[#f7cac9] text-[#7F1D1D] border-[#dec2cb]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Pendente
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 8 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    8. Possui alergias conhecidas e qual o protocolo?
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Alergia a frango e picada de pulga; tomar medicação se coceira"
                    value={formData.allergiesAndProtocol}
                    onChange={(e) => updateField('allergiesAndProtocol', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 9 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    9. Faz uso de medicação contínua? (Nome, dosagem e horários)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Omeprazol 10mg às 07h em jejum; Condroplex às 19h com a refeição"
                    value={formData.continuousTreatmentDetails}
                    onChange={(e) => updateField('continuousTreatmentDetails', e.target.value)}
                    className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 10 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    10. Restrições físicas ou de exercícios
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Displasia coxofemoral leve, evitar pisos lisos e escadas longas"
                    value={formData.dietaryOrPhysicalRestrictions}
                    onChange={(e) => updateField('dietaryOrPhysicalRestrictions', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 11 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    11. Histórico de cirurgias ou doenças graves pregressas
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Castração em 2023, sem outras intervenções"
                    value={formData.pastSevereIllnessOrChronic}
                    onChange={(e) => updateField('pastSevereIllnessOrChronic', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP C: Behavior & Routine/Feeding (Fields 7, 13-21)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'behavior_routine' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                  <Utensils className="w-4 h-4 text-[#2D3E5E]" />
                  <span>Etapa C: Comportamento, Rotina e Alimentação</span>
                </div>

                {/* Field 7 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    7. Comportamento com pessoas e outros animais
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Muito dócil com pessoas. Com outros cães machos é mais reservado."
                    value={formData.behaviorPeopleAndAnimals}
                    onChange={(e) => updateField('behaviorPeopleAndAnimals', e.target.value)}
                    className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 13 & 14 Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="block text-xs font-bold text-[#1E293B] mb-2">
                      13. Fica calmo quando fica sozinho?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('calmWhenAlone', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.calmWhenAlone
                            ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Sim, tranquilo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('calmWhenAlone', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.calmWhenAlone
                            ? 'bg-[#c5b9cd] text-[#1E293B] border-[#b09ebc]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Fica ansioso
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="block text-xs font-bold text-[#1E293B] mb-2">
                      14. Destrói ou engole objetos não alimentares?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('destroysOrIngestsObjects', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.destroysOrIngestsObjects
                            ? 'bg-[#f7cac9] text-[#7F1D1D] border-[#dec2cb]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Sim (Risco)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('destroysOrIngestsObjects', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.destroysOrIngestsObjects
                            ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Não rói
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 15 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    15. Ração: Quantidade diária e horários das refeições *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 250g de Premier às 08h e 250g às 18h"
                    value={formData.foodAmountAndSchedule}
                    onChange={(e) => updateField('foodAmountAndSchedule', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 16 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    16. Petiscos, frutas e alimentação natural permitidos
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pode maçã sem semente, cenoura e biscoito de carne"
                    value={formData.treatsAndNaturalDiet}
                    onChange={(e) => updateField('treatsAndNaturalDiet', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 17 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    17. Frequência e duração habitual dos passeios
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2 vezes ao dia (30 minutos pela manhã e à noite)"
                    value={formData.walkFrequencyAndDuration}
                    onChange={(e) => updateField('walkFrequencyAndDuration', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 18 & 19 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                      18. Onde e como dorme habitualmente?
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Na caminha no quarto, com ar condicionado ligado"
                      value={formData.sleepBedAndLocation}
                      onChange={(e) => updateField('sleepBedAndLocation', e.target.value)}
                      className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                    <span className="block text-xs font-bold text-[#1E293B] mb-2">
                      19. Faz necessidades no local correto?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('pottyTrained', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.pottyTrained
                            ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Sim (Tapete/Rua)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('pottyTrained', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.pottyTrained
                            ? 'bg-[#c5b9cd] text-[#1E293B] border-[#b09ebc]'
                            : 'bg-white text-[#64748B] border-[#c5b9cd]'
                        }`}
                      >
                        Às vezes erra
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 20 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    20. Protocolo de banho e higiene
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Banho quinzenal com xampu neutro hipoalergênico"
                    value={formData.bathProtocol}
                    onChange={(e) => updateField('bathProtocol', e.target.value)}
                    className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>

                {/* Field 21 */}
                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    21. Observações gerais, medos e manias
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Morre de medo de fogos e trovões; adora carinho na barriga antes de dormir."
                    value={formData.generalNotes}
                    onChange={(e) => updateField('generalNotes', e.target.value)}
                    className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP D: Photo & Stay Details (Field 22 + Stay)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'photo_stay' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                  <Camera className="w-4 h-4 text-[#2D3E5E]" />
                  <span>Etapa D: Foto do Pet e Datas da Hospedagem</span>
                </div>

                {/* Field 22: Photo Upload with Compression */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60">
                  <span className="block text-xs font-bold text-[#1E293B] mb-1">
                    22. Foto do Pet (Opcional)
                  </span>
                  <p className="text-xs text-[#64748B] mb-3">
                    A imagem é otimizada automaticamente no seu aparelho para identificação visual rápida no painel.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {compressedPreview ? (
                      <img
                        src={compressedPreview}
                        alt="Preview"
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-[#92a8d1] shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-[#dec2cb] flex flex-col items-center justify-center text-[#64748B] shrink-0">
                        <Camera className="w-6 h-6 mb-1 text-[#2D3E5E]" />
                        <span className="text-[10px]">Sem foto</span>
                      </div>
                    )}

                    <div className="flex-1 w-full">
                      <label className="min-h-[48px] w-full px-4 rounded-xl bg-white border border-[#dec2cb] hover:border-[#92a8d1] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition">
                        <Camera className="w-4 h-4 text-[#2D3E5E]" />
                        <span>{compressedPreview ? 'Trocar Foto' : 'Tirar Foto ou Escolher da Galeria'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Stay Check-in Details */}
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                        Data de Check-in *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkInDate}
                        onChange={(e) => updateField('checkInDate', e.target.value)}
                        className="w-full min-h-[52px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] font-mono focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                        Horário de Check-in *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.checkInTime}
                        onChange={(e) => updateField('checkInTime', e.target.value)}
                        className="w-full min-h-[52px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] font-mono focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                        Data de Check-out Previsto *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkOutDate}
                        onChange={(e) => updateField('checkOutDate', e.target.value)}
                        className="w-full min-h-[52px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] font-mono focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                        Horário de Check-out Previsto *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.checkOutTime}
                        onChange={(e) => updateField('checkOutTime', e.target.value)}
                        className="w-full min-h-[52px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] font-mono focus:outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Live 24h Cycle Pricing Quote Card */}
                  <div className="rounded-2xl border border-[#dec2cb] bg-white overflow-hidden shadow-xs transition">
                    <div className="bg-gradient-to-r from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                        <Calculator className="w-4 h-4 text-[#2D3E5E]" />
                        <span>Resumo do Valor da Hospedagem</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#1E293B] bg-white/70 px-2 py-0.5 rounded-full border border-white/80">
                        Ciclos de 24h
                      </span>
                    </div>

                    <div className="p-3.5 space-y-3">
                      {livePricingQuote ? (
                        <>
                          <div className="flex items-center justify-between bg-[#FAF8F9] p-2.5 rounded-xl border border-[#dec2cb]/60">
                            <div>
                              <span className="text-[10px] font-bold text-[#64748B] uppercase block">
                                Duração Calculada
                              </span>
                              <span className="text-xs font-bold text-[#1E293B]">
                                {livePricingQuote.totalHours}h ({livePricingQuote.summaryText})
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-[#2D3E5E] bg-[#c5b9cd]/30 px-2.5 py-1 rounded-lg border border-[#dec2cb]">
                              {livePricingQuote.fullCycles} {livePricingQuote.fullCycles === 1 ? 'diária' : 'diárias'}
                              {livePricingQuote.hasHalfDay ? ' + meia' : ''}
                            </span>
                          </div>

                          {/* Step-by-step breakdown list */}
                          <div className="space-y-1.5 text-xs">
                            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                              Detalhamento dos Ciclos:
                            </span>
                            {livePricingQuote.cyclesBreakdown.map((cycle, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[#FAF8F9] border border-[#dec2cb]/40 text-xs"
                              >
                                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#92a8d1] shrink-0" />
                                  <span className="text-[#1E293B] font-medium truncate">
                                    {cycle.description}
                                  </span>
                                </div>
                                <span className="font-bold text-[#1E293B] shrink-0 font-mono">
                                  {cycle.rate === 0 ? 'Cortesia' : formatBRL(cycle.rate)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Total Value */}
                          <div className="pt-2 border-t border-[#dec2cb]/60 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-[#64748B] block">
                                Valor Total Estimado
                              </span>
                              <span className="text-[10px] text-[#64748B]">
                                Seg-Qui: R$ 79 • Sex-Dom/Feriado: R$ 89
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-black text-[#1E293B] text-right block">
                                {formatBRL(livePricingQuote.estimatedTotal)}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="py-2 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-1">
                          <Receipt className="w-5 h-5 text-[#92a8d1]" />
                          <p className="font-medium text-[#1E293B]">
                            Preencha as datas e horários acima para calcular o valor
                          </p>
                          <p className="text-[11px] text-[#64748B]">
                            Cálculo dinâmico baseado em ciclos de 24h e meia diária para até 6h extras.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Explicit Confirmation Checkbox */}
                  <div className="pt-2">
                    <label className="flex items-start gap-3 p-3.5 bg-[#FAF8F9] border border-[#c5b9cd] rounded-xl cursor-pointer hover:border-[#92a8d1] transition">
                      <input
                        type="checkbox"
                        checked={dateConfirmationChecked}
                        onChange={(e) => setDateConfirmationChecked(e.target.checked)}
                        className="w-5 h-5 mt-0.5 rounded border-[#c5b9cd] text-[#92a8d1] focus:ring-[#92a8d1] shrink-0"
                      />
                      <span className="text-xs font-bold text-[#1E293B] leading-relaxed">
                        Confirmo as datas e horários de entrada e saída acima *
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                    Observações Específicas Desta Estadia &amp; Pertences Trazidos
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Trouxe ração em pote vedado, caminha azul, mordedor de borracha e coleira extra."
                    value={formData.specialStayNotes}
                    onChange={(e) => updateField('specialStayNotes', e.target.value)}
                    className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                STICKY BOTTOM ACTION BAR (Thumb-Friendly Ergonomics)
            ───────────────────────────────────────────────────────── */}
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-[#dec2cb]/60 p-3 sm:p-4 z-30 shadow-lg">
              <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
                {subStep === 'tutor_vet' ? (
                  <button
                    type="button"
                    disabled={stepTransitionLock}
                    onClick={() => {
                      if (existingTutor) {
                        setStage('returning_client');
                      } else {
                        setStage('phone_lookup');
                      }
                    }}
                    className="min-h-[48px] px-4 rounded-xl border border-[#c5b9cd] bg-white text-[#1E293B] hover:bg-[#FAF8F9] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Início</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={stepTransitionLock}
                    onClick={() => {
                      if (subStep === 'pet_health') changeSubStep('tutor_vet');
                      if (subStep === 'behavior_routine') changeSubStep('pet_health');
                      if (subStep === 'photo_stay') changeSubStep('behavior_routine');
                    }}
                    className="min-h-[48px] px-4 rounded-xl border border-[#c5b9cd] bg-white text-[#1E293B] hover:bg-[#FAF8F9] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-[#2D3E5E]" />
                    <span>Voltar</span>
                  </button>
                )}

                {subStep !== 'photo_stay' ? (
                  <button
                    type="button"
                    disabled={stepTransitionLock}
                    onClick={() => {
                      if (subStep === 'tutor_vet') {
                        if (!formData.fullName.trim() || !formData.phoneDDD.trim()) {
                          alert('Por favor preencha o Nome e o WhatsApp do tutor.');
                          return;
                        }
                        changeSubStep('pet_health');
                      } else if (subStep === 'pet_health') {
                        if (!formData.nameAndBreed.trim() || !formData.ageAndWeight.trim()) {
                          alert('Por favor preencha o Nome/Raça e a Idade/Peso do pet.');
                          return;
                        }
                        changeSubStep('behavior_routine');
                      } else if (subStep === 'behavior_routine') {
                        if (!formData.foodAmountAndSchedule.trim()) {
                          alert('Por favor informe a quantidade e horários da ração.');
                          return;
                        }
                        changeSubStep('photo_stay');
                      }
                    }}
                    className="min-h-[48px] px-6 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] active:scale-[0.99] disabled:opacity-50 text-[#1E293B] text-xs font-bold flex items-center gap-2 shadow-sm border border-[#7b93c2] transition cursor-pointer"
                  >
                    <span>Próximo Passo</span>
                    <ArrowRight className="w-4 h-4 text-[#1E293B]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleFinalSubmit()}
                    disabled={
                      submitting ||
                      stepTransitionLock ||
                      !formData.checkInDate ||
                      !formData.checkInTime ||
                      !formData.checkOutDate ||
                      !formData.checkOutTime ||
                      !dateConfirmationChecked
                    }
                    className="min-h-[48px] px-6 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Confirmando Check-in...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#92a8d1]" />
                        <span>Finalizar Check-in</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STAGE 4: Success & Check-in Voucher
      ───────────────────────────────────────────────────────────── */}
      {stage === 'success_confirmation' && submissionSuccessData && (
        <div className="bg-white border border-[#dec2cb]/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5 text-center my-auto">
          <div className="w-16 h-16 rounded-full bg-[#d2e3d8] border border-[#a3cbb1] text-[#133E26] mx-auto flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[10px] font-bold tracking-widest text-[#133E26] bg-[#d2e3d8] px-2.5 py-1 rounded-full uppercase border border-[#a3cbb1]">
              Check-in Confirmado
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] mt-2">Ficha Salva no Sistema!</h2>
            <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto mt-1 leading-relaxed">
              Os dados de <strong>{submissionSuccessData.pet.nameAndBreed}</strong> foram salvos e a equipe Mika &amp; Xan já tem acesso à ficha completa.
            </p>
          </div>

          {/* Voucher Summary Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-left space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-[#dec2cb]/60 pb-2">
              <span className="text-[#64748B]">Pet:</span>
              <span className="font-bold text-[#1E293B]">
                {submissionSuccessData.pet.nameAndBreed}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#dec2cb]/60 pb-2">
              <span className="text-[#64748B]">Tutor Responsável:</span>
              <span className="font-semibold text-[#1E293B]">
                {submissionSuccessData.tutor.fullName}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#dec2cb]/60 pb-2">
              <span className="text-[#64748B]">Check-in:</span>
              <span className="font-bold text-[#1E293B]">
                {new Date(submissionSuccessData.stay.checkInDate).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#dec2cb]/60 pb-2">
              <span className="text-[#64748B]">Check-out Previsto:</span>
              <span className="font-medium text-[#1E293B]">
                {new Date(submissionSuccessData.stay.checkOutDate).toLocaleString('pt-BR')}
              </span>
            </div>
            {submissionSuccessData.stay.estimatedTotal !== undefined && (
              <div className="flex justify-between border-b border-[#dec2cb]/60 pb-2 bg-[#92a8d1]/10 px-2 py-1.5 rounded-lg">
                <span className="text-[#1E293B] font-semibold">Valor Estimado ({submissionSuccessData.stay.totalHours}h):</span>
                <span className="font-black text-[#1E293B]">
                  {formatBRL(submissionSuccessData.stay.estimatedTotal)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-[#64748B]">Status Operacional:</span>
              <span className="px-2 py-0.5 rounded bg-[#c5b9cd]/40 text-[#1E293B] border border-[#dec2cb] uppercase text-[10px] font-bold">
                Pendente Confirmação
              </span>
            </div>
          </div>

          {/* Return / Register Another Pet Action */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                setStage('phone_lookup');
                setFormData(INITIAL_FORM_STATE);
                setLookupPhone('');
                setSelectedPetId(null);
                setSubmissionSuccessData(null);
                setDateConfirmationChecked(false);
                setStepTransitionLock(false);
              }}
              className="w-full sm:w-auto min-w-[260px] min-h-[48px] px-6 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#92a8d1]" />
              <span>Cadastrar Outro Pet / Início</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientCheckIn;
