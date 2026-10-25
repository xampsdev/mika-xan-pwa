/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
} from '@/lib/firebase';
import {
  Search,
  User,
  Phone,
  Calendar,
  Camera,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ArrowRight,
  ArrowLeft,
  Dog,
  Sparkles,
  ShieldCheck,
  HeartHandshake,
  Utensils,
  Moon,
  Clock,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { formatBrazilianPhone, sanitizePhone, isValidBrazilianPhone } from '@/utils/phone';
import { compressImageToDataUrl } from '@/utils/imageCompression';
import { sendNtfyAlert } from '@/lib/ntfy';
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
      const tutorPayload = {
        fullName: formData.fullName.trim(),
        phoneDDD: formatBrazilianPhone(formData.phoneDDD),
        vetNameAndPhone: formData.vetNameAndPhone.trim(),
        updatedAt: serverTimestamp(),
      };

      if (tutorId) {
        await setDoc(doc(db, 'tutors', tutorId), tutorPayload, { merge: true });
      } else {
        const newTutorRef = await addDoc(collection(db, 'tutors'), {
          ...tutorPayload,
          createdAt: serverTimestamp(),
        });
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
      const petPayload = {
        tutorId,
        nameAndBreed: formData.nameAndBreed.trim(),
        ageAndWeight: formData.ageAndWeight.trim(),
        isNeutered: formData.isNeutered,
        behaviorPeopleAndAnimals: formData.behaviorPeopleAndAnimals.trim(),
        allergiesAndProtocol: formData.allergiesAndProtocol.trim(),
        continuousTreatmentDetails: formData.continuousTreatmentDetails.trim(),
        dietaryOrPhysicalRestrictions: formData.dietaryOrPhysicalRestrictions.trim(),
        pastSevereIllnessOrChronic: formData.pastSevereIllnessOrChronic.trim(),
        vaccinationUpToDate: formData.vaccinationUpToDate,
        calmWhenAlone: formData.calmWhenAlone,
        destroysOrIngestsObjects: formData.destroysOrIngestsObjects,
        foodAmountAndSchedule: formData.foodAmountAndSchedule.trim(),
        treatsAndNaturalDiet: formData.treatsAndNaturalDiet.trim(),
        walkFrequencyAndDuration: formData.walkFrequencyAndDuration.trim(),
        sleepBedAndLocation: formData.sleepBedAndLocation.trim(),
        pottyTrained: formData.pottyTrained,
        bathProtocol: formData.bathProtocol.trim(),
        generalNotes: formData.generalNotes.trim(),
        photoUrl: uploadedPhotoUrl || '',
        updatedAt: serverTimestamp(),
      };

      if (petId) {
        await setDoc(doc(db, 'pets', petId), petPayload, { merge: true });
      } else {
        const newPetRef = await addDoc(collection(db, 'pets'), {
          ...petPayload,
          createdAt: serverTimestamp(),
        });
        petId = newPetRef.id;
      }

      // 4. Create Stay Doc (combined date + time)
      const checkInCombined = `${formData.checkInDate}T${formData.checkInTime}`;
      const checkOutCombined = `${formData.checkOutDate}T${formData.checkOutTime}`;

      const stayPayload = {
        petId,
        tutorId,
        checkInDate: checkInCombined,
        checkOutDate: checkOutCombined,
        status: 'pending' as StayStatus,
        specialStayNotes: formData.specialStayNotes.trim(),
        createdAt: serverTimestamp(),
      };

      const stayRef = await addDoc(collection(db, 'stays'), stayPayload);

      const finalTutorId = tutorId || `tutor_${Date.now()}`;
      const finalPetId = petId || `pet_${Date.now()}`;

      setSubmissionSuccessData({
        tutor: { id: finalTutorId, ...tutorPayload, createdAt: new Date() },
        pet: { id: finalPetId, ...petPayload, tutorId: finalTutorId, createdAt: new Date() },
        stay: { id: stayRef.id, ...stayPayload, tutorId: finalTutorId, petId: finalPetId, createdAt: new Date() },
      });

      // CORS-safe 24/7 background push alert (Spark tier compatible)
      await sendNtfyAlert(
        'Novo Check-in Mika & Xan!',
        `Pet: ${formData.nameAndBreed.trim()} | Tutor: ${formData.fullName.trim()}`
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
    <div className="w-full max-w-2xl mx-auto px-4 py-4 sm:py-6 overflow-x-hidden">
      {/* ─────────────────────────────────────────────────────────────
          STAGE 1: Phone Lookup (Field 2)
      ───────────────────────────────────────────────────────────── */}
      {stage === 'phone_lookup' && (
        <div className="bg-white border border-[#E7E2D8] rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
            <Search className="w-4 h-4" />
            <span>Check-in Rápido de Hospedagem</span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] tracking-tight">
              Informe seu WhatsApp ou Telefone
            </h2>
            <p className="text-xs sm:text-sm text-[#78716C] mt-1 leading-relaxed">
              Se você já tem cadastro na Mika &amp; Xan, buscamos o perfil do seu pet para você só revisar e confirmar a estadia!
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handlePhoneLookup(); }} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider mb-1.5">
                Telefone com DDD (Campo 2)
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 98765-4321"
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(formatBrazilianPhone(e.target.value))}
                  className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl pl-10 pr-4 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition font-mono"
                  autoFocus
                />
              </div>
              {lookupError && (
                <p className="mt-2 text-xs text-[#991B1B] flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{lookupError}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handlePhoneLookup()}
              disabled={lookupLoading || !lookupPhone}
              className="w-full min-h-[48px] px-5 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] active:bg-[#AA4D29] disabled:opacity-50 text-white font-bold text-sm shadow-sm shadow-[#D96B43]/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {lookupLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Buscando cadastro...</span>
                </>
              ) : (
                <>
                  <span>Prosseguir para Check-in</span>
                  <ArrowRight className="w-4 h-4" />
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
        <div className="bg-white border border-[#E7E2D8] rounded-3xl p-5 sm:p-7 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E7E2D8] pb-4 gap-2">
            <div>
              <span className="text-[10px] font-bold text-[#245235] bg-[#E8F0EA] px-2 py-0.5 rounded border border-[#C5DDCB] uppercase">
                Cliente Cadastrado
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] mt-1">
                Olá, {existingTutor.fullName}!
              </h2>
              <p className="text-xs text-[#78716C] mt-0.5">
                WhatsApp: <strong className="text-[#1C1917] font-mono">{existingTutor.phoneDDD}</strong>
              </p>
            </div>

            <button
              onClick={() => {
                setStage('phone_lookup');
                setExistingTutor(null);
                setExistingPets([]);
              }}
              className="text-xs font-semibold text-[#D96B43] hover:underline self-start sm:self-auto min-h-[36px] flex items-center"
            >
              Trocar Telefone
            </button>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#1C1917] mb-1">
              Selecione o pet para a nova hospedagem:
            </h3>
            <p className="text-xs text-[#78716C] mb-4">
              Os 22 campos do perfil selecionado serão preenchidos automaticamente.
            </p>

            {existingPets.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] text-xs text-[#78716C] text-center">
                Nenhum pet encontrado para este tutor.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {existingPets.map((pet) => (
                  <div
                    key={pet.id}
                    className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] hover:border-[#D96B43] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {pet.photoUrl ? (
                        <img
                          src={pet.photoUrl}
                          alt={pet.nameAndBreed}
                          className="w-14 h-14 rounded-2xl object-cover border border-[#E7E2D8] shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-[#E8F0EA] text-[#245235] flex items-center justify-center shrink-0">
                          <Dog className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-[#1C1917]">{pet.nameAndBreed}</h4>
                        <p className="text-xs text-[#78716C]">{pet.ageAndWeight}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pet.isNeutered && (
                            <span className="text-[10px] bg-[#E8F0EA] text-[#245235] px-1.5 py-0.5 rounded border border-[#C5DDCB]">
                              Castrado
                            </span>
                          )}
                          {pet.vaccinationUpToDate && (
                            <span className="text-[10px] bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                              Vacinas OK
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectExistingPet(pet)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                      <span>Check-in com este Pet</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#E7E2D8]">
            <button
              onClick={handleRegisterNewPetForTutor}
              className="w-full min-h-[48px] py-3 rounded-xl border border-dashed border-[#D96B43] hover:bg-[#FAF7F2] text-[#D96B43] text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cadastrar Outro Pet para {existingTutor.fullName}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STAGE 3: Multi-Step Intake Form (22 Fields Normalized)
      ───────────────────────────────────────────────────────────── */}
      {stage === 'intake_form' && (
        <div className="bg-white border border-[#E7E2D8] rounded-3xl shadow-sm overflow-hidden pb-24 sm:pb-28">
          {/* Progress Header */}
          <div className="border-b border-[#E7E2D8] p-4 sm:p-5 bg-[#FAF7F2]">
            <div className="flex items-center justify-between text-xs mb-2.5">
              <span className="font-bold text-[#D96B43]">
                {selectedPetId
                  ? 'Revisão & Check-in'
                  : existingTutor
                    ? 'Novo Pet para Tutor'
                    : 'Ficha Cadastral (22 Campos)'}
              </span>
              <span className="text-[#78716C] font-semibold text-[11px]">
                {subStep === 'tutor_vet' && '1/4: Tutor & Vet'}
                {subStep === 'pet_health' && '2/4: Pet & Saúde'}
                {subStep === 'behavior_routine' && '3/4: Rotina & Manejo'}
                {subStep === 'photo_stay' && '4/4: Foto & Hospedagem'}
              </span>
            </div>

            {/* Stepper Tabs */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('tutor_vet')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'tutor_vet' ? 'bg-[#D96B43]' : 'bg-[#E7E2D8]'
                }`}
                title="Tutor & Veterinário"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('pet_health')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'pet_health' ? 'bg-[#D96B43]' : 'bg-[#E7E2D8]'
                }`}
                title="Pet & Saúde"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('behavior_routine')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'behavior_routine' ? 'bg-[#D96B43]' : 'bg-[#E7E2D8]'
                }`}
                title="Comportamento & Rotina"
              />
              <button
                type="button"
                disabled={stepTransitionLock}
                onClick={() => changeSubStep('photo_stay')}
                className={`h-2 rounded-full transition disabled:opacity-50 ${
                  subStep === 'photo_stay' ? 'bg-[#D96B43]' : 'bg-[#E7E2D8]'
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
                <div className="flex items-center gap-2 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
                  <User className="w-4 h-4" />
                  <span>Etapa A: Informações do Tutor &amp; Emergência</span>
                </div>

                {/* Field 1 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    1. Nome Completo do Tutor *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Maria Clara dos Santos"
                    value={formData.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 2 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    2. Telefone / WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    placeholder="(11) 98765-4321"
                    value={formData.phoneDDD}
                    onChange={(e) => updateField('phoneDDD', formatBrazilianPhone(e.target.value))}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition font-mono"
                  />
                </div>

                {/* Field 3 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    3. Veterinário Responsável ou Clínica de Emergência
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Dr. Roberto / Clínica VetCare (11) 99999-0000"
                    value={formData.vetNameAndPhone}
                    onChange={(e) => updateField('vetNameAndPhone', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                  <span className="text-[11px] text-[#78716C] mt-1 block">
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
                <div className="flex items-center gap-2 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
                  <Dog className="w-4 h-4" />
                  <span>Etapa B: Identificação e Saúde do Pet</span>
                </div>

                {/* Field 4 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    4. Nome do Pet e Raça *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Thor - Golden Retriever"
                    value={formData.nameAndBreed}
                    onChange={(e) => updateField('nameAndBreed', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 5 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    5. Idade e Peso Aproximado *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 3 anos e meio - 28 kg"
                    value={formData.ageAndWeight}
                    onChange={(e) => updateField('ageAndWeight', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 6 & 12 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="block text-xs font-bold text-[#1C1917] mb-2">
                      6. O pet é castrado(a)?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('isNeutered', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.isNeutered
                            ? 'bg-[#D96B43] text-white border-[#D96B43]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Sim (Castrado)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('isNeutered', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.isNeutered
                            ? 'bg-[#D96B43] text-white border-[#D96B43]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Não castrado
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="block text-xs font-bold text-[#1C1917] mb-2">
                      12. Vacinas (V8/V10, Raiva, Gripe) em dia?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('vaccinationUpToDate', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.vaccinationUpToDate
                            ? 'bg-[#245235] text-white border-[#245235]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Em dia
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('vaccinationUpToDate', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.vaccinationUpToDate
                            ? 'bg-[#991B1B] text-white border-[#991B1B]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Pendente
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 8 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    8. Possui alergias conhecidas e qual o protocolo?
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Alergia a frango e picada de pulga; tomar Apoquel 5,4mg se coceira"
                    value={formData.allergiesAndProtocol}
                    onChange={(e) => updateField('allergiesAndProtocol', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 9 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    9. Faz uso de medicação contínua? (Nome, dosagem e horários)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Omeprazol 10mg às 07h em jejum; Condroplex às 19h com a refeição"
                    value={formData.continuousTreatmentDetails}
                    onChange={(e) => updateField('continuousTreatmentDetails', e.target.value)}
                    className="w-full min-h-[56px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 10 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    10. Restrições físicas ou de exercícios
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Displasia coxofemoral leve, evitar pisos lisos e escadas longas"
                    value={formData.dietaryOrPhysicalRestrictions}
                    onChange={(e) => updateField('dietaryOrPhysicalRestrictions', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 11 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    11. Histórico de cirurgias ou doenças graves pregressas
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Castração em 2023, sem outras intervenções"
                    value={formData.pastSevereIllnessOrChronic}
                    onChange={(e) => updateField('pastSevereIllnessOrChronic', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP C: Behavior & Routine/Feeding (Fields 7, 13-21)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'behavior_routine' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
                  <Utensils className="w-4 h-4" />
                  <span>Etapa C: Comportamento, Rotina e Alimentação</span>
                </div>

                {/* Field 7 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    7. Comportamento com pessoas e outros animais
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Muito dócil com pessoas. Com outros cães machos é mais reservado."
                    value={formData.behaviorPeopleAndAnimals}
                    onChange={(e) => updateField('behaviorPeopleAndAnimals', e.target.value)}
                    className="w-full min-h-[56px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 13 & 14 Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="block text-xs font-bold text-[#1C1917] mb-2">
                      13. Fica calmo quando fica sozinho?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('calmWhenAlone', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.calmWhenAlone
                            ? 'bg-[#245235] text-white border-[#245235]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Sim, tranquilo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('calmWhenAlone', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.calmWhenAlone
                            ? 'bg-[#92400E] text-white border-[#92400E]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Fica ansioso
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="block text-xs font-bold text-[#1C1917] mb-2">
                      14. Destrói ou engole objetos não alimentares?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('destroysOrIngestsObjects', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.destroysOrIngestsObjects
                            ? 'bg-[#991B1B] text-white border-[#991B1B]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Sim (Risco)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('destroysOrIngestsObjects', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.destroysOrIngestsObjects
                            ? 'bg-[#245235] text-white border-[#245235]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Não rói
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 15 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    15. Ração: Quantidade diária e horários das refeições *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 250g de Premier às 08h e 250g às 18h"
                    value={formData.foodAmountAndSchedule}
                    onChange={(e) => updateField('foodAmountAndSchedule', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 16 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    16. Petiscos, frutas e alimentação natural permitidos
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pode maçã sem semente, cenoura e biscoito de carne"
                    value={formData.treatsAndNaturalDiet}
                    onChange={(e) => updateField('treatsAndNaturalDiet', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 17 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    17. Frequência e duração habitual dos passeios
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2 vezes ao dia (30 minutos pela manhã e à noite)"
                    value={formData.walkFrequencyAndDuration}
                    onChange={(e) => updateField('walkFrequencyAndDuration', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 18 & 19 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                      18. Onde e como dorme habitualmente?
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Na caminha no quarto, com ar condicionado ligado"
                      value={formData.sleepBedAndLocation}
                      onChange={(e) => updateField('sleepBedAndLocation', e.target.value)}
                      className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                    <span className="block text-xs font-bold text-[#1C1917] mb-2">
                      19. Faz necessidades no local correto?
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('pottyTrained', true)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          formData.pottyTrained
                            ? 'bg-[#245235] text-white border-[#245235]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Sim (Tapete/Rua)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('pottyTrained', false)}
                        className={`min-h-[44px] rounded-xl font-bold text-xs transition border flex items-center justify-center ${
                          !formData.pottyTrained
                            ? 'bg-[#92400E] text-white border-[#92400E]'
                            : 'bg-white text-[#78716C] border-[#E7E2D8]'
                        }`}
                      >
                        Às vezes erra
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field 20 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    20. Protocolo de banho e higiene
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Banho quinzenal com xampu neutro hipoalergênico"
                    value={formData.bathProtocol}
                    onChange={(e) => updateField('bathProtocol', e.target.value)}
                    className="w-full min-h-[48px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>

                {/* Field 21 */}
                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    21. Observações gerais, medos e manias
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Morre de medo de fogos e trovões; adora carinho na barriga antes de dormir."
                    value={formData.generalNotes}
                    onChange={(e) => updateField('generalNotes', e.target.value)}
                    className="w-full min-h-[56px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                SUBSTEP D: Photo & Stay Details (Field 22 + Stay)
            ───────────────────────────────────────────────────────── */}
            {subStep === 'photo_stay' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#D96B43] font-bold text-xs uppercase tracking-wider">
                  <Camera className="w-4 h-4" />
                  <span>Etapa D: Foto do Pet e Datas da Hospedagem</span>
                </div>

                {/* Field 22: Photo Upload with Compression */}
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8]">
                  <span className="block text-xs font-bold text-[#1C1917] mb-1">
                    22. Foto do Pet (Opcional)
                  </span>
                  <p className="text-xs text-[#78716C] mb-3">
                    A imagem é otimizada automaticamente no seu aparelho para identificação visual rápida no painel.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {compressedPreview ? (
                      <img
                        src={compressedPreview}
                        alt="Preview"
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-[#D96B43] shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-[#E7E2D8] flex flex-col items-center justify-center text-[#78716C] shrink-0">
                        <Camera className="w-6 h-6 mb-1 text-[#D96B43]" />
                        <span className="text-[10px]">Sem foto</span>
                      </div>
                    )}

                    <div className="flex-1 w-full">
                      <label className="min-h-[48px] w-full px-4 rounded-xl bg-white border border-[#E7E2D8] hover:border-[#D96B43] text-[#1C1917] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition">
                        <Camera className="w-4 h-4 text-[#D96B43]" />
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
                      <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                        Data de Check-in *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkInDate}
                        onChange={(e) => updateField('checkInDate', e.target.value)}
                        className="w-full min-h-[52px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] font-mono focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                        Horário de Check-in *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.checkInTime}
                        onChange={(e) => updateField('checkInTime', e.target.value)}
                        className="w-full min-h-[52px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] font-mono focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                        Data de Check-out Previsto *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.checkOutDate}
                        onChange={(e) => updateField('checkOutDate', e.target.value)}
                        className="w-full min-h-[52px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] font-mono focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                        Horário de Check-out Previsto *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.checkOutTime}
                        onChange={(e) => updateField('checkOutTime', e.target.value)}
                        className="w-full min-h-[52px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] font-mono focus:outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Explicit Confirmation Checkbox */}
                  <div className="pt-2">
                    <label className="flex items-start gap-3 p-3.5 bg-[#FAF7F2] border border-[#E7E2D8] rounded-xl cursor-pointer hover:border-[#D96B43] transition">
                      <input
                        type="checkbox"
                        checked={dateConfirmationChecked}
                        onChange={(e) => setDateConfirmationChecked(e.target.checked)}
                        className="w-5 h-5 mt-0.5 rounded border-[#E7E2D8] text-[#D96B43] focus:ring-[#D96B43] shrink-0"
                      />
                      <span className="text-xs font-semibold text-[#1C1917] leading-relaxed">
                        Confirmo as datas e horários de entrada e saída acima *
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1C1917] mb-1.5">
                    Observações Específicas Desta Estadia &amp; Pertences Trazidos
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Trouxe ração em pote vedado, caminha azul, mordedor de borracha e coleira extra."
                    value={formData.specialStayNotes}
                    onChange={(e) => updateField('specialStayNotes', e.target.value)}
                    className="w-full min-h-[56px] bg-[#FAF7F2] border border-[#E7E2D8] focus:border-[#D96B43] focus:bg-white rounded-xl px-3.5 py-3 text-base text-[#1C1917] placeholder-[#A8A29E] focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────
                STICKY BOTTOM ACTION BAR (Thumb-Friendly Ergonomics)
            ───────────────────────────────────────────────────────── */}
            <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-[#E7E2D8] p-3 sm:p-4 z-30 shadow-lg">
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
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
                    className="min-h-[48px] px-4 rounded-xl border border-[#E7E2D8] text-[#78716C] hover:text-[#1C1917] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
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
                    className="min-h-[48px] px-4 rounded-xl border border-[#E7E2D8] text-[#78716C] hover:text-[#1C1917] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
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
                    className="min-h-[48px] px-6 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] active:bg-[#AA4D29] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm shadow-[#D96B43]/20 transition cursor-pointer"
                  >
                    <span>Próximo Passo</span>
                    <ArrowRight className="w-4 h-4" />
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
                    className="min-h-[48px] px-6 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] active:bg-[#AA4D29] disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md shadow-[#D96B43]/30 flex items-center gap-2 transition cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Confirmando Check-in...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
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
        <div className="bg-white border border-[#E7E2D8] rounded-3xl p-6 sm:p-8 shadow-sm space-y-5 text-center">
          <div className="w-16 h-16 rounded-full bg-[#E8F0EA] border border-[#C5DDCB] text-[#245235] mx-auto flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[10px] font-bold tracking-widest text-[#245235] bg-[#E8F0EA] px-2.5 py-1 rounded-full uppercase border border-[#C5DDCB]">
              Check-in Confirmado
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#1C1917] mt-2">Ficha Salva no Sistema!</h2>
            <p className="text-xs sm:text-sm text-[#78716C] max-w-md mx-auto mt-1 leading-relaxed">
              Os dados de <strong>{submissionSuccessData.pet.nameAndBreed}</strong> foram salvos e a equipe Mika &amp; Xan já tem acesso à ficha completa.
            </p>
          </div>

          {/* Voucher Summary Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F2] border border-[#E7E2D8] text-left space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-[#E7E2D8] pb-2">
              <span className="text-[#78716C]">Pet:</span>
              <span className="font-bold text-[#1C1917]">
                {submissionSuccessData.pet.nameAndBreed}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#E7E2D8] pb-2">
              <span className="text-[#78716C]">Tutor Responsável:</span>
              <span className="font-semibold text-[#1C1917]">
                {submissionSuccessData.tutor.fullName}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#E7E2D8] pb-2">
              <span className="text-[#78716C]">Check-in:</span>
              <span className="font-medium text-[#D96B43]">
                {new Date(submissionSuccessData.stay.checkInDate).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#E7E2D8] pb-2">
              <span className="text-[#78716C]">Check-out Previsto:</span>
              <span className="font-medium text-[#1C1917]">
                {new Date(submissionSuccessData.stay.checkOutDate).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-[#78716C]">Status Operacional:</span>
              <span className="px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] uppercase text-[10px] font-bold">
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
              className="w-full sm:w-auto min-w-[260px] min-h-[48px] px-6 rounded-xl bg-[#D96B43] hover:bg-[#C25B34] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-[#D96B43]/20 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Cadastrar Outro Pet / Início</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientCheckIn;
