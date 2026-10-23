/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Tutor, Pet, Stay } from '@/types/schema';

export const SEED_TUTORS: Tutor[] = [
  {
    id: 'tutor_seed_mariana',
    fullName: 'Mariana Albuquerque Silva',
    phoneDDD: '(11) 98765-4321',
    vetNameAndPhone: 'Dra. Camila Santos - (11) 99123-4567 (Clínica VetCare Moema)',
    createdAt: new Date('2026-01-15T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-10-20T14:30:00Z').toISOString(),
  },
  {
    id: 'tutor_seed_rodrigo',
    fullName: 'Rodrigo Mendes Pires',
    phoneDDD: '(21) 99876-5432',
    vetNameAndPhone: 'Dr. Marcos Lima - (21) 98888-1122 (Hospital Veterinário 24h Leblon)',
    createdAt: new Date('2026-02-10T11:20:00Z').toISOString(),
    updatedAt: new Date('2026-10-18T09:15:00Z').toISOString(),
  },
];

export const SEED_PETS: Pet[] = [
  {
    id: 'pet_seed_bento',
    tutorId: 'tutor_seed_mariana',
    nameAndBreed: 'Bento - Golden Retriever',
    ageAndWeight: '3 anos, 28kg',
    isNeutered: true,
    behaviorPeopleAndAnimals:
      'Dócil, adora brincar com outros cães de médio e grande porte. Não tem histórico de brigas.',
    allergiesAndProtocol:
      'Alergia a picada de abelha/vespa. Em caso de inchaço, administrar 1 cp. Antialérgico que está na mala e contatar a Dra. Camila.',
    continuousTreatmentDetails:
      'Colírio lubrificante nos dois olhos 2x ao dia às 08h e às 20h após a alimentação.',
    dietaryOrPhysicalRestrictions:
      'Displasia coxofemoral grau leve. Evitar saltos repetitivos de locais muito altos.',
    pastSevereIllnessOrChronic:
      'Procedimento cirúrgico preventivo no ligamento em 2024. Recuperação 100% concluída.',
    vaccinationUpToDate: true,
    calmWhenAlone: true,
    destroysOrIngestsObjects: true,
    foodAmountAndSchedule: '150g ração Super Premium pela manhã (08h) e 150g à noite (19h).',
    treatsAndNaturalDiet:
      'Permitido cenoura crua, maçã sem caroço e biscoitos específicos para cães.',
    walkFrequencyAndDuration: '2 passeios diários de 30 minutos com guia peitoral anti-puxão.',
    sleepBedAndLocation: 'Dorme em caminha própria no mesmo ambiente dos anfitriões.',
    pottyTrained: true,
    bathProtocol: 'Shampoo hipoalergênico neutro, secagem minuciosa das orelhas e patas.',
    generalNotes:
      'Possui medo de trovões e fogos de artifício. Gosta de massagem suave no peito quando ansioso.',
    photoUrl:
      'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80',
    createdAt: new Date('2026-01-15T10:15:00Z').toISOString(),
    updatedAt: new Date('2026-10-20T14:35:00Z').toISOString(),
  },
  {
    id: 'pet_seed_luna',
    tutorId: 'tutor_seed_mariana',
    nameAndBreed: 'Luna - Border Collie',
    ageAndWeight: '2 anos, 18kg',
    isNeutered: true,
    behaviorPeopleAndAnimals:
      'Extremamente inteligente e cheia de energia. Adora jogos de buscar bolinha e agilidade.',
    allergiesAndProtocol: '',
    continuousTreatmentDetails: '',
    dietaryOrPhysicalRestrictions: 'Nenhuma restrição conhecida.',
    pastSevereIllnessOrChronic: '',
    vaccinationUpToDate: true,
    calmWhenAlone: true,
    destroysOrIngestsObjects: false,
    foodAmountAndSchedule: '120g pela manhã (08h) e 120g à noite (19h30).',
    treatsAndNaturalDiet: 'Frango desidratado e petiscos funcionais de treinamento.',
    walkFrequencyAndDuration: 'Passeios ativos e enriquecimento ambiental 2x ao dia.',
    sleepBedAndLocation: 'Caminha macia próxima ao Bento.',
    pottyTrained: true,
    bathProtocol: 'Escovação de pelo 2x por semana e banho a cada 15 dias.',
    generalNotes: 'Fica muito atenta a portas abertas. Responder prontamente ao comando "fica".',
    photoUrl:
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=600&q=80',
    createdAt: new Date('2026-01-15T10:30:00Z').toISOString(),
    updatedAt: new Date('2026-10-20T14:35:00Z').toISOString(),
  },
  {
    id: 'pet_seed_thor',
    tutorId: 'tutor_seed_rodrigo',
    nameAndBreed: 'Thor - Bulldog Francês',
    ageAndWeight: '4 anos, 13kg',
    isNeutered: true,
    behaviorPeopleAndAnimals:
      'Calmo, dorminhoco e sociável com pessoas. Às vezes se assusta com cães muito agitados.',
    allergiesAndProtocol:
      'Dermatite atópica leve em dias muito quentes. Aplicar loção hidratante nas dobrinhas se avermelhar.',
    continuousTreatmentDetails: 'Limpeza diária das dobrinhas faciais com lenço umedecido hipoalergênico.',
    dietaryOrPhysicalRestrictions:
      'Braquicefálico: não fazer passeios sob sol forte (risco de hipertermia). Ar condicionado em dias quentes.',
    pastSevereIllnessOrChronic: 'Episódio de otite em 2025, curado.',
    vaccinationUpToDate: true,
    calmWhenAlone: true,
    destroysOrIngestsObjects: false,
    foodAmountAndSchedule: '90g ração Gastrointestinal às 08h e 90g às 18h.',
    treatsAndNaturalDiet: 'Apenas petiscos hipoalergênicos monoproteicos.',
    walkFrequencyAndDuration: 'Passeios curtos de 15 minutos em horários frescos (início da manhã ou noite).',
    sleepBedAndLocation: 'Dorme no chão refrigerado ou em caminha almofadada.',
    pottyTrained: true,
    bathProtocol: 'Secagem completa das dobrinhas e uso de protetor solar no focinho.',
    generalNotes: 'Ronca durante o sono e bebe bastante água após pequenas caminhadas.',
    photoUrl:
      'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80',
    createdAt: new Date('2026-02-10T11:40:00Z').toISOString(),
    updatedAt: new Date('2026-10-18T09:20:00Z').toISOString(),
  },
];

export const SEED_STAYS: Stay[] = [
  {
    id: 'stay_seed_active_bento',
    petId: 'pet_seed_bento',
    tutorId: 'tutor_seed_mariana',
    checkInDate: new Date().toISOString(),
    checkOutDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    status: 'active',
    specialStayNotes:
      'Trouxe ração em pote vedado, caminha azul, mordedor de borracha rígida e frasco do colírio.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'stay_seed_pending_luna',
    petId: 'pet_seed_luna',
    tutorId: 'tutor_seed_mariana',
    checkInDate: new Date(Date.now() + 86400000).toISOString(),
    checkOutDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    status: 'pending',
    specialStayNotes: 'Primeira vez hospedada sozinha sem o Bento. Acompanhar adaptação.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'stay_seed_completed_thor',
    petId: 'pet_seed_thor',
    tutorId: 'tutor_seed_rodrigo',
    checkInDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    checkOutDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    actualCheckOutDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    status: 'completed',
    specialStayNotes: 'Estadia tranquila de feriado. Comeu e dormiu muito bem.',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];
