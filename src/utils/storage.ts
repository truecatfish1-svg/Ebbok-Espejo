/**
 * Storage Layer con IndexedDB de alta capacidad para SAPE Editorial.
 * Permite almacenar libros completos (cientos de páginas, imágenes y chunks)
 * superando holgadamente el límite de 5MB de localStorage.
 */

const DB_NAME = 'sape_editorial_db_v4';
const DB_VERSION = 1;
const STORE_NAME = 'keyval_store';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB no está soportado en este entorno.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.warn('Error al abrir IndexedDB, usando fallback:', request.error);
          reject(request.error);
        };

        request.onblocked = () => {
          console.warn('IndexedDB bloqueado por otra pestaña.');
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  return dbPromise;
}

// Memoria volátil de respaldo si IndexedDB falla o está deshabilitado en modo incógnito estricto
const memoryFallback = new Map<string, any>();

export const appStorage = {
  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const db = await getDB();
      return new Promise<T>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);

          req.onsuccess = () => {
            if (req.result !== undefined && req.result !== null) {
              resolve(req.result as T);
            } else {
              // Intentar recuperar de localStorage si existía antes
              if (typeof window !== 'undefined' && window.localStorage) {
                try {
                  const lsVal = window.localStorage.getItem(key);
                  if (lsVal) {
                    const parsed = JSON.parse(lsVal);
                    resolve(parsed as T);
                    return;
                  }
                } catch (_) {}
              }
              resolve(defaultValue);
            }
          };

          req.onerror = () => {
            console.warn(`Error leyendo clave ${key} de IndexedDB:`, req.error);
            resolve(memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue);
          };
        } catch (e) {
          resolve(memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue);
        }
      });
    } catch (err) {
      if (memoryFallback.has(key)) {
        return memoryFallback.get(key) as T;
      }
      return defaultValue;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    memoryFallback.set(key, value);
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(value, key);

          req.onsuccess = () => {
            resolve();
          };

          req.onerror = () => {
            console.warn(`Error guardando ${key} en IndexedDB:`, req.error);
            resolve(); // No bloquear la UI si falla la persistencia secundaria
          };
        } catch (e) {
          console.warn('Excepción en transacción IndexedDB:', e);
          resolve();
        }
      });
    } catch (err) {
      console.warn(`No se pudo persistir ${key} en IndexedDB:`, err);
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryFallback.delete(key);
    try {
      const db = await getDB();
      return new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    } catch (err) {
      // Ignorar
    }
  },

  async clear(): Promise<void> {
    memoryFallback.clear();
    try {
      const db = await getDB();
      return new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    } catch (err) {
      // Ignorar
    }
  }
};
