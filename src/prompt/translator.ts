/**
 * プロンプト翻訳・解析モジュール
 * プロンプトテキストを単語に分割し、タグ辞書から日本語訳を検索
 */

import { TagDictionary, TagInfo } from '../tag-dictionary';

export interface TranslatedToken {
    text: string;
    translations: string[]; // 日本語訳のリスト
    found: boolean; // 辞書に存在するか
}

/**
 * プロンプトテキストを解析してトークン化
 */
export class PromptTranslator {
    constructor(private tagDictionary: TagDictionary) { }

    /**
     * プロンプトテキストを翻訳済みトークンに分割
     * @param text プロンプトテキスト
     * @returns 翻訳済みトークンの配列
     */
    translatePrompt(text: string): TranslatedToken[] {
        if (!text || text.trim().length === 0) {
            return [];
        }

        // カンマ区切りで分割し、各部分をトリム
        const parts = text
            .split(',')
            .map(part => part.trim())
            .filter(part => part.length > 0);

        return parts.map(part => this.translateToken(part));
    }

    /**
     * 単一のトークンを翻訳
     * @param token 翻訳対象のテキスト
     * @returns 翻訳済みトークン
     */
    private translateToken(token: string): TranslatedToken {
        // アンダースコア、スペース、括弧などを含む複合タグに対応
        // 例: "1girl", "long_hair", "looking at viewer"

        // 括弧内のテキストは除外して検索
        const cleanedToken = token.replace(/[()]/g, '').trim();
        const lowerToken = cleanedToken.toLowerCase();

        // 辞書から検索
        const tagInfo = this.findTagInDictionary(lowerToken);

        if (tagInfo) {
            return {
                text: token,
                translations: tagInfo.aliases,
                found: true,
            };
        }

        // 複数単語の場合は各単語を検索（スペース区切り）
        if (cleanedToken.includes(' ')) {
            const words = cleanedToken.split(/\s+/);
            const multiWordTag = words.join('_');
            const multiTagInfo = this.findTagInDictionary(multiWordTag);

            if (multiTagInfo) {
                return {
                    text: token,
                    translations: multiTagInfo.aliases,
                    found: true,
                };
            }
        }

        // 見つからない場合
        return {
            text: token,
            translations: [],
            found: false,
        };
    }

    /**
     * タグ辞書からタグを検索
     * 完全一致、部分一致の順で検索
     */
    private findTagInDictionary(query: string): TagInfo | null {
        // タグ辞書がロードされていない場合は null
        const tags = (this.tagDictionary as any).tags;
        if (!tags || tags.length === 0) {
            return null;
        }

        // 完全一致
        for (const tag of tags) {
            if (tag.name.toLowerCase() === query.toLowerCase()) {
                return tag;
            }
        }

        // エイリアスでの完全一致
        for (const tag of tags) {
            if (
                tag.aliases.some(
                    (alias: string) => alias.toLowerCase() === query.toLowerCase()
                )
            ) {
                return tag;
            }
        }

        // 部分一致（末尾）
        for (const tag of tags) {
            if (tag.name.toLowerCase().endsWith(query.toLowerCase())) {
                return tag;
            }
        }

        return null;
    }

    /**
     * トークンの色をカテゴリから取得
     */
    getColorForToken(token: TranslatedToken): string {
        if (!token.found) {
            return '#999999'; // グレー - 辞書に無い単語
        }

        return '#4a90e2'; // デフォルトカラー - 青
    }
}

/**
 * プロンプト翻訳インスタンスを生成
 */
export function createPromptTranslator(tagDictionary: TagDictionary): PromptTranslator {
    return new PromptTranslator(tagDictionary);
}
