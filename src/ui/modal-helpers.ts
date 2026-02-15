/**
 * モーダル管理ヘルパー
 */

/**
 * モーダルの基本セットアップ
 */
export function setupModalClose(modalId: string, closeBtnId: string): void {
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);

    if (!modal) return;

    // 閉じるボタン
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    // モーダル背景クリックで閉じる
    modal.onclick = (e: MouseEvent) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
}

/**
 * ダイアログ要素を作成
 */
export function createDialogElement(className: string, content: string): HTMLDivElement {
    const container = document.createElement('div');
    container.className = className;
    container.innerHTML = content;
    return container;
}

/**
 * ダイアログをクリーンアップ
 */
export function removeDialog(dialog: HTMLElement): void {
    dialog.remove();
}
