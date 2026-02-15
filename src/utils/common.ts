/**
 * ユーティリティ関数（汎用）
 */


/**
 * シード値のバリデーション
 * -1（ランダム）または 0 から 2^63-1 の範囲
 */
export function validateSeed(seed: string | bigint): boolean {
    return seed === '-1' || (BigInt(seed) >= 0n && BigInt(seed) <= 9223372036854775807n);
}

/**
 * ランダムなシード値を生成
 * crypto.getRandomValues() を使用して 0 から 2^63-1 の範囲で均一に生成
 */
export function generateRandomSeed(): bigint {
    const buffer = new Uint32Array(2);
    crypto.getRandomValues(buffer);

    // 上位ビットを31ビットに制限（最上位ビットを0に）
    // これにより 0 から 2^63-1 の範囲に収まる
    const high = buffer[0] & 0x7FFFFFFF; // 上位31ビット
    const low = buffer[1];                // 下位32ビット

    return BigInt(high) * BigInt(4294967296) + BigInt(low);
}

/**
 * 画像サイズのバリデーション
 * 許可リストに含まれているかチェック
 */
export function validateImageSize(size: number, allowedSizes: number[]): boolean {
    return allowedSizes.includes(size);
}

/**
 * エラーメッセージから機密情報を除外
 */
export function sanitizeErrorMessage(error: any): string {
    const message = typeof error === 'string' ? error : error.message;

    // URLやパスを除外
    return message
        .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
        .replace(/\/[^\s]+\.(json|ts|js)/g, '[path removed]');
}

/**
 * 現在のUNIXタイムスタンプを取得
 */
export function getCurrentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * ULIDを生成する簡易関数
 */
export function generateULID(): string {
    // 簡易的なULID生成（タイムスタンプ + ランダム値）
    const timestamp = Date.now().toString(36).padStart(8, '0');
    const random = Math.random().toString(36).substring(2, 10).padStart(8, '0');
    return (timestamp + random).toUpperCase();
}

/**
 * HTML特殊文字をエスケープ
 */
export function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * タイムスタンプをフォーマット
 */
export function formatTimestamp(timestamp: number, timeZone: string): string {
    const milliseconds = timestamp * 1000;
    return new Date(milliseconds).toLocaleString('ja-JP', {
        timeZone: timeZone,
    });
}


/**
 * 画像フォーマットを変換（PNG/WEBP）
 * @param blob 元の画像Blob
 * @param targetFormat 変換先フォーマット ('png' または 'webp')
 * @returns 変換後のBlob、または変換失敗時は元のBlob
 */
export async function convertImageFormat(blob: Blob, targetFormat: 'png' | 'webp'): Promise<Blob> {
    try {
        // 元の画像がターゲットフォーマットと同じ場合はそのまま返す
        const currentMimeType = blob.type;
        if (targetFormat === 'png' && currentMimeType === 'image/png') {
            return blob;
        }
        if (targetFormat === 'webp' && currentMimeType === 'image/webp') {
            return blob;
        }

        // Canvas で変換
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const blob2 = new Blob([uint8Array], { type: currentMimeType });
        const url = URL.createObjectURL(blob2);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        return new Promise((resolve, reject) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0);

                // Canvas から Blob に変換
                const targetMimeType = targetFormat === 'webp' ? 'image/webp' : 'image/png';
                const quality = targetFormat === 'webp' ? 0.9 : 1.0;

                canvas.toBlob(
                    (resultBlob) => {
                        URL.revokeObjectURL(url);
                        if (resultBlob) {
                            resolve(resultBlob);
                        } else {
                            reject(new Error('Failed to convert image'));
                        }
                    },
                    targetMimeType,
                    quality
                );
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    } catch (error) {
        console.warn('Image format conversion failed, using original blob:', error);
        return blob;
    }
}
