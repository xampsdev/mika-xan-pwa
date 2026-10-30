/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * Supported timestamp representation across client offline cache and remote Firestore.
 */
export type FirestoreDateTime = Timestamp | FieldValue | string | number | Date;

/**
 * Relational Collection 1: Tutor
 * Normalizes primary contact and emergency medical delegation details.
 */
export interface Tutor {
  /** Firestore Document ID */
  id: string;

  /** Field 1: Tutor's Full Name */
  fullName: string;

  /** Field 2: Mobile / WhatsApp Phone with DDD (Brazilian format: e.g., (11) 98765-4321), indexed for quick search */
  phoneDDD: string;

  /** Field 3: Designated Veterinarian Name and Emergency Contact Phone */
  vetNameAndPhone: string;

  /** Document creation timestamp */
  createdAt: FirestoreDateTime;

  /** Document last update timestamp */
  updatedAt?: FirestoreDateTime;
}

/**
 * Relational Collection 2: Pet
 * Normalizes behavioral, medical, dietary, and boarding routine details (Fields 4 to 22).
 */
export interface Pet {
  /** Firestore Document ID */
  id: string;

  /** Foreign Key referencing Tutor.id */
  tutorId: string;

  /** Field 4: Pet Name and Breed / Mixed Breed details */
  nameAndBreed: string;

  /** Field 5: Pet Age and Approximate Weight (e.g., "3 years, 14kg") */
  ageAndWeight: string;

  /** Field 6: Spayed / Neutered status */
  isNeutered: boolean;

  /** Field 7: Socialization and behavior with unfamiliar people and other animals */
  behaviorPeopleAndAnimals: string;

  /** Field 8: Known allergies, triggers, and immediate response protocol */
  allergiesAndProtocol: string;

  /** Field 9: Details for continuous medication, dosage, and administering instructions */
  continuousTreatmentDetails: string;

  /** Field 10: Specific dietary, physical, or joint restrictions */
  dietaryOrPhysicalRestrictions: string;

  /** Field 11: Past severe medical episodes, surgeries, or chronic conditions */
  pastSevereIllnessOrChronic: string;

  /** Field 12: Vaccination card status (V8/V10, Rabies, Giardia, Kennel Cough) */
  vaccinationUpToDate: boolean;

  /** Field 13: Behavior when separated or left alone (separation anxiety indicators) */
  calmWhenAlone: boolean;

  /** Field 14: Tendency to chew, destroy, or ingest non-food objects / foreign bodies */
  destroysOrIngestsObjects: boolean;

  /** Field 15: Exact daily food portion (grams/cups) and feeding schedule */
  foodAmountAndSchedule: string;

  /** Field 16: Allowed treats, fruits, vegetables, or natural diet / raw food rules */
  treatsAndNaturalDiet: string;

  /** Field 17: Walking frequency, duration, collar/harness preference, and leash behavior */
  walkFrequencyAndDuration: string;

  /** Field 18: Sleep habit, preferred bed type, crate usage, and resting location */
  sleepBedAndLocation: string;

  /** Field 19: Potty trained (hygienic tapete / grass / outdoor walks only) */
  pottyTrained: boolean;

  /** Field 20: Bath, brush, ear cleaning, and dry protocol */
  bathProtocol: string;

  /** Field 21: General observations, peculiar habits, fears (thunder/fireworks), or notes */
  generalNotes: string;

  /** Field 22: Direct URL of the pet photo stored in Firebase Storage or CDN */
  photoUrl: string;

  /** Document creation timestamp */
  createdAt?: FirestoreDateTime;

  /** Document last update timestamp */
  updatedAt?: FirestoreDateTime;
}

/**
 * Status lifecycle of a pet stay / reservation.
 */
export type StayStatus = 'pending' | 'active' | 'completed';

/**
 * Breakdown item for each 24-hour cycle or overtime block.
 */
export interface PricingCycleBreakdown {
  cycleIndex: number;
  type: 'full_cycle' | 'overtime_half_day' | 'overtime_full_day' | 'same_day_minimum' | 'tolerance_courtesy';
  dateLabel: string;
  dateKey: string;
  dayOfWeek: number;
  isWeekendOrHoliday: boolean;
  holidayName?: string | null;
  rate: number;
  description: string;
  hoursCovered: number;
}

/**
 * Complete pricing calculation result for a stay.
 */
export interface StayPricingCalculation {
  checkInDateTime: string;
  checkOutDateTime: string;
  totalHours: number;
  fullCycles: number;
  extraHours: number;
  overtimeType: 'none' | 'tolerance' | 'half_day' | 'full_day';
  estimatedTotal: number;
  hasHalfDay: boolean;
  fullDaysCount: number;
  cyclesBreakdown: PricingCycleBreakdown[];
  summaryText: string;
}

/**
 * Relational Collection 3: Stay (Check-in History)
 * Normalizes stay dates, real-time boarding state, and per-visit instructions.
 */
export interface Stay {
  /** Firestore Document ID */
  id: string;

  /** Foreign Key referencing Pet.id */
  petId: string;

  /** Foreign Key referencing Tutor.id */
  tutorId: string;

  /** Check-in date & time (ISO string: YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD) */
  checkInDate: string;

  /** Scheduled check-out date & time (ISO string: YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD) */
  checkOutDate: string;

  /** Operational status of the stay */
  status: StayStatus;

  /** Specific care notes, medication batches, or belongings brought for this stay */
  specialStayNotes: string;

  /** Private admin operational notes about this stay (observations, incidents, boarding behavior) */
  adminStayNotes?: string;

  /** Estimated pricing calculated automatically by 24h cycle engine (R$) */
  estimatedTotal?: number;

  /** Final agreed total price (editable by Admin in R$) */
  finalTotal?: number;

  /** Total calculated duration in hours */
  totalHours?: number;

  /** Detailed breakdown object from 24h cycle engine */
  pricingBreakdown?: StayPricingCalculation;

  /** Reason or note if Admin adjusted the price (e.g., Cortesia, Desconto especial) */
  adminPricingAdjustmentReason?: string;

  /** Document creation timestamp */
  createdAt: FirestoreDateTime;

  /** Actual check-out timestamp if completed */
  actualCheckOutDate?: string;
}

/**
 * Private Admin Collection: pet_admin_notes
 * Stores confidential behavioral observations, quirks, handling tips, and owner communication notes
 * strictly isolated from the public pets collection.
 */
export interface PetAdminNotes {
  /** Document ID matching Pet.id */
  id?: string;

  /** Foreign Key referencing Pet.id */
  petId: string;

  /** Confidential internal observations about the dog */
  internalNotes: string;

  /** Document last update timestamp */
  updatedAt?: FirestoreDateTime;
}

/**
 * Input DTO types for creation mutations (excluding system-generated ID).
 */
export type TutorInput = Omit<Tutor, 'id' | 'createdAt' | 'updatedAt'>;
export type PetInput = Omit<Pet, 'id' | 'createdAt' | 'updatedAt'>;
export type StayInput = Omit<Stay, 'id' | 'createdAt'>;

/**
 * Joined / Hydrated types for views and real-time offline rendering.
 */
export interface PetWithTutor extends Pet {
  tutor?: Tutor;
}

export interface StayWithDetails extends Stay {
  pet?: Pet;
  tutor?: Tutor;
}

/**
 * Map of the 22 canonical boarding intake form fields.
 */
export const FORM_FIELD_DEFINITIONS = [
  { fieldNumber: 1, key: 'fullName', label: 'Nome Completo do Tutor', entity: 'tutor' },
  { fieldNumber: 2, key: 'phoneDDD', label: 'Telefone / WhatsApp com DDD', entity: 'tutor' },
  { fieldNumber: 3, key: 'vetNameAndPhone', label: 'Nome e Telefone do Veterinário', entity: 'tutor' },
  { fieldNumber: 4, key: 'nameAndBreed', label: 'Nome e Raça do Pet', entity: 'pet' },
  { fieldNumber: 5, key: 'ageAndWeight', label: 'Idade e Peso', entity: 'pet' },
  { fieldNumber: 6, key: 'isNeutered', label: 'Castrado(a)?', entity: 'pet' },
  { fieldNumber: 7, key: 'behaviorPeopleAndAnimals', label: 'Comportamento com Pessoas e Animais', entity: 'pet' },
  { fieldNumber: 8, key: 'allergiesAndProtocol', label: 'Alergias e Protocolo de Emergência', entity: 'pet' },
  { fieldNumber: 9, key: 'continuousTreatmentDetails', label: 'Tratamento Contínuo e Medicações', entity: 'pet' },
  { fieldNumber: 10, key: 'dietaryOrPhysicalRestrictions', label: 'Restrições Alimentares ou Físicas', entity: 'pet' },
  { fieldNumber: 11, key: 'pastSevereIllnessOrChronic', label: 'Doenças Crônicas ou Histórico Grave', entity: 'pet' },
  { fieldNumber: 12, key: 'vaccinationUpToDate', label: 'Vacinação em Dia?', entity: 'pet' },
  { fieldNumber: 13, key: 'calmWhenAlone', label: 'Fica Bem Sozinho?', entity: 'pet' },
  { fieldNumber: 14, key: 'destroysOrIngestsObjects', label: 'Destrói ou Ingere Objetos?', entity: 'pet' },
  { fieldNumber: 15, key: 'foodAmountAndSchedule', label: 'Quantidade e Horários da Ração', entity: 'pet' },
  { fieldNumber: 16, key: 'treatsAndNaturalDiet', label: 'Petiscos e Alimentação Natural', entity: 'pet' },
  { fieldNumber: 17, key: 'walkFrequencyAndDuration', label: 'Frequência e Duração dos Passeios', entity: 'pet' },
  { fieldNumber: 18, key: 'sleepBedAndLocation', label: 'Onde e Como Dorme', entity: 'pet' },
  { fieldNumber: 19, key: 'pottyTrained', label: 'Faz Necessidades no Lugar Certo?', entity: 'pet' },
  { fieldNumber: 20, key: 'bathProtocol', label: 'Protocolo de Banho e Higiene', entity: 'pet' },
  { fieldNumber: 21, key: 'generalNotes', label: 'Observações Gerais e Manias', entity: 'pet' },
  { fieldNumber: 22, key: 'photoUrl', label: 'Foto do Pet', entity: 'pet' },
] as const;
