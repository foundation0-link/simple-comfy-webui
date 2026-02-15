/**
 * セッション状態管理
 * Streamlitのsession_stateに相当する機能
 * Job Queue管理を統合
 */

import { RequestJob, SessionState } from './types';
import { getCurrentTimestamp } from './utils';

// LocalStorage keys
const JOB_QUEUE_KEY = 'job_queue';

/**
 * LocalStorage内のジョブエントリ（RequestJob全体を保存）
 */
export interface StoredJobEntry {
    jobId: string;
    createdAt: number; // UNIX タイムスタンプ（秒）
    job: RequestJob; // RequestJob全体
}

/**
 * セッション状態を管理するクラス
 * Job Queueの管理も統合（LocalStorageを直接操作）
 */
class StateManager {
    private state: SessionState;
    private listeners: Set<() => void> = new Set();
    private notifyTimeoutId: number | null = null;
    private pendingNotification = false;
    private ttl: number = 60; // デフォルトTTL

    constructor() {
        this.state = {
            imagesStore: new Map(),
        };
    }

    /**
     * TTLを設定（アプリケーション起動時に呼び出す）
     * @param ttl - Job Queue TTL（秒）
     */
    setTtl(ttl: number): void {
        this.ttl = ttl;
    }

    /**
     * 状態を取得
     */
    getState(): Readonly<SessionState> {
        return this.state;
    }

    /**
     * ジョブキューを取得（LocalStorageから）
     */
    getJobQueue(): readonly RequestJob[] {
        return this.getStoredJobs(this.ttl).map(entry => entry.job);
    }

    /**
     * アクティブなジョブ数を取得
     * LocalStorage内のジョブ数を基準にする
     * @param jobQueueTtl - Job Queue TTL（秒）
     */
    getActiveJobsCount(jobQueueTtl?: number): number {
        return this.getStoredJobs(jobQueueTtl ?? this.ttl).length;
    }

    /**
     * ジョブを追加（LocalStorageのみ）
     */
    addJob(job: RequestJob): void {
        if (job.jobId) {
            this.saveJobToStorage(job);
            this.scheduleNotify();
        }
    }

    /**
     * ジョブの状態を更新（LocalStorageのみ）
     */
    updateJob(jobId: string, updates: Partial<RequestJob>): void {
        if (this.updateStoredJob(jobId, updates)) {
            this.scheduleNotify();
        }
    }

    /**
     * ジョブを削除（LocalStorageのみ）
     */
    removeJob(jobId: string): void {
        this.deleteStoredJob(jobId);
        this.scheduleNotify();
    }

    /**
     * ジョブが存在するか確認
     */
    jobExists(jobId: string, ttl?: number): boolean {
        return this.getStoredJobs(ttl ?? this.ttl).some(entry => entry.jobId === jobId);
    }

    /**
     * ジョブの作成時刻を取得
     */
    getJobCreatedAt(jobId: string): number | null {
        const entry = this.getStoredJobs(Number.POSITIVE_INFINITY).find(e => e.jobId === jobId);
        return entry?.createdAt || null;
    }

    // ========================================
    // LocalStorage操作（プライベート）
    // ========================================

    /**
     * LocalStorage内のすべてのジョブを取得（TTL処理済み）
     * 全てのJob操作の基底関数
     */
    private getStoredJobs(ttl?: number): StoredJobEntry[] {
        const effectiveTtl = ttl ?? this.ttl;
        try {
            const stored = localStorage.getItem(JOB_QUEUE_KEY);
            if (!stored) {
                return [];
            }

            const jobs: StoredJobEntry[] = JSON.parse(stored);
            const now = getCurrentTimestamp();

            // TTL処理: 古いエントリを除外
            const validJobs = jobs.filter((job) => {
                if (!job.createdAt) {
                    return false;
                }
                return now - job.createdAt <= effectiveTtl;
            });

            // フィルタリング結果が元と異なる場合は保存
            if (validJobs.length !== jobs.length) {
                this.saveStoredJobs(validJobs);
            }

            return validJobs;
        } catch (error) {
            console.error('[JobQueue] Failed to get stored jobs:', error);
            return [];
        }
    }

    /**
     * StoredJobEntry配列をLocalStorageに保存
     * 空配列の場合はキーを削除
     */
    private saveStoredJobs(jobs: StoredJobEntry[]): void {
        try {
            if (jobs.length === 0) {
                localStorage.removeItem(JOB_QUEUE_KEY);
            } else {
                localStorage.setItem(JOB_QUEUE_KEY, JSON.stringify(jobs));
            }
        } catch (error) {
            console.error('[JobQueue] Failed to save stored jobs:', error);
        }
    }

    /**
     * ジョブをLocalStorageに登録
     */
    private saveJobToStorage(job: RequestJob): boolean {
        try {
            if (!job.jobId) {
                console.warn('[JobQueue] Cannot add job without jobId');
                return false;
            }

            const jobs = this.getStoredJobs(this.ttl);

            // 重複チェック
            if (jobs.some(j => j.jobId === job.jobId)) {
                console.warn(`[JobQueue] Job ${job.jobId} already exists`);
                return false;
            }

            jobs.push({
                jobId: job.jobId,
                createdAt: getCurrentTimestamp(),
                job: job,
            });

            this.saveStoredJobs(jobs);
            return true;
        } catch (error) {
            console.error('[JobQueue] Failed to add job:', error);
            return false;
        }
    }

    /**
     * LocalStorage内のジョブを更新
     */
    private updateStoredJob(jobId: string, updates: Partial<RequestJob>): boolean {
        try {
            const jobs = this.getStoredJobs(this.ttl);
            const jobEntry = jobs.find(j => j.jobId === jobId);

            if (!jobEntry) {
                console.warn(`[JobQueue] Job ${jobId} not found`);
                return false;
            }

            // ジョブ情報を更新
            Object.assign(jobEntry.job, updates);
            this.saveStoredJobs(jobs);
            return true;
        } catch (error) {
            console.error('[JobQueue] Failed to update job:', error);
            return false;
        }
    }

    /**
     * ジョブをLocalStorageから削除
     */
    private deleteStoredJob(jobId: string): void {
        try {
            const jobs = this.getStoredJobs(this.ttl).filter(job => job.jobId !== jobId);
            this.saveStoredJobs(jobs);
        } catch (error) {
            console.error('[JobQueue] Failed to delete job:', error);
        }
    }

    /**
     * Job Queueをクリア
     */
    private clearJobQueueStorage(): void {
        try {
            localStorage.removeItem(JOB_QUEUE_KEY);
        } catch (error) {
            console.error('[JobQueue] Failed to clear job queue:', error);
        }
    }



    /**
     * 画像を保存
     */
    storeImage(jobId: string, blob: Blob): void {
        this.state.imagesStore.set(jobId, blob);
        // 画像保存はリスナー通知の対象外（UI更新が不要）
        // this.scheduleNotify();
    }

    /**
     * 画像を取得
     */
    getImage(jobId: string): Blob | undefined {
        return this.state.imagesStore.get(jobId);
    }

    /**
     * 画像を削除
     */
    removeImage(jobId: string): void {
        this.state.imagesStore.delete(jobId);
        // 画像削除はリスナー通知の対象外（UI更新が不要）
        // this.scheduleNotify();
    }

    /**
     * ユーザーごとの同時実行数制限をチェック
     * LocalStorageのジョブ数を基準にする
     * @param maxConcurrentRequestsPerUser - 最大同時実行数
     * @param jobQueueTtl - Job Queue TTL（秒）
     */
    canStartNewJob(maxConcurrentRequestsPerUser: number, jobQueueTtl?: number): boolean {
        const activeCount = this.getActiveJobsCount(jobQueueTtl);
        return activeCount < maxConcurrentRequestsPerUser;
    }

    /**
     * 状態変更のリスナーを登録
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        // アンサブスクライブ関数を返す
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * リスナー通知をスケジュール（デバウンス付き）
     */
    private scheduleNotify(): void {
        // 既に通知がスケジュールされている場合はスキップ
        if (this.notifyTimeoutId !== null) {
            this.pendingNotification = true;
            return;
        }

        // 次のマイクロタスク以降で通知を実行（複数の同期的な状態変更をまとめる）
        this.notifyTimeoutId = window.setTimeout(() => {
            this.notifyListeners();
            this.notifyTimeoutId = null;

            // 通知中に追加の状態変更があった場合は再度通知
            if (this.pendingNotification) {
                this.pendingNotification = false;
                this.scheduleNotify();
            }
        }, 0);
    }

    /**
     * リスナーに通知
     */
    private notifyListeners(): void {
        this.listeners.forEach((listener) => listener());
    }

    /**
     * すべてをクリア（セッション終了時）
     */
    clear(): void {
        this.state.imagesStore.clear();
        this.clearJobQueueStorage();
        if (this.notifyTimeoutId !== null) {
            clearTimeout(this.notifyTimeoutId);
            this.notifyTimeoutId = null;
        }
        this.notifyListeners();
    }
}

// グローバルインスタンス
export const stateManager = new StateManager();
