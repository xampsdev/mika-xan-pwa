/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SEED_TUTORS, SEED_PETS, SEED_STAYS } from '@/lib/mockData';
import type { Tutor, Pet, Stay } from '@/types/schema';

const STORAGE_KEYS = {
  tutors: 'mikaxan_tutors_v1',
  pets: 'mikaxan_pets_v1',
  stays: 'mikaxan_stays_v1',
  admin_tokens: 'mikaxan_admin_tokens_v1',
  auth_user: 'mikaxan_auth_user_v1',
};

// Event dispatched on any local database write for instant reactivity
const EVENT_NAME = 'mikaxan_db_mutation';

export class LocalMockStore {
  private static instance: LocalMockStore;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): LocalMockStore {
    if (!LocalMockStore.instance) {
      LocalMockStore.instance = new LocalMockStore();
    }
    return LocalMockStore.instance;
  }

  private ensureInitialized(): void {
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.tutors)) {
      localStorage.setItem(STORAGE_KEYS.tutors, JSON.stringify(SEED_TUTORS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.pets)) {
      localStorage.setItem(STORAGE_KEYS.pets, JSON.stringify(SEED_PETS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.stays)) {
      localStorage.setItem(STORAGE_KEYS.stays, JSON.stringify(SEED_STAYS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.admin_tokens)) {
      localStorage.setItem(STORAGE_KEYS.admin_tokens, JSON.stringify([]));
    }
  }

  public getCollection<T = any>(collectionName: string): T[] {
    if (typeof window === 'undefined') return [];
    this.ensureInitialized();
    const key = (STORAGE_KEYS as any)[collectionName];
    if (!key) return [];
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public saveCollection<T = any>(collectionName: string, items: T[]): void {
    if (typeof window === 'undefined') return;
    const key = (STORAGE_KEYS as any)[collectionName];
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { collection: collectionName } })
    );
  }

  public insertDocument<T extends { id?: string }>(
    collectionName: string,
    docData: Omit<T, 'id'> & { id?: string }
  ): T {
    const items = this.getCollection<T>(collectionName);
    const newId = docData.id || `${collectionName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newDoc = { ...docData, id: newId } as T;
    items.unshift(newDoc);
    this.saveCollection(collectionName, items);
    return newDoc;
  }

  public upsertDocument<T extends { id: string }>(
    collectionName: string,
    id: string,
    docData: Partial<T>
  ): T {
    const items = this.getCollection<T>(collectionName);
    const index = items.findIndex((item) => (item as any).id === id);

    let updatedDoc: T;
    if (index >= 0) {
      updatedDoc = { ...items[index], ...docData, id } as T;
      items[index] = updatedDoc;
    } else {
      updatedDoc = { ...docData, id } as T;
      items.unshift(updatedDoc);
    }

    this.saveCollection(collectionName, items);
    return updatedDoc;
  }

  public subscribe(
    collectionName: string,
    callback: (items: any[]) => void
  ): () => void {
    const emit = () => {
      callback(this.getCollection(collectionName));
    };

    // Emit initial snapshot synchronously
    emit();

    const handleMutation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail || customEvent.detail.collection === collectionName) {
        emit();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      const key = (STORAGE_KEYS as any)[collectionName];
      if (e.key === key) {
        emit();
      }
    };

    window.addEventListener(EVENT_NAME, handleMutation);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(EVENT_NAME, handleMutation);
      window.removeEventListener('storage', handleStorage);
    };
  }

  // Auth Simulation
  public getStoredUser(): any | null {
    if (typeof window === 'undefined') return null;
    try {
      const u = localStorage.getItem(STORAGE_KEYS.auth_user);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }

  public setStoredUser(user: any | null): void {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(STORAGE_KEYS.auth_user, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.auth_user);
    }
    window.dispatchEvent(new CustomEvent('mikaxan_auth_changed'));
  }
}

export const mockStore = LocalMockStore.getInstance();
