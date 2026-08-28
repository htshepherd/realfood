const DATABASE_NAME = "ihealth-private-v1";
const STORE_NAME = "private-data";
let privacyEpoch = 0;

export function captureOfflineEpoch() {
  return privacyEpoch;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function discardOpenedDatabase(database: IDBDatabase) {
  database.close();
  await deleteDatabase();
}

export async function readOffline<T>(key: string, expectedEpoch = privacyEpoch): Promise<T | null> {
  if (typeof indexedDB === "undefined" || expectedEpoch !== privacyEpoch) return null;
  const database = await openDatabase();
  if (expectedEpoch !== privacyEpoch) {
    await discardOpenedDatabase(database);
    return null;
  }
  let value: T | null = null;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => { value = (request.result as T | undefined) ?? null; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return expectedEpoch === privacyEpoch ? value : null;
}

export async function writeOffline(key: string, value: unknown, expectedEpoch = privacyEpoch) {
  if (typeof indexedDB === "undefined" || expectedEpoch !== privacyEpoch) return false;
  const database = await openDatabase();
  if (expectedEpoch !== privacyEpoch) {
    await discardOpenedDatabase(database);
    return false;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  if (expectedEpoch !== privacyEpoch) {
    await deleteDatabase();
    return false;
  }
  return true;
}

export async function deleteOffline(key: string, expectedEpoch = privacyEpoch) {
  if (typeof indexedDB === "undefined" || expectedEpoch !== privacyEpoch) return false;
  const database = await openDatabase();
  if (expectedEpoch !== privacyEpoch) {
    await discardOpenedDatabase(database);
    return false;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  if (expectedEpoch !== privacyEpoch) {
    await deleteDatabase();
    return false;
  }
  return true;
}

export async function clearOfflineData() {
  privacyEpoch += 1;
  if (typeof navigator !== "undefined") navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_DATA" });
  await deleteDatabase();
  if (typeof caches !== "undefined") {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}

async function deleteDatabase() {
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
