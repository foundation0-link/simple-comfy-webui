/**
 * プロンプト操作ユーティリティ
 */

/**
 * プロンプトコンテンツをマージ（カンマ区切りの重複排除）
 * @param existing 既存のプロンプト文字列
 * @param newContent 追加する新しいプロンプト文字列
 * @returns マージされたプロンプト文字列
 */
export function mergePromptContent(existing: string, newContent: string): string {
    if (!newContent || !newContent.trim()) {
        return existing;
    }

    // 既存のコンテンツを正規化してセットを作成
    const existingSet = new Set(
        existing
            .split(',')
            .map(word => word.trim())
            .filter(word => word.length > 0)
    );

    // 新しいコンテンツからユニークなワードを抽出
    const newWords = newContent
        .split(',')
        .map(word => word.trim())
        .filter(word => word.length > 0 && !existingSet.has(word));

    // 既存のコンテンツが空でない場合は、新しいワードを追加
    if (existing.trim().length > 0 && newWords.length > 0) {
        return `${existing}, ${newWords.join(', ')}`;
    } else if (newWords.length > 0) {
        return newWords.join(', ');
    }

    return existing;
}

/**
 * プロンプト文字列からタグ配列を抽出
 * @param prompt プロンプト文字列
 * @returns タグ配列
 */
export function extractTags(prompt: string): string[] {
    return prompt
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
}

/**
 * タグ配列をプロンプト文字列に変換
 * @param tags タグ配列
 * @returns プロンプト文字列
 */
export function tagsToPrompt(tags: string[]): string {
    return tags
        .filter(tag => tag.trim().length > 0)
        .join(', ');
}

/**
 * 重複タグを除去
 * @param tags タグ配列
 * @returns 重複除去されたタグ配列
 */
export function deduplicateTags(tags: string[]): string[] {
    const seen = new Set<string>();
    return tags.filter(tag => {
        const normalized = tag.trim().toLowerCase();
        if (seen.has(normalized)) {
            return false;
        }
        seen.add(normalized);
        return true;
    });
}
