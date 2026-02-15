/**
 * APIクライアント
 * HTTP通信を管理
 */

import { RequestPromptParams, RequestPromptResponse, JobCompletionResult } from './types';
import { generateULID, sanitizeErrorMessage } from './utils';

export class Client {
    private baseUrl: string;
    private clientId: string;
    private pollingAbortControllers: Map<string, AbortController> = new Map();

    constructor() {
        this.baseUrl = `${window.location.protocol}//${window.location.host}`;
        this.clientId = this.generateClientId();
    }

    // ========================================
    // プライベート初期化・ヘルパーメソッド
    // ========================================

    /**
     * クライアントIDを生成
     */
    private generateClientId(): string {
        return `client_${generateULID()}_${Math.random().toString(36)}`;
    }

    // ========================================
    // メッセージハンドリング
    // ========================================




    // ========================================
    // API メソッド（HTTP）
    // ========================================

    /**
     * 画像生成リクエスト（セキュリティ強化版）
     * ワークフローJSONではなく、パラメータのみをサーバーに送信
     */
    public async queuePrompt(params: RequestPromptParams): Promise<RequestPromptResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-Id': this.clientId,
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                // HTTPステータスコードに応じたエラーメッセージ
                if (response.status === 503) {
                    throw new Error('サーバーが一時的に利用できません (503 Service Unavailable)');
                } else if (response.status === 504) {
                    throw new Error('サーバーがタイムアウトしました (504 Gateway Timeout)');
                } else if (response.status >= 500) {
                    throw new Error(`サーバーエラーが発生しました (${response.status})`);
                } else if (response.status === 429) {
                    throw new Error('リクエスト数が多すぎます。しばらく待ってから再試行してください (429 Too Many Requests)');
                } else {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }
            }

            if (response.status === 202) {
                console.log('[Client] Request accepted and is being processed (202 Accepted)');
            }
            const data: RequestPromptResponse = await response.json();

            return data;
        } catch (error) {
            // タイムアウトエラーの特別処理
            if (error instanceof Error) {
                if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
                    throw new Error(`リクエストがタイムアウトしました。サーバーの負荷が高い可能性があります。`);
                }
                // ネットワークエラーの処理
                if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                    throw new Error('ネットワークエラーが発生しました。接続を確認してください。');
                }
            }
            throw new Error(sanitizeErrorMessage(error));
        }
    }



    /**
     * 画像を取得
     */
    public async getImageFetch(filename: string, subfolder: string, type: string): Promise<Blob> {
        try {
            const params = new URLSearchParams({
                filename,
                subfolder,
                type,
            });

            const response = await fetch(`${this.baseUrl}/comfyui/api/view?${params}`, {
            });

            if (!response.ok) {
                if (response.status === 503) {
                    throw new Error('画像サーバーが一時的に利用できません (503)');
                } else if (response.status === 504) {
                    throw new Error('画像取得がタイムアウトしました (504)');
                } else if (response.status >= 500) {
                    throw new Error(`画像サーバーエラー (${response.status})`);
                } else if (response.status === 404) {
                    throw new Error('画像が見つかりません (404)');
                } else {
                    throw new Error(`HTTPエラー: ${response.status}`);
                }
            }

            const blob = await response.blob();
            return blob;
        } catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
                throw new Error(`画像取得がタイムアウトしました。`);
            }
            throw new Error(sanitizeErrorMessage(error));
        }
    }

    /**
     * ジョブ結果を取得
     */
    public async getJobResult(jobId: string): Promise<JobCompletionResult> {
        try {
            const response = await fetch(`${this.baseUrl}/api/result/${jobId}`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Job result not found');
                } else if (response.status >= 500) {
                    throw new Error(`Server error (${response.status})`);
                } else {
                    throw new Error(`HTTP error: ${response.status}`);
                }
            }

            // 204 No Content はジョブ処理中を示す
            if (response.status === 204) {
                throw new Error('Job still processing');
            }

            const data: JobCompletionResult = await response.json();
            return data;
        } catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
                throw new Error(`Job result retrieval timed out.`);
            }
            throw new Error(sanitizeErrorMessage(error));
        }
    }

    /**
     * ジョブの完了をポーリング（キャンセル可能）
     * @param jobId ジョブID
     * @param maxRetries 最大リトライ回数（デフォルト: 600回 = 20分間隔2秒）
     * @param interval ポーリング間隔（ミリ秒、デフォルト: 2000）
     */
    public async pollJobCompletion(
        jobId: string,
        maxRetries: number = 600,
        interval: number = 2000
    ): Promise<JobCompletionResult> {
        // ジョブID用のAbortControllerを作成
        const abortController = new AbortController();
        this.pollingAbortControllers.set(jobId, abortController);

        try {
            let attempts = 0;

            while (attempts < maxRetries) {
                // キャンセルが要求されたかチェック
                if (abortController.signal.aborted) {
                    throw new Error(`Polling cancelled for job: ${jobId}`);
                }

                try {
                    const result = await this.getJobResult(jobId);

                    // 完了、失敗、タイムアウトなどのステータスが返されたら終了
                    if (result.status === 'completed' || result.status === 'failed' || result.status === 'timeout') {
                        console.log(`[Client] Job completed - status: ${result.status}, jobId: ${jobId}`);
                        return result;
                    }

                    // まだ処理中なので、指定間隔待ってから再試行
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, interval));
                } catch (error) {
                    attempts++;

                    // 404エラー（まだ結果が登録されていない）または204（処理中）の場合は続行
                    if (error instanceof Error && (error.message === 'Job result not found' || error.message === 'Job still processing')) {
                        await new Promise(resolve => setTimeout(resolve, interval));
                        continue;
                    }

                    // その他のエラーの場合は再スロー
                    throw error;
                }
            }

            throw new Error(`Job polling timeout after ${maxRetries * (interval / 1000)} seconds`);
        } finally {
            // ポーリング終了後、AbortControllerを削除
            this.pollingAbortControllers.delete(jobId);
        }
    }

    /**
     * ジョブのポーリングをキャンセル
     */
    public cancelPolling(jobId: string): void {
        const abortController = this.pollingAbortControllers.get(jobId);
        if (abortController) {
            console.log(`[Client] Cancelling polling for jobId: ${jobId}`);
            abortController.abort();
        }
    }
}
