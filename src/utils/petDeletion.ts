/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  db,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  deepCleanUndefined,
} from '@/lib/firebase';
import { calculateStayPricing } from '@/lib/pricingCalculator';

export interface CascadeDeleteResult {
  success: boolean;
  staysDeleted: number;
  tutorDeleted: boolean;
  error?: string;
}

/**
 * Performs cascade deletion of a pet, all its associated stays,
 * and cleans up the tutor if no other pets remain under their profile.
 */
export async function cascadeDeletePet(
  petId: string,
  tutorId?: string
): Promise<CascadeDeleteResult> {
  if (!petId) {
    throw new Error('Pet ID is required for deletion');
  }

  try {
    // 1. Query all stays linked via primary petId or petIds array
    const [primarySnap, multiSnap] = await Promise.all([
      getDocs(query(collection(db, 'stays'), where('petId', '==', petId))),
      getDocs(query(collection(db, 'stays'), where('petIds', 'array-contains', petId))),
    ]);

    const stayDocsMap = new Map<string, any>();
    primarySnap.forEach((d: any) => stayDocsMap.set(d.id, d.data()));
    multiSnap.forEach((d: any) => stayDocsMap.set(d.id, d.data()));

    const stayMutations: Promise<void>[] = [];
    let staysDeleted = 0;

    stayDocsMap.forEach((stayData, stayId) => {
      const petIds: string[] = Array.isArray(stayData?.petIds)
        ? stayData.petIds.filter((id: string) => id && id !== petId)
        : [];

      if (petIds.length > 0) {
        const nextDogCount = petIds.length;
        const inParts = stayData.checkInDate?.includes('T')
          ? stayData.checkInDate.split('T')
          : [stayData.checkInDate || '', '10:00'];
        const outParts = stayData.checkOutDate?.includes('T')
          ? stayData.checkOutDate.split('T')
          : [stayData.checkOutDate || '', '10:00'];
        const nextPricing =
          inParts[0] && outParts[0]
            ? calculateStayPricing(
                inParts[0],
                inParts[1].slice(0, 5),
                outParts[0],
                outParts[1].slice(0, 5),
                nextDogCount
              )
            : null;

        stayMutations.push(
          updateDoc(
            doc(db, 'stays', stayId),
            deepCleanUndefined({
              petId: petIds[0],
              petIds,
              dogCount: nextDogCount,
              ...(nextPricing
                ? {
                    estimatedTotal: nextPricing.totalPrice,
                    pricingBreakdown: nextPricing,
                  }
                : {}),
            })
          )
        );
      } else {
        staysDeleted += 1;
        stayMutations.push(deleteDoc(doc(db, 'stays', stayId)));
      }
    });

    await Promise.all(stayMutations);

    // 2. Delete pet document
    await deleteDoc(doc(db, 'pets', petId));

    // 2.1 Delete isolated private admin internal notes for this pet
    try {
      await deleteDoc(doc(db, 'pet_admin_notes', petId));
    } catch (noteErr) {
      console.warn('Note deletion warning (may not exist):', noteErr);
    }

    // 3. Check if tutor has other pets registered
    let tutorDeleted = false;
    if (tutorId) {
      const remainingPetsQuery = query(collection(db, 'pets'), where('tutorId', '==', tutorId));
      const remainingPetsSnap = await getDocs(remainingPetsQuery);

      // Filter out the pet being deleted (in case of local cache race condition)
      const otherPets = remainingPetsSnap.docs.filter((d: any) => d.id !== petId);

      if (otherPets.length === 0) {
        await deleteDoc(doc(db, 'tutors', tutorId));
        tutorDeleted = true;
      }
    }

    return {
      success: true,
      staysDeleted,
      tutorDeleted,
    };
  } catch (err: any) {
    console.error('Cascade pet deletion failed:', err);
    return {
      success: false,
      staysDeleted: 0,
      tutorDeleted: false,
      error: err?.message || 'Falha ao excluir pet do banco de dados.',
    };
  }
}
