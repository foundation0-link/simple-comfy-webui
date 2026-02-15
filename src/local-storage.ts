/**
 * LocalStorage管理
 * 履歴データの永続化とTTL処理
 * UI設定の永続化
 * テンプレートメタデータの永続化
 */

import { HistoryEntry, UIPreferences } from './types';
import { getCurrentTimestamp } from './utils';
import { deleteImageFromIndexedDB } from './indexed-db-storage';

const HISTORY_KEY = 'history';
const UI_PREFERENCES_KEY = 'ui_preferences';

// ========================================
// 履歴管理
// ========================================

/**
 * LocalStorageから履歴を読み込む
 * TTL超過エントリは自動削除
 */
export function loadHistory(ttl: number = Number.POSITIVE_INFINITY): HistoryEntry[] {
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (!stored) {
            return [];
        }

        const entries: HistoryEntry[] = JSON.parse(stored);
        const now = getCurrentTimestamp();

        // TTL処理: 古いエントリとcreated_atがないエントリを除外
        const validEntries = entries.filter((entry) => {
            if (!entry.createdAt) {
                return false; // created_atがないエントリは除外
            }
            return now - entry.createdAt <= ttl;
        });

        // フィルタリング結果が元と異なる場合は保存
        if (validEntries.length !== entries.length) {
            saveHistory(validEntries);
        }

        return validEntries;
    } catch (error) {
        console.error('Failed to load history:', error);
        return [];
    }
}

/**
 * LocalStorageに履歴メタデータを保存
 * （プロンプト/ネガティブプロンプトはIndexedDBに保存）
 * QuotaExceededError時は古い履歴から削除してリトライ
 */
export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch (error) {
        // QuotaExceededError の場合、古い履歴を削除してリトライ
        if (error instanceof Error && error.name === 'QuotaExceededError') {
            console.warn('LocalStorage quota exceeded, removing oldest entry');

            if (entries.length > 0) {
                // 最も古いエントリ（配列の最後）を特定
                const oldestEntry = entries[entries.length - 1];

                // IndexedDB から対応する画像を削除
                try {
                    await deleteImageFromIndexedDB(oldestEntry.id);
                } catch (dbError) {
                    console.error('Failed to delete image from IndexedDB:', dbError);
                }

                // 古いエントリを除外して再保存
                const newEntries = entries.slice(0, -1);
                await saveHistory(newEntries);
            } else {
                // エントリがない場合はエラーをスロー
                throw new Error('Failed to save history: Storage quota exceeded');
            }
        } else {
            console.error('Failed to save history:', error);
            throw error;
        }
    }
}

/**
 * 履歴に新しいメタデータエントリを追加
 * @param id IndexedDB の Primary Key
 */
export async function addHistoryEntry(id: string): Promise<void> {
    const entries = loadHistory();
    const createdAt = getCurrentTimestamp();

    const entry: HistoryEntry = {
        id,
        createdAt,
        isFavorite: false, // デフォルトではお気に入りでない
    };

    // 同じidの重複を防ぐ
    const existingIndex = entries.findIndex(e => e.id === id);
    if (existingIndex !== -1) {
        // 既に存在する場合は更新（isFavoriteは保持）
        const existing = entries[existingIndex];
        entries[existingIndex] = {
            ...entry,
            isFavorite: existing.isFavorite ?? false,
        };
    } else {
        // 新しいものを先頭に追加
        entries.unshift(entry);
    }

    await saveHistory(entries);
}

/**
 * 履歴をクリア（LocalStorageとIndexedDBの両方）
 * isFavoriteが false のみを削除（true のものは保持）
 */
export async function clearHistory(): Promise<void> {
    try {
        const entries = loadHistory();
        // isFavorite が true でないエントリのみを削除対象
        const entriesToDelete = entries.filter(entry => !entry.isFavorite);
        const favoriteEntries = entries.filter(entry => entry.isFavorite);

        // Favoriteでないエントリに対応する画像を削除
        for (const entry of entriesToDelete) {
            try {
                await deleteImageFromIndexedDB(entry.id);
            } catch (error) {
                console.error(`Failed to delete image for id ${entry.id}:`, error);
            }
        }

        // Favoriteエントリのみをローカルストレージに保存
        if (favoriteEntries.length > 0) {
            await saveHistory(favoriteEntries);
        } else {
            localStorage.removeItem(HISTORY_KEY);
        }
    } catch (error) {
        console.error('Failed to clear history:', error);
        // エラーが発生しても続行
    }
}

/**
 * 履歴エントリを削除
 */
export function removeHistoryEntry(id: string): void {
    const entries = loadHistory();
    const filtered = entries.filter((entry) => entry.id !== id);
    saveHistory(filtered);
}

/**
 * 履歴エントリのお気に入り状態を切り替え
 */
export function toggleFavoriteHistoryEntry(id: string): void {
    const entries = loadHistory();
    const entry = entries.find(e => e.id === id);
    if (entry) {
        entry.isFavorite = !entry.isFavorite;
        saveHistory(entries);
    }
}

// ========================================
// UI設定の永続化
// ========================================

/**
 * UI設定のデフォルト値
 */
const DEFAULT_UI_PREFERENCES: UIPreferences = {
    positivePromptHeight: 120, // デフォルト約5行分（rows="5"相当）
    negativePromptHeight: 100, // デフォルト約4行分
};

/**
 * UI設定をLocalStorageから読み込む
 */
export function loadUIPreferences(): UIPreferences {
    try {
        const stored = localStorage.getItem(UI_PREFERENCES_KEY);
        if (!stored) {
            return { ...DEFAULT_UI_PREFERENCES };
        }

        const preferences = JSON.parse(stored) as UIPreferences;

        // バリデーション：不正な値は除外して、デフォルト値で補完
        return {
            positivePromptHeight: typeof preferences.positivePromptHeight === 'number' && preferences.positivePromptHeight > 0
                ? preferences.positivePromptHeight
                : DEFAULT_UI_PREFERENCES.positivePromptHeight,
            negativePromptHeight: typeof preferences.negativePromptHeight === 'number' && preferences.negativePromptHeight > 0
                ? preferences.negativePromptHeight
                : DEFAULT_UI_PREFERENCES.negativePromptHeight,
        };
    } catch (error) {
        console.warn('Failed to load UI preferences:', error);
        return { ...DEFAULT_UI_PREFERENCES };
    }
}

/**
 * UI設定をLocalStorageに保存
 */
export function saveUIPreferences(preferences: UIPreferences): void {
    try {
        // バリデーション：最小値と最大値を制限
        const validated: UIPreferences = {
            positivePromptHeight: Math.max(80, Math.min(800, preferences.positivePromptHeight)),
            negativePromptHeight: Math.max(80, Math.min(800, preferences.negativePromptHeight)),
        };

        localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(validated));
        console.debug('UI preferences saved:', validated);
    } catch (error) {
        console.error('Failed to save UI preferences:', error);
    }
}

// UI設定更新用のデバウンスタイマー
const uiPreferencesTimers = new Map<string, number>();

/**
 * 特定のテキストエリアの高さを更新（デバウンス付き）
 * 連続した更新呼び出しをまとめてLocalStorageへの書き込みを削減
 */
export function updateTextareaHeight(textareaId: 'positive-prompt' | 'negative-prompt', height: number): void {
    const MIN_HEIGHT = 80;
    const MAX_HEIGHT = 800;

    // バリデーション
    const validatedHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));

    // 既存のタイマーをキャンセル
    const existingTimer = uiPreferencesTimers.get(textareaId);
    if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
    }

    // 新しいタイマーを設定（500msのデバウンス）
    const timerId = window.setTimeout(() => {
        try {
            const preferences = loadUIPreferences();

            if (textareaId === 'positive-prompt') {
                preferences.positivePromptHeight = validatedHeight;
            } else if (textareaId === 'negative-prompt') {
                preferences.negativePromptHeight = validatedHeight;
            }

            saveUIPreferences(preferences);
            console.debug(`UI preference updated: ${textareaId} height = ${validatedHeight}px`);
        } catch (error) {
            console.error(`Failed to update UI preference for ${textareaId}:`, error);
        }

        // タイマーを削除
        uiPreferencesTimers.delete(textareaId);
    }, 500);

    uiPreferencesTimers.set(textareaId, timerId);
}
