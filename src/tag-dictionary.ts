/**
 * Danbooruタグ辞書管理
 * タグデータの取得、キャッシング、検索機能を提供
 */

export interface TagInfo {
    name: string; // タグ名（英語）
    aliases: string[]; // 日本語訳や別名
}

const STORAGE_KEY = 'danbooru-tags-jp';
const CACHE_EXPIRY_KEY = 'danbooru-tags-jp_cache-expiry';
const CACHE_TTL = 1 * 24 * 60 * 60 * 1000; // 1日間

/**
 * タグ辞書クラス
 */
export class TagDictionary {
    private tags: TagInfo[] = [];
    private isLoaded = false;
    private isLoading = false;

    /**
     * タグデータを読み込む
     * GitHub のCSVを直接取得し、ローカルキャッシュに保存
     */
    async load(): Promise<void> {
        if (this.isLoaded || this.isLoading) {
            return;
        }

        this.isLoading = true;

        try {
            const csvUrl = 'https://raw.githubusercontent.com/boorutan/booru-japanese-tag/refs/heads/main/danbooru-machine-jp.csv';
            const response = await fetch(csvUrl);

            if (response.ok) {
                const csvText = await response.text();
                this.tags = this.parseCSV(csvText);
                if (this.tags.length > 0) {
                    this.saveToCache(this.tags);
                    this.isLoaded = true;
                } else {
                    // パースに失敗した場合
                    const cached = this.loadFromCache();
                    this.tags = cached || [];
                    this.isLoaded = true;
                }
            } else {
                // ネットワークエラーの場合はLocalStorageにフォールバック
                const cached = this.loadFromCache();
                this.tags = cached || [];
                this.isLoaded = true;
            }
        } catch (error) {
            // キャッシュにフォールバック
            const cached = this.loadFromCache();
            this.tags = cached || [];
            this.isLoaded = true;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * CSV文字列をパースしてTagInfo配列に変換
     * シンプルな2列フォーマット: tag_name,japanese_translation
     * 例: 1girl,一人の女の子
     */
    private parseCSV(csvText: string): TagInfo[] {
        const lines = csvText.trim().split('\n');
        const tags: TagInfo[] = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            // シンプルなカンマ分割（最初のカンマで分割）
            const commaIndex = line.indexOf(',');
            if (commaIndex === -1) continue;

            const name = line.substring(0, commaIndex).trim();
            const translation = line.substring(commaIndex + 1).trim();

            if (name && translation) {
                tags.push({
                    name,
                    aliases: [translation]
                });
            }
        }

        return tags;
    }


    /**
     * キャッシュから読み込み
     */
    private loadFromCache(): TagInfo[] | null {
        try {
            const expiryStr = localStorage.getItem(CACHE_EXPIRY_KEY);
            if (expiryStr) {
                const expiry = parseInt(expiryStr, 10);
                if (Date.now() > expiry) {
                    // キャッシュ期限切れ
                    this.clearCache();
                    return null;
                }
            }

            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                return JSON.parse(cached) as TagInfo[];
            }
        } catch (error) {
            // エラーを無視
        }
        return null;
    }

    /**
     * キャッシュに保存
     */
    private saveToCache(tags: TagInfo[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
            localStorage.setItem(CACHE_EXPIRY_KEY, String(Date.now() + CACHE_TTL));
        } catch (error) {
            // エラーを無視
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache(): void {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(CACHE_EXPIRY_KEY);
    }

    /**
     * タグを検索
     * AND検索、NOT検索をサポート
     */
    search(query: string, limit = 50): TagInfo[] {
        if (!this.isLoaded || this.tags.length === 0) {
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();

        // 空クエリの場合は最初のタグを返す
        if (!normalizedQuery) {
            return this.tags.slice(0, limit);
        }

        // クエリを分割してAND/NOT検索
        const terms = normalizedQuery.split(/[\s,]+/).filter((t) => t.length > 0);
        const includedTerms = terms.filter((t) => !t.startsWith('-'));
        const excludedTerms = terms.filter((t) => t.startsWith('-')).map((t) => t.substring(1));

        return this.tags
            .filter((tag) => {
                const searchText = `${tag.name} ${tag.aliases.join(' ')}`.toLowerCase();

                // 全てのincludedTermsに一致する必要がある
                const matchesIncluded = includedTerms.every((term) => searchText.includes(term));
                if (!matchesIncluded) {
                    return false;
                }

                // excludedTermsのいずれかに一致する場合は除外
                const matchesExcluded = excludedTerms.some((term) => searchText.includes(term));
                if (matchesExcluded) {
                    return false;
                }

                return true;
            })
            .slice(0, limit);
    }

    /**
     * 最初のタグを取得
     */
    getFirstTags(limit = 50): TagInfo[] {
        if (!this.isLoaded) {
            return [];
        }

        return this.tags.slice(0, limit);
    }

    /**git commitして
     * 特定のタグ情報を取得
     */
    getTag(tagName: string): TagInfo | undefined {
        return this.tags.find((t) => t.name === tagName);
    }

    /**
     * ロード済みかどうか
     */
    isReady(): boolean {
        return this.isLoaded;
    }
}

// グローバルインスタンス
export const tagDictionary = new TagDictionary();
