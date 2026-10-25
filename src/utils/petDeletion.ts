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
  doc,
} from '@/lib/firebase';

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
    // 1. Query and delete all stays linked to this pet
    const staysQuery = query(collection(db, 'stays'), where('petId', '==', petId));
    const staysSnap = await getDocs(staysQuery);

    const deleteStayPromises: Promise<void>[] = [];
    staysSnap.forEach((stayDoc: any) => {
      deleteStayPromises.push(deleteDoc(doc(db, 'stays', stayDoc.id)));
    });
    await Promise.all(deleteStayPromises);
    const staysDeleted = staysSnap.size || 0;

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
