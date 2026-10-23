/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Initialize Admin SDK once
initializeApp();

/**
 * Cloud Function triggered on any new stay creation (`stays/{stayId}`).
 * Retrieves pet and tutor profiles, collects all active admin device tokens from
 * the `admin_tokens` collection, and dispatches a multicast push notification.
 */
export const onNewStayCreated = onDocumentCreated(
  {
    document: 'stays/{stayId}',
    region: 'us-central1',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log('No data associated with the event.');
      return;
    }

    const stay = snap.data();
    const stayId = event.params.stayId;
    const db = getFirestore();

    try {
      // 1. Fetch Pet and Tutor Documents
      const petDoc = await db.collection('pets').doc(stay.petId).get();
      const tutorDoc = await db.collection('tutors').doc(stay.tutorId).get();

      const petName = petDoc.exists ? petDoc.data()?.nameAndBreed || 'Pet' : 'Pet';
      const tutorName = tutorDoc.exists ? tutorDoc.data()?.fullName || 'Tutor' : 'Tutor';

      const checkInFormatted = stay.checkInDate
        ? new Date(stay.checkInDate).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Data não informada';

      // 2. Fetch all registered Admin FCM device tokens
      const tokensSnap = await db.collection('admin_tokens').get();
      if (tokensSnap.empty) {
        console.log('No registered admin tokens found in admin_tokens collection.');
        return;
      }

      const tokens: string[] = [];
      tokensSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.token) {
          tokens.push(data.token);
        } else if (docSnap.id) {
          tokens.push(docSnap.id);
        }
      });

      if (tokens.length === 0) {
        console.log('No valid token strings found.');
        return;
      }

      console.log(`Dispatching FCM multicast notification to ${tokens.length} admin device(s)...`);

      // 3. Dispatch Multicast Message via Firebase Cloud Messaging
      const multicastPayload = {
        tokens,
        notification: {
          title: `🐾 Novo Check-in: ${petName}`,
          body: `${tutorName} enviou a ficha de check-in para ${checkInFormatted}.`,
        },
        data: {
          stayId,
          petId: stay.petId || '',
          tutorId: stay.tutorId || '',
          url: '/?view=admin',
        },
        webpush: {
          fcmOptions: {
            link: '/?view=admin',
          },
          notification: {
            icon: '/pwa-192x192.png',
            badge: '/apple-touch-icon.png',
            tag: `stay-${stayId}`,
          },
        },
      };

      const response = await getMessaging().sendEachForMulticast(multicastPayload);

      console.log(
        `FCM Multicast finished: ${response.successCount} succeeded, ${response.failureCount} failed.`
      );

      // 4. Prune Unregistered / Expired Tokens
      if (response.failureCount > 0) {
        const cleanupPromises: Promise<any>[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token'
            ) {
              const staleToken = tokens[idx];
              console.log(`Pruning stale admin token: ${staleToken}`);
              cleanupPromises.push(db.collection('admin_tokens').doc(staleToken).delete());
            }
          }
        });
        await Promise.all(cleanupPromises);
      }
    } catch (error) {
      console.error('Error handling onNewStayCreated trigger:', error);
    }
  }
);
