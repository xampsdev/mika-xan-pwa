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
  ZoomIn,
  Check,
  Trash2,
  Users,
  Copy,
} from 'lucide-react';
import { formatBrazilianPhone, isValidBrazilianPhone } from '@/utils/phone';
import { compressImageToDataUrl } from '@/utils/imageCompression';
import { sendNtfyAlert } from '@/lib/ntfy';
import { calculateStayPricing, formatBRL } from '@/lib/pricingCalculator';
import { ImageLightboxModal } from '@/components/ImageLightboxModal';
import type { Tutor, Pet, Stay, StayStatus } from '@/types/schema';

interface PetFormEntry {
  localKey: string;
  existingPetId: string | null;
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
  vaccinationCardUrl?: string | null;
  selectedImageFile: File | null;
}

type FlowStage = 'phone_lookup' | 'returning_client' | 'intake_form' | 'success_confirmation';
type FormSubStep = 'tutor_vet' | 'pet_health' | 'behavior_routine' | 'photo_stay';

interface TutorStayFormState {
  // Tutor (Fields 1-3)
  fullName: string;
  phoneDDD: string;
  vetNameAndPhone: string;
  // Stay Check-in Details
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  specialStayNotes: string;
}

const INITIAL_TUTOR_STAY_STATE: TutorStayFormState = {
  fullName: '',
  phoneDDD: '',
  vetNameAndPhone: '',
  checkInDate: '',
  checkInTime: '',
  checkOutDate: '',
  checkOutTime: '',
  specialStayNotes: '',
};

const createEmptyPetEntry = (idx = 1): PetFormEntry => ({
  localKey: `pet_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
  existingPetId: null,
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
  vaccinationCardUrl: null,
  selectedImageFile: null,
});

const petRecordToEntry = (pet: Pet, idx = 0): PetFormEntry => ({
  localKey: `pet_${pet.id}_${Date.now()}_${idx}`,
  existingPetId: pet.id,
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
  vaccinationCardUrl: pet.vaccinationCardUrl ?? null,
  selectedImageFile: null,
});

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
  const [selectedExistingPetIds, setSelectedExistingPetIds] = useState<string[]>([]);

  // Tutor & Stay Form + Multi-Pet List (initialized with 1 pet)
  const [formData, setFormData] = useState<TutorStayFormState>(INITIAL_TUTOR_STAY_STATE);
  const [petsList, setPetsList] = useState<PetFormEntry[]>(() => [createEmptyPetEntry(1)]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionSuccessData, setSubmissionSuccessData] = useState<{
    tutor: Tutor;
    pet: Pet;
    pets: Pet[];
    stay: Stay;
  } | null>(null);

  // Lightbox Modal State
  const [lightboxData, setLightboxData] = useState<{
    isOpen: boolean;
    imageUrl: string | null;
    title: string;
    subtitle?: string;
  }>({
    isOpen: false,
    imageUrl: null,
    title: '',
  });

  const bookingDogCount = Math.max(1, petsList.length);

  // Live 24-Hour Cycle + Half-Day Dynamic Pricing Quote (multiplied by petsList.length)
  const livePricingQuote = useMemo(() => {
    return calculateStayPricing(
      formData.checkInDate,
      formData.checkInTime,
      formData.checkOutDate,
      formData.checkOutTime,
      bookingDogCount
    );
  }, [
    formData.checkInDate,
    formData.checkInTime,
    formData.checkOutDate,
    formData.checkOutTime,
    bookingDogCount,
  ]);

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

        const loadedPets: Pet[] = [];
        petsSnap.forEach((docSnap: any) => {
          loadedPets.push({ id: docSnap.id, ...docSnap.data() } as Pet);
        });

        setExistingPets(loadedPets);
        setSelectedExistingPetIds([]);
        setPetsList([createEmptyPetEntry(1)]);
        setStage('returning_client');
      } else {
        setExistingTutor(null);
        setExistingPets([]);
        setSelectedExistingPetIds([]);
        setPetsList([createEmptyPetEntry(1)]);
        setFormData({
          ...INITIAL_TUTOR_STAY_STATE,
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
      setSelectedExistingPetIds([]);
      setPetsList([createEmptyPetEntry(1)]);
      setFormData({
        ...INITIAL_TUTOR_STAY_STATE,
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

  // Toggle selection of an existing pet on Stage 2
  const toggleExistingPetSelection = (petId: string) => {
    setSelectedExistingPetIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  // Returning Client: Proceed with 1 or multiple selected existing pets
  const handleProceedWithSelectedPets = (petsOverride?: Pet[]) => {
    if (!existingTutor) return;
    const chosenPets =
      petsOverride || existingPets.filter((p) => selectedExistingPetIds.includes(p.id));
    if (chosenPets.length === 0) return;

    setPetsList(chosenPets.map((p, idx) => petRecordToEntry(p, idx)));
    setFormData({
      fullName: existingTutor.fullName || '',
      phoneDDD: existingTutor.phoneDDD || '',
      vetNameAndPhone: existingTutor.vetNameAndPhone || '',
      checkInDate: '',
      checkInTime: '',
      checkOutDate: '',
      checkOutTime: '',
      specialStayNotes: '',
    });
    setDateConfirmationChecked(false);
    setSubStep(chosenPets.length > 1 ? 'photo_stay' : 'tutor_vet');
    setStage('intake_form');
    setStepTransitionLock(true);
    setTimeout(() => setStepTransitionLock(false), 500);
  };

  // Returning Client: Quick single-pet selection
  const handleSelectExistingPet = (pet: Pet) => {
    setSelectedExistingPetIds([pet.id]);
    handleProceedWithSelectedPets([pet]);
  };

  // Returning Client: Register new Pet under existing Tutor
  const handleRegisterNewPetForTutor = () => {
    if (!existingTutor) return;
    setSelectedExistingPetIds([]);
    setPetsList([createEmptyPetEntry(1)]);
    setFormData({
      ...INITIAL_TUTOR_STAY_STATE,
      fullName: existingTutor.fullName,
      phoneDDD: existingTutor.phoneDDD,
      vetNameAndPhone: existingTutor.vetNameAndPhone,
    });
    setDateConfirmationChecked(false);
    setSubStep('pet_health');
    setStage('intake_form');
    setStepTransitionLock(true);
    setTimeout(() => setStepTransitionLock(false), 500);
  };

  // Multi-Pet Field Updates
  const updateField = <K extends keyof TutorStayFormState>(
    key: K,
    value: TutorStayFormState[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updatePetField = <K extends keyof PetFormEntry>(
    index: number,
    key: K,
    value: PetFormEntry[K]
  ) => {
    setPetsList((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item))
    );
  };

  // Step B: Append a new independent pet block
  const handleAddPetBlock = () => {
    if (stepTransitionLock) return;
    setPetsList((prev) => [...prev, createEmptyPetEntry(prev.length + 1)]);
  };

  // Step B / Step D: Remove additional pet block (index > 0)
  const handleRemovePetBlock = (index: number) => {
    if (stepTransitionLock || index <= 0 || petsList.length <= 1) return;
    setPetsList((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Step C helper: Copy behavioral/routine settings from Pet 1 to another pet
  const handleCopyRoutineFromFirstPet = (targetIndex: number) => {
    if (stepTransitionLock || targetIndex <= 0 || !petsList[0]) return;
    const first = petsList[0];
    setPetsList((prev) =>
      prev.map((item, idx) =>
        idx === targetIndex
          ? {
              ...item,
              behaviorPeopleAndAnimals: first.behaviorPeopleAndAnimals,
              calmWhenAlone: first.calmWhenAlone,
              destroysOrIngestsObjects: first.destroysOrIngestsObjects,
              foodAmountAndSchedule: first.foodAmountAndSchedule,
              treatsAndNaturalDiet: first.treatsAndNaturalDiet,
              walkFrequencyAndDuration: first.walkFrequencyAndDuration,
              sleepBedAndLocation: first.sleepBedAndLocation,
              pottyTrained: first.pottyTrained,
              bathProtocol: first.bathProtocol,
            }
          : item
      )
    );
  };

  // Step D helper: Include an unselected registered sibling for returning clients
  const handleIncludeExistingSibling = (pet: Pet) => {
    if (stepTransitionLock) return;
    if (petsList.some((p) => p.existingPetId === pet.id)) return;
    setPetsList((prev) => [...prev, petRecordToEntry(pet, prev.length)]);
  };

  // Per-Pet Image Selection & Client-Side Compression (DataURL for Firestore)
  const handlePetImageFileChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageToDataUrl(file, 600, 0.7);
      setPetsList((prev) =>
        prev.map((item, idx) =>
          idx === index ? { ...item, selectedImageFile: file, photoUrl: dataUrl } : item
        )
      );
    } catch (err) {
      console.error('Compression failed:', err);
    }
  };

  // Submission to Firestore
  const handleFinalSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (stepTransitionLock || submitting) return;

    if (
      !formData.checkInDate ||
      !formData.checkInTime ||
      !formData.checkOutDate ||
      !formData.checkOutTime
    ) {
      alert('Por favor informe as datas e horários completos de Check-in e Check-out.');
      return;
    }

    if (!dateConfirmationChecked) {
      alert(
        'Por favor confirme as datas e horários de entrada e saída marcando a caixa de confirmação.'
      );
      return;
    }

    const incompletePetIdx = petsList.findIndex(
      (p) => !p.nameAndBreed.trim() || !p.ageAndWeight.trim()
    );
    if (incompletePetIdx !== -1) {
      alert(
        `Por favor preencha o Nome/Raça e Idade/Peso do Pet ${incompletePetIdx + 1} antes de finalizar.`
      );
      changeSubStep('pet_health');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Resolve Tutor Doc (linked via phoneDDD)
      let tutorId = existingTutor?.id;
      const tutorPayload = deepCleanUndefined({
        fullName: (formData.fullName || '').trim(),
        phoneDDD: formatBrazilianPhone(formData.phoneDDD || ''),
        vetNameAndPhone: (formData.vetNameAndPhone || '').trim(),
        updatedAt: serverTimestamp(),
      });

      if (tutorId) {
        await setDoc(doc(db, 'tutors', tutorId), deepCleanUndefined(tutorPayload), {
          merge: true,
        });
      } else {
        const newTutorRef = await addDoc(
          collection(db, 'tutors'),
          deepCleanUndefined({
            ...tutorPayload,
            createdAt: serverTimestamp(),
          })
        );
        tutorId = newTutorRef.id;
      }

      // 2. Save/update every pet in petsList as an individual document in `pets`
      const resolvedTutorId = tutorId || `tutor_${Date.now()}`;
      const savedPets: Pet[] = [];

      for (const entry of petsList) {
        let uploadedPhotoUrl = entry.photoUrl;
        if (entry.selectedImageFile && (!uploadedPhotoUrl || uploadedPhotoUrl.length < 50)) {
          try {
            uploadedPhotoUrl = await compressImageToDataUrl(entry.selectedImageFile, 600, 0.7);
          } catch (imgErr) {
            console.warn('Image processing fallback:', imgErr);
          }
        }

        const petPayload = deepCleanUndefined({
          tutorId: resolvedTutorId,
          nameAndBreed: (entry.nameAndBreed || '').trim(),
          ageAndWeight: (entry.ageAndWeight || '').trim(),
          isNeutered: Boolean(entry.isNeutered),
          behaviorPeopleAndAnimals: (entry.behaviorPeopleAndAnimals || '').trim(),
          allergiesAndProtocol: (entry.allergiesAndProtocol || '').trim(),
          continuousTreatmentDetails: (entry.continuousTreatmentDetails || '').trim(),
          dietaryOrPhysicalRestrictions: (entry.dietaryOrPhysicalRestrictions || '').trim(),
          pastSevereIllnessOrChronic: (entry.pastSevereIllnessOrChronic || '').trim(),
          vaccinationUpToDate: Boolean(entry.vaccinationUpToDate),
          calmWhenAlone: Boolean(entry.calmWhenAlone),
          destroysOrIngestsObjects: Boolean(entry.destroysOrIngestsObjects),
          foodAmountAndSchedule: (entry.foodAmountAndSchedule || '').trim(),
          treatsAndNaturalDiet: (entry.treatsAndNaturalDiet || '').trim(),
          walkFrequencyAndDuration: (entry.walkFrequencyAndDuration || '').trim(),
          sleepBedAndLocation: (entry.sleepBedAndLocation || '').trim(),
          pottyTrained: Boolean(entry.pottyTrained),
          bathProtocol: (entry.bathProtocol || '').trim(),
          generalNotes: (entry.generalNotes || '').trim(),
          photoUrl: uploadedPhotoUrl || '',
          ...(entry.vaccinationCardUrl !== undefined
            ? { vaccinationCardUrl: entry.vaccinationCardUrl }
            : {}),
          updatedAt: serverTimestamp(),
        });

        let resolvedPetId = entry.existingPetId;
        if (resolvedPetId) {
          await setDoc(doc(db, 'pets', resolvedPetId), deepCleanUndefined(petPayload), {
            merge: true,
          });
        } else {
          const newPetRef = await addDoc(
            collection(db, 'pets'),
            deepCleanUndefined({
              ...petPayload,
              createdAt: serverTimestamp(),
            })
          );
          resolvedPetId = newPetRef.id;
        }

        savedPets.push({
          id: resolvedPetId || `pet_${Date.now()}_${savedPets.length}`,
          ...petPayload,
          tutorId: resolvedTutorId,
          createdAt: new Date(),
        } as Pet);
      }

      // 3. Create Stay Doc with dogCount, petIds, petNames & multiplied 24h Cycle Pricing
      const resolvedPetIds = savedPets.map((p) => p.id);
      const resolvedPetNames = savedPets.map((p) => p.nameAndBreed);
      const finalDogCount = resolvedPetIds.length;
      const primaryPetId = resolvedPetIds[0];

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
        safeCheckOutTime,
        finalDogCount
      );

      const cleanedPricingBreakdown = pricing ? deepCleanUndefined(pricing) : null;

      const stayPayload: Omit<Stay, 'id'> = deepCleanUndefined({
        petId: primaryPetId,
        petIds: resolvedPetIds,
        petNames: resolvedPetNames,
        dogCount: finalDogCount,
        tutorId: resolvedTutorId,
        checkInDate: checkInCombined,
        checkOutDate: checkOutCombined,
        status: 'pending' as StayStatus,
        specialStayNotes: (formData.specialStayNotes || '').trim(),
        estimatedTotal: pricing?.totalPrice ?? 0,
        finalTotal: pricing?.totalPrice ?? 0,
        totalHours: pricing?.totalHours ?? 0,
        ...(cleanedPricingBreakdown ? { pricingBreakdown: cleanedPricingBreakdown } : {}),
        createdAt: serverTimestamp(),
      });

      const stayRef = await addDoc(collection(db, 'stays'), deepCleanUndefined(stayPayload));

      setSubmissionSuccessData({
        tutor: { id: resolvedTutorId, ...tutorPayload, createdAt: new Date() },
        pet: savedPets[0],
        pets: savedPets,
        stay: {
          id: stayRef.id,
          ...stayPayload,
          tutorId: resolvedTutorId,
          petId: primaryPetId,
          petIds: resolvedPetIds,
          petNames: resolvedPetNames,
          dogCount: finalDogCount,
          createdAt: new Date(),
        },
      });

      // CORS-safe 24/7 background push alert with estimated pricing & multi-dog summary
      const petNamesSummary = resolvedPetNames.join(', ');
      const dogsCountLabel = finalDogCount > 1 ? ` (${finalDogCount} cães)` : '';
      const priceText = pricing ? ` • Total: ${formatBRL(pricing.totalPrice)}` : '';
      await sendNtfyAlert(
        `Novo Check-in Mika & Xan${dogsCountLabel}!`,
        `Pets: ${petNamesSummary} | Tutor: ${formData.fullName.trim()}${priceText}`
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
              Se você já tem cadastro na Mika &amp; Xan, buscamos o perfil do seu pet para você só
              revisar e confirmar a estadia!
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePhoneLookup();
            }}
            className="space-y-4 pt-1"
          >
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
                WhatsApp:{' '}
                <strong className="text-[#1E293B] font-mono">{existingTutor.phoneDDD}</strong>
              </p>
            </div>

            <button
              onClick={() => {
                setStage('phone_lookup');
                setExistingTutor(null);
                setExistingPets([]);
              }}
              className="text-xs font-bold text-[#1E293B] underline underline-offset-2 hover:opacity-80 self-start sm:self-auto min-h-[44px] flex items-center"
            >
              Trocar Telefone
            </button>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#1E293B] mb-1">
              Selecione 1 ou mais pets para a mesma hospedagem:
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Você pode selecionar múltiplos cães da família para calcular a diária combinada
              automaticamente.
            </p>

            {existingPets.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-xs text-[#64748B] text-center">
                Nenhum pet encontrado para este tutor.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {existingPets.map((pet) => {
                  const isSelected = selectedExistingPetIds.includes(pet.id);
                  return (
                    <div
                      key={pet.id}
                      className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#92a8d1]/15 border-[#92a8d1] ring-1 ring-[#92a8d1]'
                          : 'bg-[#FAF8F9] border-[#dec2cb]/60 hover:border-[#92a8d1]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {pet.photoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxData({
                                isOpen: true,
                                imageUrl: pet.photoUrl,
                                title: pet.nameAndBreed,
                                subtitle: `Foto Cadastrada • ${pet.ageAndWeight}`,
                              })
                            }
                            className="relative group w-14 h-14 rounded-2xl overflow-hidden border border-[#dec2cb] shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#92a8d1]"
                            title="Ampliar foto do pet"
                          >
                            <img
                              src={pet.photoUrl}
                              alt={pet.nameAndBreed}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                            />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <ZoomIn className="w-4 h-4 text-white" />
                            </div>
                          </button>
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

                      <div className="flex items-center gap-2">
                        {existingPets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleExistingPetSelection(pet.id)}
                            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#2D3E5E] text-white border-[#1E293B]'
                                : 'bg-white text-[#1E293B] border-[#c5b9cd] hover:border-[#92a8d1]'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#92a8d1]" />}
                            <span>{isSelected ? 'Selecionado' : 'Selecionar'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSelectExistingPet(pet)}
                          className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-[#92a8d1] hover:bg-[#7e96c4] text-[#1E293B] text-xs font-bold border border-[#7b93c2] flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <span>
                            {existingPets.length > 1 ? 'Só este' : 'Check-in com este Pet'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedExistingPetIds.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => handleProceedWithSelectedPets()}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-[#2D3E5E] hover:bg-[#1E293B] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#92a8d1]" />
                  <span>
                    Continuar com {selectedExistingPetIds.length}{' '}
                    {selectedExistingPetIds.length === 1
                      ? 'Cão Selecionado'
                      : 'Cães Selecionados'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#92a8d1]" />
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#dec2cb]/60">
            <button
              onClick={handleRegisterNewPetForTutor}
              className="w-full min-h-[48px] py-3 rounded-xl border border-dashed border-[#92a8d1] bg-white hover:bg-[#FAF8F9] text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
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
            <div className="flex items-center justify-between text-xs mb-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-[#1E293B] truncate">
                  {petsList[0]?.existingPetId
                    ? 'Revisão & Check-in'
                    : existingTutor
                      ? 'Novo Pet para Tutor'
                      : 'Ficha Cadastral (22 Campos)'}
                </span>
                {bookingDogCount > 1 && (
                  <span className="text-[10px] font-bold text-[#1E293B] bg-[#f7cac9] border border-[#dec2cb] px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                    {bookingDogCount} cães
                  </span>
                )}
              </div>
              <span className="text-[#64748B] font-bold text-[11px] shrink-0">
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
                SUBSTEP B: Pet Profile & Health (Fields 4-12) - Multi-Pet
            ───────────────────────────────────────────────────────── */}
            {subStep === 'pet_health' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                    <Dog className="w-4 h-4 text-[#2D3E5E]" />
                    <span>Etapa B: Identificação e Saúde do Pet</span>
                  </div>
                  {petsList.length > 1 && (
                    <span className="text-[11px] font-bold text-[#133E26] bg-[#d2e3d8] border border-[#a3cbb1] px-2.5 py-0.5 rounded-full tabular-nums">
                      {petsList.length} cães (diária ×{petsList.length})
                    </span>
                  )}
                </div>

                {petsList.map((petEntry, index) => (
                  <div
                    key={petEntry.localKey}
                    className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb] space-y-4"
                  >
                    {/* Pet Block Header */}
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#dec2cb]/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-[#92a8d1] text-[#1E293B] text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="text-sm font-black text-[#1E293B] truncate">
                          Pet {index + 1}
                          {petEntry.nameAndBreed.trim() ? ` — ${petEntry.nameAndBreed.trim()}` : ''}
                        </span>
                      </div>

                      {index > 0 && (
                        <button
                          type="button"
                          disabled={stepTransitionLock}
                          onClick={() => handleRemovePetBlock(index)}
                          className="min-h-[44px] px-3 rounded-xl bg-[#FEE2E2] hover:bg-[#FCA5A5] disabled:opacity-50 text-[#991B1B] border border-[#FECACA] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover pet</span>
                        </button>
                      )}
                    </div>

                    {/* Field 4 + Add Another Pet button */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-[#1E293B]">
                        4. Nome do Pet e Raça *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={
                          index === 0
                            ? 'Ex: Thor - Golden Retriever'
                            : `Ex: Mel - Shih-tzu (Pet ${index + 1})`
                        }
                        value={petEntry.nameAndBreed}
                        onChange={(e) => updatePetField(index, 'nameAndBreed', e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                      />

                      {index === petsList.length - 1 && (
                        <button
                          type="button"
                          disabled={stepTransitionLock}
                          onClick={handleAddPetBlock}
                          className="w-full min-h-[44px] px-4 rounded-xl border border-dashed border-[#92a8d1] bg-white hover:bg-[#92a8d1]/15 disabled:opacity-50 text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <PlusCircle className="w-4 h-4 text-[#2D3E5E]" />
                          <span>+ Adicionar outro pet</span>
                        </button>
                      )}
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
                        value={petEntry.ageAndWeight}
                        onChange={(e) => updatePetField(index, 'ageAndWeight', e.target.value)}
                        className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                      />
                    </div>

                    {/* Field 6 & 12 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3.5 rounded-2xl bg-white border border-[#dec2cb]/60">
                        <span className="block text-xs font-bold text-[#1E293B] mb-2">
                          6. O pet é castrado(a)?
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'isNeutered', true)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              petEntry.isNeutered
                                ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Sim (Castrado)
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'isNeutered', false)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              !petEntry.isNeutered
                                ? 'bg-[#c5b9cd] text-[#1E293B] border-[#b09ebc]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Não castrado
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-[#dec2cb]/60">
                        <span className="block text-xs font-bold text-[#1E293B] mb-2">
                          12. Vacinas (V8/V10, Raiva, Gripe) em dia?
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'vaccinationUpToDate', true)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              petEntry.vaccinationUpToDate
                                ? 'bg-[#d2e3d8] text-[#133E26] border-[#a3cbb1]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Em dia
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'vaccinationUpToDate', false)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              !petEntry.vaccinationUpToDate
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
                        value={petEntry.allergiesAndProtocol}
                        onChange={(e) =>
                          updatePetField(index, 'allergiesAndProtocol', e.target.value)
                        }
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
                        value={petEntry.continuousTreatmentDetails}
                        onChange={(e) =>
                          updatePetField(index, 'continuousTreatmentDetails', e.target.value)
                        }
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
                        value={petEntry.dietaryOrPhysicalRestrictions}
                        onChange={(e) =>
                          updatePetField(index, 'dietaryOrPhysicalRestrictions', e.target.value)
                        }
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
                        value={petEntry.pastSevereIllnessOrChronic}
                        onChange={(e) =>
                          updatePetField(index, 'pastSevereIllnessOrChronic', e.target.value)
                        }
                        className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP C: Behavior & Routine/Feeding (Fields 7, 13-21)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'behavior_routine' && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                  <Utensils className="w-4 h-4 text-[#2D3E5E]" />
                  <span>Etapa C: Comportamento, Rotina e Alimentação</span>
                </div>

                {petsList.map((petEntry, index) => (
                  <div
                    key={petEntry.localKey}
                    className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb] space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#dec2cb]/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-[#92a8d1] text-[#1E293B] text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="text-sm font-black text-[#1E293B] truncate">
                          Pet {index + 1}
                          {petEntry.nameAndBreed.trim() ? ` — ${petEntry.nameAndBreed.trim()}` : ''}
                        </span>
                      </div>

                      {index > 0 && (
                        <button
                          type="button"
                          disabled={stepTransitionLock}
                          onClick={() => handleCopyRoutineFromFirstPet(index)}
                          className="min-h-[44px] px-3 rounded-xl bg-white hover:bg-[#92a8d1]/20 disabled:opacity-50 text-[#1E293B] border border-[#c5b9cd] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5 text-[#2D3E5E]" />
                          <span>Copiar rotina do Pet 1</span>
                        </button>
                      )}
                    </div>

                    {/* Field 7 */}
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                        7. Comportamento com pessoas e outros animais
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Ex: Muito dócil com pessoas. Com outros cães machos é mais reservado."
                        value={petEntry.behaviorPeopleAndAnimals}
                        onChange={(e) =>
                          updatePetField(index, 'behaviorPeopleAndAnimals', e.target.value)
                        }
                        className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                      />
                    </div>

                    {/* Field 13 & 14 Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-2xl bg-white border border-[#dec2cb]/60">
                        <span className="block text-xs font-bold text-[#1E293B] mb-2">
                          13. Fica calmo quando fica sozinho?
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'calmWhenAlone', true)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              petEntry.calmWhenAlone
                                ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Sim, tranquilo
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'calmWhenAlone', false)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              !petEntry.calmWhenAlone
                                ? 'bg-[#c5b9cd] text-[#1E293B] border-[#b09ebc]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Fica ansioso
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-[#dec2cb]/60">
                        <span className="block text-xs font-bold text-[#1E293B] mb-2">
                          14. Destrói ou engole objetos não alimentares?
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'destroysOrIngestsObjects', true)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              petEntry.destroysOrIngestsObjects
                                ? 'bg-[#f7cac9] text-[#7F1D1D] border-[#dec2cb]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Sim (Risco)
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'destroysOrIngestsObjects', false)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              !petEntry.destroysOrIngestsObjects
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
                        value={petEntry.foodAmountAndSchedule}
                        onChange={(e) =>
                          updatePetField(index, 'foodAmountAndSchedule', e.target.value)
                        }
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
                        value={petEntry.treatsAndNaturalDiet}
                        onChange={(e) =>
                          updatePetField(index, 'treatsAndNaturalDiet', e.target.value)
                        }
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
                        value={petEntry.walkFrequencyAndDuration}
                        onChange={(e) =>
                          updatePetField(index, 'walkFrequencyAndDuration', e.target.value)
                        }
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
                          value={petEntry.sleepBedAndLocation}
                          onChange={(e) =>
                            updatePetField(index, 'sleepBedAndLocation', e.target.value)
                          }
                          className="w-full min-h-[48px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                        />
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-[#dec2cb]/60">
                        <span className="block text-xs font-bold text-[#1E293B] mb-2">
                          19. Faz necessidades no local correto?
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'pottyTrained', true)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              petEntry.pottyTrained
                                ? 'bg-[#92a8d1] text-[#1E293B] border-[#7b93c2]'
                                : 'bg-white text-[#64748B] border-[#c5b9cd]'
                            }`}
                          >
                            Sim (Tapete/Rua)
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePetField(index, 'pottyTrained', false)}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                              !petEntry.pottyTrained
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
                        value={petEntry.bathProtocol}
                        onChange={(e) => updatePetField(index, 'bathProtocol', e.target.value)}
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
                        value={petEntry.generalNotes}
                        onChange={(e) => updatePetField(index, 'generalNotes', e.target.value)}
                        className="w-full min-h-[56px] bg-white border border-[#c5b9cd] focus:ring-2 focus:ring-[#92a8d1] focus:border-[#92a8d1] rounded-xl px-4 py-3 text-base text-[#1E293B] placeholder-[#94A3B8] focus:outline-none transition"
                      />
                    </div>
                  </div>
                ))}
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

                {/* Field 22: Photo Upload per Pet with Compression */}
                <div className="space-y-3">
                  {petsList.map((petEntry, index) => (
                    <div
                      key={petEntry.localKey}
                      className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60"
                    >
                      <span className="block text-xs font-bold text-[#1E293B] mb-1">
                        22. Foto {petsList.length > 1 ? `do Pet ${index + 1}` : 'do Pet'}
                        {petEntry.nameAndBreed.trim()
                          ? ` (${petEntry.nameAndBreed.trim()})`
                          : ''}{' '}
                        (Opcional)
                      </span>
                      <p className="text-xs text-[#64748B] mb-3">
                        A imagem é otimizada automaticamente no seu aparelho para identificação
                        visual rápida no painel.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        {petEntry.photoUrl ? (
                          <img
                            src={petEntry.photoUrl}
                            alt={petEntry.nameAndBreed || `Preview Pet ${index + 1}`}
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
                            <span>
                              {petEntry.photoUrl
                                ? 'Trocar Foto'
                                : 'Tirar Foto ou Escolher da Galeria'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handlePetImageFileChange(index, e)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Multi-Dog Reservation Summary Card */}
                <div className="p-4 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                      <Users className="w-4 h-4 text-[#2D3E5E]" />
                      <span>Cães nesta Hospedagem ({bookingDogCount})</span>
                    </div>
                    {bookingDogCount > 1 && (
                      <span className="text-[10px] font-bold text-[#133E26] bg-[#d2e3d8] border border-[#a3cbb1] px-2 py-0.5 rounded-full tabular-nums">
                        Multiplicador ×{bookingDogCount} ativo
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {petsList.map((petEntry, idx) => (
                      <div
                        key={petEntry.localKey}
                        className="p-2.5 rounded-xl border bg-white border-[#dec2cb]/60 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {petEntry.photoUrl ? (
                            <img
                              src={petEntry.photoUrl}
                              alt={petEntry.nameAndBreed || `Pet ${idx + 1}`}
                              className="w-9 h-9 rounded-lg object-cover border border-[#dec2cb] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#c5b9cd]/30 border border-[#dec2cb] flex items-center justify-center shrink-0">
                              <Dog className="w-4 h-4 text-[#2D3E5E]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#1E293B] truncate">
                              Pet {idx + 1}:{' '}
                              {petEntry.nameAndBreed.trim() || '(preencher na Etapa B)'}
                            </p>
                            <p className="text-[11px] text-[#64748B] truncate">
                              {petEntry.ageAndWeight.trim() || 'Idade e peso pendentes'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={stepTransitionLock}
                            onClick={() => changeSubStep('pet_health')}
                            className="min-h-[44px] px-2.5 rounded-lg bg-[#FAF8F9] hover:bg-[#c5b9cd]/30 border border-[#dec2cb] text-[11px] font-bold text-[#1E293B] transition cursor-pointer"
                          >
                            Editar
                          </button>
                          {idx > 0 && (
                            <button
                              type="button"
                              disabled={stepTransitionLock}
                              onClick={() => handleRemovePetBlock(idx)}
                              className="min-h-[44px] min-w-[44px] rounded-lg bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#991B1B] border border-[#FECACA] flex items-center justify-center transition cursor-pointer"
                              title="Remover pet"
                              aria-label="Remover pet"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick-include registered siblings for returning tutors */}
                  {existingPets.some(
                    (ep) => !petsList.some((sp) => sp.existingPetId === ep.id)
                  ) && (
                    <div className="pt-1 space-y-1.5">
                      <span className="text-[10px] font-bold text-[#64748B] uppercase block">
                        Incluir outro cão já cadastrado:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {existingPets
                          .filter((ep) => !petsList.some((sp) => sp.existingPetId === ep.id))
                          .map((sibling) => (
                            <button
                              key={sibling.id}
                              type="button"
                              disabled={stepTransitionLock}
                              onClick={() => handleIncludeExistingSibling(sibling)}
                              className="min-h-[44px] px-3 rounded-xl bg-white hover:bg-[#92a8d1]/20 border border-[#92a8d1] text-[11px] font-bold text-[#1E293B] flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <PlusCircle className="w-3.5 h-3.5 text-[#2D3E5E]" />
                              <span>{sibling.nameAndBreed}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={stepTransitionLock}
                    onClick={() => {
                      handleAddPetBlock();
                      changeSubStep('pet_health');
                    }}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-dashed border-[#92a8d1] bg-white hover:bg-[#92a8d1]/15 disabled:opacity-50 text-[#1E293B] text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-[#2D3E5E]" />
                    <span>+ Adicionar outro pet</span>
                  </button>
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
                    <div className="bg-gradient-to-r from-[#f7cac9] via-[#c5b9cd] to-[#92a8d1] px-4 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#1E293B] font-bold text-xs uppercase tracking-wider">
                        <Calculator className="w-4 h-4 text-[#2D3E5E]" />
                        <span>Resumo do Valor da Hospedagem</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#1E293B] bg-white/70 px-2 py-0.5 rounded-full border border-white/80 shrink-0">
                        {bookingDogCount > 1 ? `${bookingDogCount} cães • 24h` : 'Ciclos de 24h'}
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
                              {livePricingQuote.fullCycles}{' '}
                              {livePricingQuote.fullCycles === 1 ? 'diária' : 'diárias'}
                              {livePricingQuote.hasHalfDay ? ' + meia' : ''}
                            </span>
                          </div>

                          {/* Step-by-step breakdown list */}
                          <div className="space-y-1.5 text-xs">
                            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                              Detalhamento dos Ciclos{' '}
                              {livePricingQuote.dogCount > 1 ? '(por cão)' : ''}:
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
                          <div className="pt-2 border-t border-[#dec2cb]/60 flex items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold text-[#64748B] block">
                                {livePricingQuote.dogCount > 1
                                  ? `Valor Total (${livePricingQuote.dogCount} cães)`
                                  : 'Valor Total Estimado'}
                              </span>
                              {livePricingQuote.dogCount > 1 ? (
                                <span className="text-[11px] font-bold text-[#2D3E5E] tabular-nums block">
                                  {formatBRL(livePricingQuote.unitStayPrice)} ×{' '}
                                  {livePricingQuote.dogCount} cães ={' '}
                                  {formatBRL(livePricingQuote.totalPrice)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#64748B]">
                                  Seg-Qui: R$ 79 • Sex-Dom: R$ 89 • Feriados/Alta: R$ 120
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-lg font-black text-[#1E293B] text-right block tabular-nums">
                                {formatBRL(livePricingQuote.totalPrice)}
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
                            Cálculo dinâmico baseado em ciclos de 24h e meia diária para até 6h
                            extras.
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
                        const missingIdx = petsList.findIndex(
                          (p) => !p.nameAndBreed.trim() || !p.ageAndWeight.trim()
                        );
                        if (missingIdx !== -1) {
                          alert(
                            `Por favor preencha o Nome/Raça e a Idade/Peso do Pet ${missingIdx + 1}.`
                          );
                          return;
                        }
                        changeSubStep('behavior_routine');
                      } else if (subStep === 'behavior_routine') {
                        const missingFoodIdx = petsList.findIndex(
                          (p) => !p.foodAmountAndSchedule.trim()
                        );
                        if (missingFoodIdx !== -1) {
                          alert(
                            `Por favor informe a quantidade e horários da ração do Pet ${missingFoodIdx + 1}.`
                          );
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
            <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] mt-2">
              {submissionSuccessData.pets.length > 1
                ? `Fichas de ${submissionSuccessData.pets.length} Cães Salvas!`
                : 'Ficha Salva no Sistema!'}
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto mt-1 leading-relaxed">
              Os dados de{' '}
              <strong>
                {submissionSuccessData.pets.map((p) => p.nameAndBreed).join(', ')}
              </strong>{' '}
              foram salvos e a equipe Mika &amp; Xan já tem acesso à ficha completa.
            </p>
          </div>

          {/* Voucher Summary Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F9] border border-[#dec2cb]/60 text-left space-y-2.5 text-xs">
            <div className="flex justify-between gap-2 border-b border-[#dec2cb]/60 pb-2">
              <span className="text-[#64748B] shrink-0">
                {submissionSuccessData.pets.length > 1
                  ? `Pets (${submissionSuccessData.pets.length} cães):`
                  : 'Pet:'}
              </span>
              <span className="font-bold text-[#1E293B] text-right">
                {submissionSuccessData.pets.map((p) => p.nameAndBreed).join(', ')}
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
              <div className="flex items-center justify-between gap-2 border-b border-[#dec2cb]/60 pb-2 bg-[#92a8d1]/10 px-2 py-1.5 rounded-lg">
                <div>
                  <span className="text-[#1E293B] font-semibold block">
                    Valor Estimado ({submissionSuccessData.stay.totalHours}h):
                  </span>
                  {(submissionSuccessData.stay.dogCount || 1) > 1 &&
                    submissionSuccessData.stay.pricingBreakdown?.unitStayPrice !== undefined && (
                      <span className="text-[11px] font-bold text-[#2D3E5E] tabular-nums">
                        {formatBRL(submissionSuccessData.stay.pricingBreakdown.unitStayPrice)} ×{' '}
                        {submissionSuccessData.stay.dogCount} cães
                      </span>
                    )}
                </div>
                <span className="font-black text-[#1E293B] tabular-nums">
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
                setFormData(INITIAL_TUTOR_STAY_STATE);
                setLookupPhone('');
                setSelectedExistingPetIds([]);
                setPetsList([createEmptyPetEntry(1)]);
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

      {/* Full-Screen Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={lightboxData.isOpen}
        imageUrl={lightboxData.imageUrl}
        title={lightboxData.title}
        subtitle={lightboxData.subtitle}
        onClose={() => setLightboxData((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default ClientCheckIn;
