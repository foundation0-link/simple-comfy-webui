/**
 * DOM操作ヘルパー関数
 */

/**
 * 要素を安全に取得
 */
export function getElement<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

/**
 * 要素を取得（必須）
 */
export function getRequiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
        throw new Error(`Required element not found: ${id}`);
    }
    return element;
}

/**
 * クエリセレクタで要素を取得
 */
export function querySelector<T extends HTMLElement>(selector: string): T | null {
    return document.querySelector<T>(selector);
}

/**
 * プロンプトフィールドのペアを取得
 */
export interface PromptFields {
    positive: HTMLTextAreaElement | null;
    negative: HTMLTextAreaElement | null;
}

export function getPromptFields(): PromptFields {
    return {
        positive: getElement<HTMLTextAreaElement>('positive-prompt'),
        negative: getElement<HTMLTextAreaElement>('negative-prompt'),
    };
}

/**
 * プロンプト値を取得
 */
export function getPromptValues(): { positive: string; negative: string } {
    const fields = getPromptFields();
    return {
        positive: fields.positive?.value || '',
        negative: fields.negative?.value || '',
    };
}

/**
 * プロンプト値を設定
 */
export function setPromptValues(positive: string, negative: string): void {
    const fields = getPromptFields();
    if (fields.positive) {
        fields.positive.value = positive;
        fields.positive.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    if (fields.negative) {
        fields.negative.value = negative;
        fields.negative.dispatchEvent(new Event('blur', { bubbles: true }));
    }
}

/**
 * モーダルを表示/非表示
 */
export function toggleModal(modalId: string, show: boolean): void {
    const modal = getElement(modalId);
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
    }
}
