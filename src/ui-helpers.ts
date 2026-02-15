/**
 * UI共通ヘルパー関数
 * ステータスメッセージ、ダイアログ、トーストなど共通UI機能
 */

/**
 * ステータスメッセージの型
 */
export type StatusType = 'success' | 'error' | 'warning' | 'info';

/**
 * ステータスメッセージを表示
 * @param element - 対象のHTMLElement（null の場合はトーストで表示）
 * @param message - 表示するメッセージ
 * @param type - メッセージタイプ
 * @param duration - 表示時間（ミリ秒）
 */
export function showStatus(
    element: HTMLElement | null,
    message: string,
    type: StatusType = 'success',
    duration: number = 3000
): void {
    if (!element) {
        // トースト風に表示
        showToast(message, type);
        return;
    }

    element.textContent = message;
    element.className = `status-message ${type} active`;

    // duration後に非表示
    if (duration > 0) {
        setTimeout(() => {
            element.classList.remove('active');
        }, duration);
    }
}

/**
 * トースト風のメッセージを表示
 * @param message - メッセージ
 * @param type - メッセージタイプ
 * @param duration - 表示時間（ミリ秒）
 */
export function showToast(
    message: string,
    type: StatusType = 'info',
    duration: number = 3000
): void {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // トースト専用スタイルがない場合は簡易表示
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }

    const container = document.getElementById('toast-container')!;
    container.appendChild(toast);

    toast.style.cssText = `
        padding: 12px 16px;
        margin-bottom: 8px;
        border-radius: 4px;
        animation: slideIn 0.3s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    // タイプに応じた背景色
    const colorMap: Record<StatusType, string> = {
        success: 'background: rgba(76, 175, 80, 0.9); color: #fff;',
        error: 'background: rgba(244, 67, 54, 0.9); color: #fff;',
        warning: 'background: rgba(255, 193, 7, 0.9); color: #000;',
        info: 'background: rgba(100, 108, 255, 0.9); color: #fff;',
    };
    toast.style.cssText += colorMap[type];

    // 指定時間後に削除
    if (duration > 0) {
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}
