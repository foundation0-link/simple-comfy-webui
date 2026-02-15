/**
 * プロンプト翻訳パネルのレンダリングとインタラクション
 */

import { TranslatedToken } from './translator';
import { escapeHtml } from '../utils';

/**
 * プロンプト翻訳パネルをレンダリング
 */
export function renderTranslationPanel(
    tokens: TranslatedToken[],
    panelId: string,
    isNegative: boolean = false
): string {
    if (tokens.length === 0) {
        return `<div id="${panelId}" class="prompt-translation-panel"></div>`;
    }

    const tokensHtml = tokens
        .map(token => renderTranslationToken(token))
        .join('');

    return `
        <div id="${panelId}" class="prompt-translation-panel ${isNegative ? 'negative' : ''} active" data-panel-type="${isNegative ? 'negative' : 'positive'}">
            <div class="translation-tokens">
                ${tokensHtml}
            </div>
        </div>
    `;
}

/**
 * 単一のトークンをレンダリング
 */
function renderTranslationToken(token: TranslatedToken): string {
    if (!token.found) {
        return `<div class="token not-found" title="クリックで削除: ${token.text}" data-token-text="${escapeHtml(token.text)}" style="cursor: pointer;">
            <span class="token-text">${escapeHtml(token.text)}</span>
            <span class="token-remove">×</span>
        </div>`;
    }

    const translation = token.translations[0]; // 最初の翻訳のみ表示

    return `<div class="token" title="クリックで削除: ${escapeHtml(token.text)}" data-token-text="${escapeHtml(token.text)}" style="cursor: pointer;">
        <span class="token-text">${escapeHtml(token.text)}</span>
        <span class="token-translation">${escapeHtml(translation)}</span>
        <span class="token-remove">×</span>
    </div>`;
}

/**
 * 翻訳パネル内のトークンをクリック可能にする
 */
export function setupTokenClickListeners(panelId: string, isNegative: boolean): void {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const tokens = panel.querySelectorAll('.token');
    const textareaId = isNegative ? 'negative-prompt' : 'positive-prompt';
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;

    if (!textarea) return;

    tokens.forEach(tokenElement => {
        const tokenText = tokenElement.getAttribute('data-token-text');
        if (!tokenText) return;

        const htmlElement = tokenElement as HTMLElement;
        htmlElement.onclick = (e) => {
            e.stopPropagation();
            removeTokenFromPrompt(textarea, tokenText);
        };
    });
}

/**
 * プロンプトテキストからトークンを削除
 */
function removeTokenFromPrompt(textarea: HTMLTextAreaElement, tokenText: string): void {
    const currentText = textarea.value;
    const tags = currentText
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    // tokenText に完全に一致するタグを削除
    const filteredTags = tags.filter(tag => tag !== tokenText);

    // テキストエリアに更新
    textarea.value = filteredTags.length > 0 ? filteredTags.join(', ') : '';

    // blur イベントを発火させて翻訳パネルを更新
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
}
