/**
 * 履歴レンダリング関連
 */

import { getImageFromIndexedDB, deleteImageFromIndexedDB } from '../indexed-db-storage';
import { removeHistoryEntry, loadHistory } from '../local-storage';
import { stateManager } from '../state-manager';
import { escapeHtml, formatTimestamp } from '../utils';
import { PromptParams, PublicConfig } from '../types';

/**
 * 単一の履歴アイテムをHTMLとしてレンダリング
 */
export async function renderHistoryItem(
    entry: ReturnType<typeof loadHistory>[number],
    config: PublicConfig
): Promise<string | null> {
    try {
        const imageEntry = await getImageFromIndexedDB(entry.id);

        if (!imageEntry) {
            removeHistoryEntry(entry.id);
            return null;
        }

        const promptParams: PromptParams = imageEntry.promptParams || {};

        const positivePrompt = promptParams.positivePrompt || '';
        const negativePrompt = promptParams.negativePrompt || '';
        const requiredInputs: Record<string, string | number> = promptParams.requiredInputs || {};
        const imageUrl = URL.createObjectURL(imageEntry.blob);

        return `
            <div class="history-item">
                <div class="image-wrapper">
                    <img src="${imageUrl}" alt="Generated image" class="clickable-image" data-fullsize="${imageUrl}" style="cursor: pointer;">
                    <button class="favorite-btn ${entry.isFavorite ? 'favorited' : ''}" data-id="${entry.id}" title="${entry.isFavorite ? 'お気に入り解除' : 'お気に入り追加'}">
                        ${entry.isFavorite ? '⭐' : '☆'}
                    </button>
                    <div class="image-overlay">
                        <button class="download-btn" data-blob-id="${entry.id}" data-id="${entry.id}" title="ダウンロード">
                            ⬇️ ダウンロード
                        </button>
                    </div>
                </div>
                <div class="history-item-info">
                    <div class="prompt-section positive-prompt-section">
                        <div class="prompt-header">
                            <strong>プロンプト:</strong>
                            <button class="copy-btn" data-text="${escapeHtml(positivePrompt)}" title="コピー">
                                📋 コピー
                            </button>
                        </div>
                        <p class="prompt-text">${escapeHtml(positivePrompt)}</p>
                    </div>
                    <div class="prompt-section negative-prompt-section">
                        <div class="prompt-header">
                            <strong>ネガティブプロンプト:</strong>
                            <button class="copy-btn" data-text="${escapeHtml(negativePrompt)}" title="コピー">
                                📋 コピー
                            </button>
                        </div>
                        <p class="prompt-text">${escapeHtml(negativePrompt || 'なし')}</p>
                    </div>
                    <p><strong>サイズ:</strong> ${promptParams.width}x${promptParams.height}</p>
                    <p><strong>シード:</strong> ${promptParams.seed}</p>
                    ${promptParams.checkpointName ? `<p><strong>チェックポイント:</strong> ${escapeHtml(promptParams.checkpointName)}</p>` : ''}
                    ${requiredInputs && Object.keys(requiredInputs).length > 0 ?
                Object.entries(requiredInputs).map(([key, value]) =>
                    `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</p>`
                ).join('')
                : ''}
                    <p><strong>作成日時:</strong> ${formatTimestamp(entry.createdAt, config.logging.timeZone)}</p>
                </div>
                <div class="history-item-actions">
                    <div class="apply-and-merge-buttons">
                        <button class="primary apply-prompt-btn" data-positive="${escapeHtml(positivePrompt)}" data-negative="${escapeHtml(negativePrompt)}">プロンプトへ適用(上書き)</button>
                        <button class="merge-prompt-btn" data-positive="${escapeHtml(positivePrompt)}" data-negative="${escapeHtml(negativePrompt)}">プロンプトへマージ</button>
                    </div>
                    <button class="quicksave-template-btn" data-id="${entry.id}" data-positive="${escapeHtml(positivePrompt)}" data-negative="${escapeHtml(negativePrompt)}" title="プロンプトをテンプレートに保存">💾 テンプレートに保存</button>
                    <button class="delete-btn danger" data-id="${entry.id}" title="この履歴を削除">🗑️ 削除</button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error(`Failed to render history item for id: ${entry.id}`, error);
        return null;
    }
}

/**
 * 履歴コンテンツをレンダリング（初回ロード用・全体構築）
 */
export async function renderHistoryContent(
    history: ReturnType<typeof loadHistory>,
    config: PublicConfig
): Promise<string> {
    if (history.length === 0) {
        return '<p style="color: #666; margin-top: 1rem;">履歴はありません</p>';
    }

    const historyItems = await Promise.all(
        history.map((entry) => renderHistoryItem(entry, config))
    );

    const validItems = historyItems.filter((item): item is string => item !== null);

    if (validItems.length === 0) {
        return `
            <div style="background-color: #fee; border: 1px solid #f88; border-radius: 4px; padding: 1rem; margin-top: 1rem;">
                <p style="color: #d00; font-weight: bold; margin-bottom: 0.5rem;">⚠️ 履歴の読み込みエラー</p>
                <p style="color: #666; margin-bottom: 1rem;">
                    履歴データベースが更新されている、もしくは破損しています。<br>
                    生成履歴を一度削除し、再構築してください。
                </p>
                <button id="clear-all-history-error-btn" class="danger" style="padding: 0.5rem 1rem;">🗑️ 生成履歴を全て削除</button>
            </div>
        `;
    }

    return `
        <div class="history-container">
            ${validItems.join('')}
        </div>
    `;
}

/**
 * 履歴アイテムを削除
 */
export async function deleteHistoryItem(id: string, renderedIds: Set<string>): Promise<void> {
    try {
        removeHistoryEntry(id);
        await deleteImageFromIndexedDB(id);
        stateManager.removeImage(id);
        renderedIds.delete(id);
    } catch (error) {
        throw new Error(`削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}
