/**
 * IndexedDB管理
 * 画像バイナリデータの永続化とTTL処理
 */

import { ImageEntry, PromptTemplate } from './types';

const DB_NAME = 'db.comfyui.localhost';
const DB_VERSION = 1; // DB_NAME変更に伴い, バージョンをリセット
const DATA_STORE_NAME = 'datas';
const TEMPLATE_STORE_NAME = 'templates';

/**
 * IndexedDBを初期化
 */
export function initIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const oldVersion = event.oldVersion;

            console.log(`[IndexedDB] Schema migration: v${oldVersion} -> v${DB_VERSION}`);

            // 古いオブジェクトストアがある場合は削除
            if (db.objectStoreNames.contains(DATA_STORE_NAME)) {
                console.log(`[IndexedDB] Removing old object store: ${DATA_STORE_NAME}`);
                db.deleteObjectStore(DATA_STORE_NAME);
            }

            // 新しいイメージストアを作成
            const imageStore = db.createObjectStore(DATA_STORE_NAME, { keyPath: 'id' });
            // インデックスを作成
            imageStore.createIndex('id', 'id', { unique: true });
            imageStore.createIndex('createdAt', 'createdAt', { unique: false });

            console.log(`[IndexedDB] New object store created: ${DATA_STORE_NAME}`);

            // テンプレートストアを作成
            if (!db.objectStoreNames.contains(TEMPLATE_STORE_NAME)) {
                const templateStore = db.createObjectStore(TEMPLATE_STORE_NAME, { keyPath: 'id' });
                templateStore.createIndex('id', 'id', { unique: true });
                templateStore.createIndex('name', 'name', { unique: false });
                templateStore.createIndex('createdAt', 'createdAt', { unique: false });
                console.log(`[IndexedDB] New object store created: ${TEMPLATE_STORE_NAME}`);
            }
        };
    });
}

/**
 * 画像を保存
 */
export async function saveImageToIndexedDB(entry: ImageEntry): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const request = objectStore.put({ ...entry });

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to save image to IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * promptIdで画像を取得
 */
export async function getImageFromIndexedDB(id: string): Promise<ImageEntry | null> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const request = objectStore.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(new Error('Failed to get image from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * idで画像を取得
 */
export async function getImageById(id: string): Promise<ImageEntry | null> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const index = objectStore.index('id');
        const request = index.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(new Error('Failed to get image by prompt_id from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * 画像を削除
 */
export async function deleteImageFromIndexedDB(id: string): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to delete image from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * すべての画像を取得
 */
export async function getAllImagesFromIndexedDB(): Promise<ImageEntry[]> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(new Error('Failed to get all images from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * TTL超過エントリを削除
 * @param ttlSeconds TTL（秒）
 */
export async function cleanupExpiredImages(ttlSeconds: number): Promise<number> {
    const db = await initIndexedDB();
    const now = Math.floor(Date.now() / 1000);
    const cutoffTime = now - ttlSeconds;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const index = objectStore.index('createdAt');
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        let deletedCount = 0;

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                cursor.delete();
                deletedCount++;
                cursor.continue();
            }
        };

        request.onerror = () => {
            reject(new Error('Failed to cleanup expired images'));
        };

        transaction.oncomplete = () => {
            db.close();
            resolve(deletedCount);
        };
    });
}

/**
 * すべての画像を削除
 */
export async function clearAllImagesFromIndexedDB(): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([DATA_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(DATA_STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to clear all images from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * IndexedDB全体をリセット（スキーマ問題時の復旧用）
 */
export async function resetIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);

        request.onsuccess = () => {
            console.log(`[IndexedDB] Database reset: ${DB_NAME}`);
            resolve();
        };

        request.onerror = () => {
            reject(new Error(`Failed to reset IndexedDB: ${DB_NAME}`));
        };

        request.onblocked = () => {
            console.warn(`[IndexedDB] Reset blocked - database still in use`);
        };
    });
}

/**
 * テンプレートを保存
 */
export async function saveTemplateToIndexedDB(template: PromptTemplate): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TEMPLATE_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(TEMPLATE_STORE_NAME);
        const request = objectStore.put(template);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to save template to IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * テンプレートを取得（ID指定）
 */
export async function getTemplateFromIndexedDB(id: string): Promise<PromptTemplate | null> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TEMPLATE_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(TEMPLATE_STORE_NAME);
        const request = objectStore.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(new Error('Failed to get template from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * すべてのテンプレートを取得
 */
export async function getAllTemplatesFromIndexedDB(): Promise<PromptTemplate[]> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TEMPLATE_STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(TEMPLATE_STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(new Error('Failed to get all templates from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * テンプレートを削除
 */
export async function deleteTemplateFromIndexedDB(id: string): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TEMPLATE_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(TEMPLATE_STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to delete template from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}

/**
 * すべてのテンプレートを削除
 */
export async function clearAllTemplatesFromIndexedDB(): Promise<void> {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TEMPLATE_STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(TEMPLATE_STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error('Failed to clear all templates from IndexedDB'));
        };

        transaction.oncomplete = () => {
            db.close();
        };
    });
}
