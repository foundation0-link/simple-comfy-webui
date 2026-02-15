/**
 * プロンプト入力支援機能
 * タグ検索・選択UIを提供
 */

import { tagDictionary, TagInfo } from '../tag-dictionary';

/**
 * ネガティブプロンプトプリセット
 */
export const NegativePromptPresets = {
    none: {
        label: 'なし',
        value: '',
    },
    basic: {
        label: '基本',
        value: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
    },
    highQuality: {
        label: '高品質重視',
        value: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, bad feet, bad proportions, mutation, deformed, malformed limbs, extra limbs, missing limb, floating limbs, disconnected limbs',
    },
} as const;

export type NegativePresetKey = keyof typeof NegativePromptPresets;

/**
 * 選択中のタグを管理するクラス
 */
export class SelectedTags {
    private tags: Set<string> = new Set();
    private listeners: Set<() => void> = new Set();

    /**
     * タグを追加
     */
    add(tagName: string): void {
        this.tags.add(tagName);
        this.notifyListeners();
    }

    /**
     * タグを削除
     */
    remove(tagName: string): void {
        this.tags.delete(tagName);
        this.notifyListeners();
    }

    /**
     * タグをトグル
     */
    toggle(tagName: string): void {
        if (this.tags.has(tagName)) {
            this.remove(tagName);
        } else {
            this.add(tagName);
        }
    }

    /**
     * 全てクリア
     */
    clear(): void {
        this.tags.clear();
        this.notifyListeners();
    }

    /**
     * タグのリストを取得
     */
    getTags(): string[] {
        return Array.from(this.tags);
    }

    /**
     * プロンプト文字列を取得
     */
    toPromptString(): string {
        return this.getTags().join(', ');
    }

    /**
     * 選択されているかチェック
     */
    has(tagName: string): boolean {
        return this.tags.has(tagName);
    }

    /**
     * 変更リスナーを登録
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * リスナーに通知
     */
    private notifyListeners(): void {
        this.listeners.forEach((listener) => listener());
    }
}

/**
 * タグ検索ウィジェットのHTML生成
 */
export function renderTagSearchWidget(
    containerId: string,
    selectedTags: SelectedTags,
    onTagSelect: (tag: string) => void
): void {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="tag-search-widget">
            <div class="tag-search-header">
                <input
                    type="text"
                    id="${containerId}-search"
                    class="tag-search-input"
                    placeholder="タグを検索（英語または日本語、スペース/カンマでAND検索、-で除外）"
                />
                <button
                    id="${containerId}-clear"
                    class="tag-clear-btn"
                    type="button"
                >
                    クリア
                </button>
            </div>
            <div id="${containerId}-selected" class="selected-tags"></div>
            <div class="tag-search-help">
                💡 例: "smile" / "long hair" (AND検索) / "-nsfw" (除外)
            </div>
            <div id="${containerId}-results" class="tag-search-results"></div>
        </div>
    `;

    // 検索入力イベント
    const searchInput = document.getElementById(`${containerId}-search`) as HTMLInputElement;
    let searchTimeout: number;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => {
            updateSearchResults(containerId, searchInput.value, selectedTags);
        }, 300); // デバウンス
    });

    // Enterキーでフォーム送信を防ぐ
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });

    // クリアボタン
    const clearBtn = document.getElementById(`${containerId}-clear`);
    clearBtn?.addEventListener('click', () => {
        // 選択タグをクリア
        selectedTags.clear();
        // 検索入力をクリア
        const searchInput = document.getElementById(`${containerId}-search`) as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }
        // 検索結果を再表示（タグの選択状態を反映）
        updateSearchResults(containerId, '', selectedTags);
        // コールバックを呼んでプロンプトを更新
        onTagSelect('');
    });

    // イベント委譲：タグボタンクリックを処理
    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('.tag-btn');
        if (btn instanceof HTMLButtonElement) {
            const tagName = btn.getAttribute('data-tag');
            if (tagName) {
                // containerId から textareaId を導出
                // 'positive-tags-widget' -> 'positive-prompt'
                // 'negative-tags-widget' -> 'negative-prompt'
                const textareaId = containerId.replace('-tags-widget', '-prompt');
                const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;

                if (textarea) {
                    // 現在のテキストを取得
                    const currentText = textarea.value.trim();
                    const currentTags = currentText
                        .split(',')
                        .map(t => t.trim())
                        .filter(t => t);

                    // 重複を避けながら追加
                    if (!currentTags.includes(tagName)) {
                        currentTags.push(tagName);
                        textarea.value = currentTags.join(', ');

                        // input イベントを発火させて翻訳パネルを更新
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }

                // コールバック実行
                onTagSelect(tagName);
            }
        }
    });

    // 初期表示は空
    updateSelectedTags(containerId);

    // 選択変更リスナー
    selectedTags.subscribe(() => {
        updateSelectedTags(containerId);
    });
}

/**
 * 検索結果を更新
 */
function updateSearchResults(
    containerId: string,
    query: string,
    selectedTags?: SelectedTags
): void {
    const resultsContainer = document.getElementById(`${containerId}-results`);
    if (!resultsContainer) {
        return;
    }

    const results = tagDictionary.search(query, 50);

    if (results.length === 0) {
        resultsContainer.innerHTML = '<p class="no-results">タグが見つかりませんでした</p>';
        return;
    }

    resultsContainer.innerHTML = `
        <h4>検索結果</h4>
        <div class="tag-grid">
            ${results
            .map((tag) => {
                const isSelected = selectedTags ? selectedTags.has(tag.name) : false;
                return renderTagButton(tag, isSelected, () => { });
            })
            .join('')}
        </div>
    `;
}

function updateSelectedTags(
    containerId: string
): void {
    const selectedContainer = document.getElementById(`${containerId}-selected`);
    if (!selectedContainer) {
        return;
    }

    // 選択中のタグセクションは非表示
    selectedContainer.innerHTML = '';
}

/**
 * タグボタンのHTML生成
 */
function renderTagButton(tag: TagInfo, isSelected: boolean, _onTagSelect: (tag: string) => void): string {
    const selectedClass = isSelected ? 'selected' : '';

    return `
        <button
            id="tag-btn-${tag.name}"
            class="tag-btn ${selectedClass}"
            type="button"
            title="${tag.name}"
            data-tag="${tag.name}"
        >
            <span class="tag-name">${tag.name}</span>
        </button>
    `;
}

/**
 * ネガティブプロンプトプリセット選択UIのHTML生成
 */
export function renderNegativePromptPresets(
    selectId: string,
    onChange: (preset: string) => void
): void {
    const container = document.getElementById(selectId);
    if (!container) {
        return;
    }

    container.innerHTML = `
        <select id="${selectId}-select" class="negative-preset-select">
            <option value="none">${NegativePromptPresets.none.label}</option>
            <option value="basic" selected>${NegativePromptPresets.basic.label}</option>
            <option value="highQuality">${NegativePromptPresets.highQuality.label}</option>
        </select>
    `;

    const select = document.getElementById(`${selectId}-select`) as HTMLSelectElement;
    select?.addEventListener('change', () => {
        const presetKey = select.value as NegativePresetKey;
        const preset = NegativePromptPresets[presetKey];
        onChange(preset?.value || '');
    });
}
