/**
 * ユーティリティ関数集
 */


/**
 * 日時付きログ出力（YYYY-MM-DD HH:MM:SS形式）
 */
function getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * タイムスタンプ付きコンソールエラー出力
 */
export function logError(...args: any[]): void {
    console.error(`[${getTimestamp()}]`, ...args);
}

/**
 * タイムスタンプ付きコンソール警告出力
 */
export function logWarn(...args: any[]): void {
    console.warn(`[${getTimestamp()}]`, ...args);
}

/**
 * タイムスタンプ付きコンソール情報出力
 */
export function logInfo(...args: any[]): void {
    console.info(`[${getTimestamp()}]`, ...args);
}

/**
 * タイムスタンプ付きコンソールデバッグ出力
 */
export function logDebug(...args: any[]): void {
    console.debug(`[${getTimestamp()}]`, ...args);
}

/**
 * ランダムなシークレットキーを生成
 */
export function generateSecret(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * タイムゾーンを考慮した日時をフォーマット
 * @param timestamp ミリ秒単位のUNIXタイムスタンプ
 * @param timezone タイムゾーン（例：'Asia/Tokyo'）
 * @returns フォーマットされた日時文字列（例：'2025-01-05 15:30:45'）
 */
export function formatDateWithTimezone(timestamp: number, timezone: string): string {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const formatted = formatter.format(date);
    // Intl.DateTimeFormatは 'YYYY/MM/DD HH:MM:SS' 形式で返すので、これを 'YYYY-MM-DD HH:MM:SS' に変換
    return formatted.replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
}

/**
 * ComfyUIから画像を取得
 */
export async function fetchImageFromComfyUI(
    baseUrl: string,
    filename: string,
    subfolder: string,
    type: string
): Promise<Blob> {
    try {
        const params = new URLSearchParams({
            filename,
            subfolder,
            type,
        });

        const response = await fetch(`${baseUrl}/view?${params}`, {
            signal: AbortSignal.timeout(10 * 1000),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.blob();
    } catch (error) {
        throw new Error('Failed to fetch image from ComfyUI');
    }
}

/**
 * ComfyUIから履歴を取得
 */
export async function fetchHistoryFromComfyUI(
    baseUrl: string,
    promptId: string
): Promise<any> {
    try {
        const response = await fetch(`${baseUrl}/history/${promptId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch history: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Failed to fetch history from ComfyUI');
    }
}

/**
 * エラーメッセージから機密情報を除外
 */
export function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/http:\/\/[^\s]+/g, '[hidden]')
        .replace(/https:\/\/[^\s]+/g, '[hidden]')
        .replace(/ws:\/\/[^\s]+/g, '[hidden]')
        .replace(/wss:\/\/[^\s]+/g, '[hidden]');
}
