/**
 * アプリケーションコントローラー
 * ビジネスロジックとComfyUIとの連携
 */

import { Client } from './client';
import { stateManager } from './state-manager';
import { addHistoryEntry } from './local-storage';
import {
    saveImageToIndexedDB,
} from './indexed-db-storage';
import {
    RequestPromptParams,
    RequestJob,
    ImageEntry,
    PublicConfig,
    NotificationFromPixelSocket,
    PromptParams,
} from './types';
import {
    validateSeed,
    validateImageSize,
    getCurrentTimestamp,
    sanitizeErrorMessage,
    generateRandomSeed,
    generateULID
} from './utils';

/**
 * アプリケーションコントローラー
 */
export class AppController {
    client: Client;
    private config: PublicConfig | null = null;
    private onJobCompleted: ((jobId: string) => Promise<void>) | null = null;

    constructor(config: PublicConfig) {
        this.config = config;
        this.client = new Client();
    }

    /**
     * ジョブ完了時のコールバックを設定
     */
    public setOnJobCompleted(callback: (jobId: string) => Promise<void>): void {
        this.onJobCompleted = callback;
    }



    // ========================================
    // メイン処理
    // ========================================

    /**
     * 画像生成リクエストを送信
     */
    async requestGenerate(params: RequestPromptParams): Promise<void> {
        // バリデーション
        this.validateParams(params);

        // シード値の処理
        let seedValue: string;
        if (params.userSeed === "-1") {
            // ランダムシード生成
            seedValue = generateRandomSeed().toString();
        } else {
            seedValue = params.userSeed;
        }

        // ジョブを作成（local jobId を生成）
        const localJobId = generateULID();
        const job: RequestJob = {
            jobId: localJobId,
            status: 'pending',
            requestPromptParams: { ...params, seed: seedValue },
            userSeed: params.userSeed, // ユーザー入力の元の値を保持
            createdAt: getCurrentTimestamp(),
        };

        // ジョブをキューに追加
        stateManager.addJob(job);

        // ジョブを実行（エラーを上位に伝播）
        try {
            await this.executeJob(job);
        } catch (error) {
            // executeJobでキャッチされなかったエラーを再スロー
            throw error;
        }
    }

    // ========================================
    // 補助処理
    // ========================================

    /**
     * ジョブを実行
     */
    private async executeJob(job: RequestJob): Promise<void> {
        try {
            // ジョブ状態を更新
            stateManager.updateJob(job.jobId!, { status: 'running' });

            // パラメータのみをサーバーに送信（セキュリティ強化）
            // ワークフローJSON生成はサーバー側で行う
            const response = await this.client.queuePrompt(job.requestPromptParams);

            // job_idの存在チェック
            if (!response.job_id) {
                const responseStr = JSON.stringify(response);
                throw new Error(`No job_id in response. Response: ${responseStr}`);
            }

            // server側のジョブIDを記録（WebSocketイベントマッチング用）
            stateManager.updateJob(job.jobId!, { promptId: response.job_id });

            // ジョブの完了をポーリング（非同期で実行）
            this.pollAndGetImage(job.jobId!, response.job_id, job.requestPromptParams)
                .catch((error) => {
                    const errorMessage = sanitizeErrorMessage(error);
                    // キャンセルされた場合のエラーメッセージはスキップ
                    if (!errorMessage.includes('cancelled')) {
                        stateManager.updateJob(job.jobId!, {
                            status: 'failed',
                            error: errorMessage,
                            completedAt: getCurrentTimestamp(),
                        });
                    }
                    console.error('Polling and image download failed:', errorMessage);
                    // ポーリングをキャンセル（念のため）
                    this.client.cancelPolling(response.job_id);
                });

        } catch (error) {
            // エラー処理
            const errorMessage = sanitizeErrorMessage(error);
            stateManager.updateJob(job.jobId!, {
                status: 'failed',
                error: errorMessage,
                completedAt: getCurrentTimestamp(),
            });
            console.error('Job execution failed:', errorMessage);

            // 失敗したジョブもキューから削除
            stateManager.removeJob(job.jobId!);

            // エラーを上位に再スロー（UIにエラーメッセージを表示するため）
            throw new Error(errorMessage);
        }
    }

    /**
     * ジョブの完了をポーリングして画像を取得・保存
     */
    private async pollAndGetImage(localJobId: string, serverJobId: string, params: RequestPromptParams): Promise<void> {
        try {
            // サーバーのポーリング完了を待つ
            const result = await this.client.pollJobCompletion(serverJobId);

            if (result.status !== 'completed') {
                throw new Error(`Job failed with status: ${result.status}. ${result.error || ''}`);
            }

            // 画像情報が存在するか確認
            if (!result.imageInfo || result.imageInfo.length === 0) {
                throw new Error('No images returned from job');
            }

            // 各画像を取得して保存
            for (const imageInfo of result.imageInfo) {
                try {
                    const blob = await this.client.getImageFetch(
                        imageInfo.filename,
                        imageInfo.subfolder,
                        imageInfo.type
                    );

                    // 画像をIndexedDBに保存
                    const imageEntry: ImageEntry = {
                        id: localJobId,
                        blob,
                        createdAt: Math.floor(Date.now() / 1000),
                        fileExtension: this.getFileExtension(imageInfo.filename),
                        mimeType: blob.type || 'image/png',
                        userSeed: params.userSeed,
                        promptParams: {
                            checkpointName: '',
                            positivePrompt: params.positivePrompt,
                            negativePrompt: params.negativePrompt,
                            seed: params.seed,
                            steps: 0,
                            cfg: 0,
                            samplerName: '',
                            width: params.width,
                            height: params.height,
                            requiredInputs: params.requiredInputs || {},
                            imageFileFormat: '',
                            secretToken: '',
                            websocketUrl: '',
                        },
                        serverJobId: result.promptId,
                    };

                    await saveImageToIndexedDB(imageEntry);

                    // LocalStorageに履歴エントリを追加（UIで表示するため必須）
                    await addHistoryEntry(localJobId);

                    console.log(`[AppController] Image saved and added to history - localJobId: ${localJobId}, filename: ${imageInfo.filename}`);
                } catch (error) {
                    console.error(`Failed to download/save image: ${error}`);
                    throw error;
                }
            }

            // ジョブを完了状態に更新（全画像保存後に一度だけ実行）
            stateManager.updateJob(localJobId, {
                status: 'completed',
                completedAt: getCurrentTimestamp(),
            });

            // UIを更新（コールバックが登録されている場合）
            if (this.onJobCompleted) {
                try {
                    await this.onJobCompleted(localJobId);
                } catch (error) {
                    console.error('Failed to update UI after job completion:', error);
                }
            }

        } catch (error) {
            console.error('Poll and get image failed:', error);
            // エラー時もポーリングをキャンセル
            this.client.cancelPolling(serverJobId);
            throw error;
        }
    }

    /**
     * ファイル名から拡張子を抽出
     */
    private getFileExtension(filename: string): string {
        const match = filename.match(/\.([^.]+)$/);
        return match ? match[1].toLowerCase() : 'png';
    }

    /**
     * パラメータのバリデーション
     */
    private validateParams(params: RequestPromptParams): void {
        // シード値の検証
        if (!validateSeed(params.userSeed)) {
            throw new Error('Invalid seed value. Must be -1 or 0 to 2^63-1');
        }

        // 画像サイズの検証
        if (!validateImageSize(params.width, this.config!.image.available.widths)) {
            throw new Error('Invalid width value');
        }
        if (!validateImageSize(params.height, this.config!.image.available.heights)) {
            throw new Error('Invalid height value');
        }

        // プロンプトの検証
        if (!params.positivePrompt || params.positivePrompt.trim() === '') {
            throw new Error('Positive prompt is required');
        }
    }

    // ========================================
    // イベントハンドラ
    // ========================================

    /**
     * ブロードキャストから受信したイベントを処理
     * @param payload イベントデータ
     */
    public async notificationEvent(payload: NotificationFromPixelSocket, promptParams: PromptParams): Promise<void> {
        const { jobId, blobData, mimeType, fileExtension, imageLength } = payload;

        // jobId（WebSocketから受け取った値）でマッチングするジョブを探す
        // promptIdフィールドを確認してマッチングする
        const jobs = stateManager.getJobQueue();
        const matchingJob = jobs.find(job => job.promptId === jobId);

        // デバッグログ：マッチング状況を詳細に記録
        console.debug(
            `[NotificationEvent] Job lookup for promptId: ${jobId}. Found: ${matchingJob ? 'YES' : 'NO'}. ` +
            `Total jobs in queue: ${jobs.length}. Active jobs: ${stateManager.getActiveJobsCount()}`
        );

        if (!matchingJob) {
            // 自分のジョブではない可能性（他のユーザーの画像 or 既に処理済み）
            // ただし、eventData に params が含まれている場合はバックアップポーリングからの通知
            // または他ユーザーの画像の可能性があるため、完全スルーせず必要に応じて処理
            console.debug(
                `[NotificationEvent] No matching job for promptId: ${jobId}. This may be another user's image or a delayed event.`
            );
            // Note: We do not decrement activeJobs here because this notification
            // was likely for another user's image or already processed
            return;
        }

        console.debug(
            `[NotificationEvent] Received delivery event. promptId: ${jobId}, localJobId: ${matchingJob.jobId}`
        );

        if (blobData === null) {
            throw new Error('Blob data is null in push mode');
        }

        // blobData(Uint8Array) -> Blobに変換
        const bytes = blobData.slice();
        const blob = new Blob([bytes], { type: mimeType });
        console.debug(`[NotificationEvent] Blob created from blobData. mimeType: ${mimeType}, size: ${blob.size}, imageLength: ${imageLength}, promptId: ${jobId}`);

        // 画像をメモリに保存（localJobIdをキーとする）
        stateManager.storeImage(matchingJob.jobId!, blob);

        // IndexedDBに画像とプロンプト情報を保存（localJobIdをキーとする）
        const imageEntry: ImageEntry = {
            id: matchingJob.jobId!,
            blob: blob,
            createdAt: getCurrentTimestamp(),
            fileExtension: fileExtension,
            mimeType: mimeType,
            userSeed: matchingJob.userSeed, // ユーザー入力のオリジナルシード値を保存
            promptParams, // プロンプトパラメータを保存（存在する場合のみ）
            serverJobId: matchingJob.promptId, // サーバー側で生成されたジョブID
        };
        await saveImageToIndexedDB(imageEntry);

        // ジョブを更新（localJobIdで更新）
        stateManager.updateJob(matchingJob.jobId!, {
            status: 'completed',
            completedAt: getCurrentTimestamp(),
        });

        // LocalStorageに履歴追加（localJobIdを使用）
        await addHistoryEntry(matchingJob.jobId!);

        console.debug(
            `[NotificationEvent] Image stored. localJobId: ${matchingJob.jobId}, promptId: ${jobId}`
        );

        // ジョブをキューから削除（localJobIdで削除）
        stateManager.removeJob(matchingJob.jobId!);
        console.info(
            `[NotificationEvent] All images received for localJobId: ${matchingJob.jobId}, promptId: ${jobId}. ` +
            `Remaining jobs: ${jobs.length - 1}`
        );

        console.info(`[NotificationEvent] Image processed successfully. jobId: ${matchingJob.jobId}`);
    }

    // ========================================
    // データ復元
    // ========================================



    // ========================================
    // クリーンアップ
    // ========================================

    /**
     * クリーンアップ
     */
    cleanup(): void {
        stateManager.clear();
    }
}
