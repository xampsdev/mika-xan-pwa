/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
  collection as fbCollection,
  doc as fbDoc,
  query as fbQuery,
  where as fbWhere,
  getDocs as fbGetDocs,
  setDoc as fbSetDoc,
  addDoc as fbAddDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot,
  serverTimestamp as fbServerTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  type Auth,
  signInWithEmailAndPassword as fbSignIn,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  setPersistence,
  inMemoryPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  getStorage,
  type FirebaseStorage,
  ref as fbRef,
  uploadBytes as fbUploadBytes,
  getDownloadURL as fbGetDownloadURL,
} from 'firebase/storage';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';
import { mockStore } from '@/lib/mockStore';

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';

/**
 * Determine if running in local offline mock mode.
 * Activates when API key is missing or set to placeholder/demo values in AI Studio.
 */
export const isMockMode =
  !rawApiKey ||
  rawApiKey === '' ||
  rawApiKey.includes('placeholder') ||
  rawApiKey.includes('your_firebase_api_key_here');

const firebaseConfig = {
  apiKey: rawApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Initialize base Firebase App
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Strict recursive cleaner to eliminate undefined and NaN values before writing to Firestore.
 */
export function deepCleanUndefined<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (typeof value === 'number' && Number.isNaN(value)) return 0 as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => deepCleanUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    // Preserve Firestore FieldValues (e.g. serverTimestamp) and non-plain class instances
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      return value;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      cleaned[k] = v === undefined ? null : deepCleanUndefined(v);
    }
    return cleaned as T;
  }
  return value;
}

let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    ignoreUndefinedProperties: true,
  });
} catch {
  db = getFirestore(app);
}

const auth: Auth = getAuth(app);

// Force in-memory persistence so admin session never persists across tab closes or reloads
if (typeof window !== 'undefined') {
  setPersistence(auth, inMemoryPersistence).catch((err) => {
    console.warn('Auth in-memory persistence notice:', err);
  });
}

const storage: FirebaseStorage = getStorage(app);

let messaging: Messaging | null = null;
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
  try {
    messaging = getMessaging(app);
  } catch {
    // Non-fatal fallback for push-restricted contexts
  }
}

export async function getMessagingInstance(): Promise<Messaging | null> {
  try {
    const supported = await isSupported();
    if (supported) {
      if (!messaging) {
        messaging = getMessaging(app);
      }
      return messaging;
    }
    return null;
  } catch {
    return null;
  }
}

// In-memory media cache for mock storage uploads
const mockMediaStorage = new Map<string, string>();

// ─────────────────────────────────────────────────────────────
// UNIFIED SEAMLESS FIRESTORE ROUTER (REAL vs MOCK)
// ─────────────────────────────────────────────────────────────

export interface MockRef {
  _isMock: boolean;
  type: 'collection' | 'doc' | 'query';
  path: string;
  collectionName: string;
  id?: string;
  filters?: { field: string; op: string; value: any }[];
}

export function collection(firestoreOrRef: any, path: string): any {
  if (isMockMode) {
    return {
      _isMock: true,
      type: 'collection',
      path,
      collectionName: path,
    } as MockRef;
  }
  return fbCollection(firestoreOrRef, path);
}

export function doc(firestoreOrRef: any, ...pathSegments: string[]): any {
  if (isMockMode) {
    let collectionName = '';
    let id = '';

    if (firestoreOrRef?._isMock && firestoreOrRef.type === 'collection') {
      collectionName = firestoreOrRef.collectionName;
      id = pathSegments[0] || '';
    } else {
      collectionName = pathSegments[0] || '';
      id = pathSegments[1] || '';
    }

    return {
      _isMock: true,
      type: 'doc',
      collectionName,
      id,
      path: `${collectionName}/${id}`,
    } as MockRef;
  }
  return (fbDoc as any)(firestoreOrRef, ...pathSegments);
}

export function where(field: string, op: string, value: any): any {
  if (isMockMode) {
    return { field, op, value };
  }
  return fbWhere(field, op as any, value);
}

export function query(colRef: any, ...queryConstraints: any[]): any {
  if (isMockMode) {
    const filters = queryConstraints.filter((c) => c && typeof c === 'object' && 'field' in c);
    return {
      _isMock: true,
      type: 'query',
      collectionName: colRef.collectionName,
      path: colRef.path,
      filters,
    } as MockRef;
  }
  return (fbQuery as any)(colRef, ...queryConstraints);
}

export async function getDocs(queryOrColRef: any): Promise<any> {
  if (isMockMode) {
    const colName = queryOrColRef.collectionName;
    let items = mockStore.getCollection(colName);

    if (queryOrColRef.filters && Array.isArray(queryOrColRef.filters)) {
      items = items.filter((item: any) => {
        return queryOrColRef.filters.every((f: any) => {
          if (f.op === '==' || f.op === '===') {
            return String(item[f.field] || '').trim() === String(f.value || '').trim();
          }
          return true;
        });
      });
    }

    const docs = items.map((data: any) => ({
      id: data.id,
      exists: () => true,
      data: () => data,
    }));

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (callback: (doc: any) => void) => docs.forEach(callback),
      metadata: { fromCache: true, hasPendingWrites: false },
    };
  }
  return fbGetDocs(queryOrColRef);
}

export async function addDoc(colRef: any, data: any): Promise<any> {
  const cleanedData = deepCleanUndefined(data);
  if (isMockMode) {
    const colName = colRef.collectionName;
    const inserted = mockStore.insertDocument(colName, cleanedData);
    return {
      id: inserted.id,
      path: `${colName}/${inserted.id}`,
    };
  }
  return fbAddDoc(colRef, cleanedData);
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  const cleanedData = deepCleanUndefined(data);
  if (isMockMode) {
    const colName = docRef.collectionName;
    const docId = docRef.id || `${colName}_${Date.now()}`;
    mockStore.upsertDocument(colName, docId, cleanedData);
    return;
  }
  return fbSetDoc(docRef, cleanedData, options);
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  const cleanedData = deepCleanUndefined(data);
  if (isMockMode) {
    const colName = docRef.collectionName;
    const docId = docRef.id;
    mockStore.upsertDocument(colName, docId, cleanedData);
    return;
  }
  return fbUpdateDoc(docRef, cleanedData);
}

export async function deleteDoc(docRef: any): Promise<void> {
  if (isMockMode) {
    const colName = docRef.collectionName;
    const docId = docRef.id;
    mockStore.deleteDocument(colName, docId);
    return;
  }
  return fbDeleteDoc(docRef);
}

export function onSnapshot(
  target: any,
  optionsOrCallback: any,
  maybeCallbackOrError?: any,
  maybeError?: any
): () => void {
  let callback: (snapshot: any) => void;
  let errorCallback: ((error: any) => void) | undefined;

  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
    errorCallback = maybeCallbackOrError;
  } else {
    callback = maybeCallbackOrError;
    errorCallback = maybeError;
  }

  if (isMockMode) {
    const colName = target.collectionName;
    try {
      return mockStore.subscribe(colName, (allItems) => {
        let filtered = allItems;
        if (target.filters && Array.isArray(target.filters)) {
          filtered = allItems.filter((item: any) => {
            return target.filters.every((f: any) => {
              if (f.op === '==' || f.op === '===') {
                return String(item[f.field] || '').trim() === String(f.value || '').trim();
              }
              return true;
            });
          });
        }

        const docs = filtered.map((data: any) => ({
          id: data.id,
          exists: () => true,
          data: () => data,
        }));

        const snapshot = {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (cb: (doc: any) => void) => docs.forEach(cb),
          metadata: { fromCache: true, hasPendingWrites: false },
        };

        if (callback) {
          callback(snapshot);
        }
      });
    } catch (err) {
      if (errorCallback) {
        errorCallback(err);
      }
      return () => {};
    }
  }

  return (fbOnSnapshot as any)(target, optionsOrCallback, maybeCallbackOrError, maybeError);
}

export function serverTimestamp(): any {
  if (isMockMode) {
    return new Date().toISOString();
  }
  return fbServerTimestamp();
}

// ─────────────────────────────────────────────────────────────
// UNIFIED SEAMLESS STORAGE ROUTER (REAL vs MOCK)
// ─────────────────────────────────────────────────────────────

export function ref(storageInstance: any, path: string): any {
  if (isMockMode) {
    return { _isMockStorageRef: true, path };
  }
  return fbRef(storageInstance, path);
}

export async function uploadBytes(storageRef: any, data: Blob | Uint8Array | ArrayBuffer): Promise<any> {
  if (isMockMode) {
    let dataUrl = '';
    if (data instanceof Blob) {
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(data);
      });
    } else {
      dataUrl = 'data:image/jpeg;base64,mockImagePreviewData';
    }

    mockMediaStorage.set(storageRef.path, dataUrl);
    return {
      ref: storageRef,
      metadata: { size: (data as any).size || 1024 },
    };
  }
  return fbUploadBytes(storageRef, data);
}

export async function getDownloadURL(storageRef: any): Promise<string> {
  if (isMockMode) {
    return (
      mockMediaStorage.get(storageRef.path) ||
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80'
    );
  }
  return fbGetDownloadURL(storageRef);
}

// ─────────────────────────────────────────────────────────────
// UNIFIED SEAMLESS AUTH ROUTER (REAL vs MOCK)
// ─────────────────────────────────────────────────────────────

export async function signInWithEmailAndPassword(
  authInstance: any,
  email: string,
  pass: string
): Promise<any> {
  if (isMockMode) {
    const cleanEmail = email.trim().toLowerCase();
    const mockUser = {
      uid: `admin_mock_${Date.now()}`,
      email: cleanEmail,
      displayName: cleanEmail.includes('mika') ? 'Mika (Admin)' : 'Xan (Admin)',
    };
    mockStore.setStoredUser(mockUser);
    return { user: mockUser };
  }
  return fbSignIn(authInstance, email, pass);
}

export async function signOut(authInstance: any): Promise<void> {
  if (isMockMode) {
    mockStore.setStoredUser(null);
    return;
  }
  return fbSignOut(authInstance);
}

export async function sendPasswordResetEmail(authInstance: any, email: string): Promise<void> {
  if (isMockMode) {
    console.log(`[MockAuth] sendPasswordResetEmail simulated for ${email}`);
    return;
  }
  return fbSendPasswordResetEmail(authInstance, email);
}

export function onAuthStateChanged(
  authInstance: any,
  callback: (user: any | null) => void
): () => void {
  if (isMockMode) {
    const emit = () => callback(mockStore.getStoredUser());
    emit();

    const handleAuthChange = () => emit();
    window.addEventListener('mikaxan_auth_changed', handleAuthChange);
    return () => window.removeEventListener('mikaxan_auth_changed', handleAuthChange);
  }
  return fbOnAuthStateChanged(authInstance, callback);
}

export {
  app,
  auth,
  db,
  storage,
  messaging,
  setPersistence,
  inMemoryPersistence,
  browserSessionPersistence,
};
