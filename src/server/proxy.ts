/**
 * Proxy Server for ComfyUI
 * Handles API requests, WebSocket connections, and routing to ComfyUI hosts.
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { createServer, type Server } from 'http';
import type { Request } from 'express';
import type { Socket } from 'net';
import {
    loadWorkflowTemplate,
    populateWorkflow,
    validateParams,
    parseAllowedSizes,
    getAllowedWorkflowIdentifiers,
} from './workflow-handler';
import ConfigManager from './config-manager';
import {
    logError,
    logInfo,
    logDebug,
    fetchHistoryFromComfyUI,
} from './utils';
import type { PromptParams } from './types';
import type { JobCompletionResult } from './types';
import { ulid } from 'ulidx';

/**
 * Main class for the proxy server
 */
class ProxyServer {
    private app: express.Application;
    private server: Server;
    private config: ConfigManager;
    private allowedWidths: number[] = [];
    private allowedHeights: number[] = [];
    private isShuttingDown = false;
    private activeConnections = new Set<Socket>();
    private generateLimiter: any;
    private jobResults: Map<string, JobCompletionResult> = new Map();

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.config = new ConfigManager();
        this.setupApp();
    }

    /**
     * Setup Express application
     */
    private setupApp(): void {
        // Parse JSON request bodies (limit: 10MB)
        this.app.use(express.json({ limit: '10mb' }));

        // プロキシの背後で動作する場合の設定
        this.app.set('trust proxy', 'loopback');

        // メンテナンスモードミドルウェア
        this.app.use((_req, _res, next) => {
            next();
        });

        // 静的ファイルの配信（Viteビルド成果物）
        this.app.use(express.static(path.join(__dirname, '../dist')));

        // ルートハンドラー
        this.setupRoutes();

        // SPAのルーティング対応（存在しないパスは全てindex.htmlへ）
        this.app.use((_req, res) => {
            res.sendFile(path.join(__dirname, '../dist/index.html'));
        });
    }

    /**
     * ルート定義
     */
    private setupRoutes(): void {
        // 公開設定エンドポイント
        this.app.get('/api/public-config', this.handlePublicConfig.bind(this));

        // 生成エンドポイント
        this.app.post('/api/generate', (req, res, next) => {
            if (!this.generateLimiter) {
                return next();
            }
            this.generateLimiter(req, res, next);
        }, this.handleGenerate.bind(this));

        // ジョブ結果取得エンドポイント
        this.app.get('/api/result/:jobId', this.handleGetResult.bind(this));

        // ComfyUI APIプロキシ
        this.app.use('/comfyui/api', this.createComfyUIApiProxy());
    }

    /**
     * ジョブ結果取得エンドポイント
     */
    private handleGetResult(_req: Request, res: express.Response): void {
        try {
            const jobId = Array.isArray(_req.params.jobId) ? _req.params.jobId[0] : _req.params.jobId;
            const result = this.jobResults.get(jobId);

            if (!result) {
                res.status(204).send();
                return;
            }

            res.json(result);
        } catch (error) {
            logError('[GetResult] Error:', error);
            res.status(500).json({ error: 'Failed to retrieve job result' });
        }
    }

    /**
     * 公開設定エンドポイント
     */
    private handlePublicConfig(_req: Request, res: express.Response): void {
        try {
            const config = this.config.get();
            const publicConfig = {
                image: {
                    default: config.image.default,
                    available: config.image.available,
                },
                workflows: config.workflows,
                logging: {
                    timeZone: config.logging?.timeZone || 'Asia/Tokyo',
                }
            };

            res.json(publicConfig);
        } catch (error) {
            logError('[PublicConfig] Error:', error);
            res.status(500).json({ error: 'Failed to retrieve configuration' });
        }
    }

    /**
     * 生成エンドポイント
     */
    private async handleGenerate(req: Request, res: express.Response): Promise<void> {
        try {
            const config = this.config.get();
            const allowedWorkflowNames = getAllowedWorkflowIdentifiers(this.config);

            // パラメータのバリデーション
            const validation = validateParams(req.body, {
                allowedWidths: this.allowedWidths,
                allowedHeights: this.allowedHeights,
                allowedWorkflowNames,
            });

            if (!validation.valid) {
                logError('[Generate] Validation error:', validation.error);
                res.status(400).json({ error: validation.error });
                return;
            }

            const { positivePrompt, negativePrompt, seed: userRequestSeed, width, height, workflowIdentifier, requiredInputs } = req.body;

            // シード値を BigInt に変換
            let seed: bigint;
            try {
                seed = BigInt(userRequestSeed);
            } catch {
                logError('[Generate] Invalid seed value:', userRequestSeed);
                res.status(400).json({ error: 'Invalid seed value' });
                return;
            }

            // Job ID を生成
            const jobId = ulid();

            // ワークフローを決定
            const workflowConfig = config.workflows.find(wf => wf.workflowIdentifier === workflowIdentifier);

            const isEnabledWorkflow = workflowConfig?.enabled ?? false;
            if (!isEnabledWorkflow) {
                logError(`[Generate] Workflow ${workflowIdentifier} is disabled`);
                res.status(400).json({ error: `Workflow ${workflowIdentifier} is disabled` });
                return;
            }

            // ワークフローテンプレートを読み込む
            const workflowPath = path.join('workflows', workflowConfig?.jsonFile || 'default_template.json');
            let template: string;
            try {
                template = loadWorkflowTemplate(workflowPath, process.cwd());
            } catch (error) {
                logError(`[Generate] Workflow Load Error: ${error}`);
                res.status(500).json({ error: `Failed to load workflow: ${error}` });
                return;
            }

            const promptParams: PromptParams = {
                checkpointName: workflowConfig?.variables?.checkpointName as string || 'default.safetensors',
                positivePrompt,
                negativePrompt,
                seed,
                steps: workflowConfig?.variables?.steps as number || 25,
                cfg: workflowConfig?.variables?.cfg as number || 5,
                samplerName: workflowConfig?.variables?.samplerName as string || 'euler',
                width,
                height,
                requiredInputs,
            }

            // ワークフローを生成
            let workflowJson: string;
            try {
                workflowJson = populateWorkflow(jobId, template, promptParams);
            } catch (error) {
                if (this.config.getLogLevel() === 'TRACE') {
                    logInfo('[Generate] Request workflow error');
                }
                res.status(500).json({ error: `Failed to populate workflow: ${error}` });
                return;
            }

            // JSONパース
            let workflowObj;
            try {
                workflowObj = JSON.parse(workflowJson);
                if (this.config.getLogLevel() === 'TRACE') {
                    logInfo('[Generate] Request workflow JSON:', JSON.stringify(workflowObj, null, 2));
                }
            } catch (error) {
                res.status(500).json({ error: `Invalid workflow JSON: ${error}` });
                return;
            }

            // client_idのバリデーション
            let clientId = 'server';
            if (req.headers['x-client-id']) {
                const headerValue = String(req.headers['x-client-id']);
                if (/^[a-zA-Z0-9_-]+$/.test(headerValue) && headerValue.length <= 64) {
                    clientId = headerValue;
                }
            }

            // Clientへはここで202応答
            res.status(202).json({
                status: 'accepted',
                job_id: jobId,
                prompt_id: null,
            });

            // ComfyUI APIにリクエスト送信
            let response: Response;
            const requestBody = {
                prompt: workflowObj,
                client_id: clientId,
            };
            try {

                response = await fetch(`${this.config.getComfyUIUrl()}/prompt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
            } catch (error) {
                logError('[Fetch Error]', error);
                return;
            }

            if (!response.ok) {
                logError(`[ComfyUI API Error] Status: ${response.status}`);
                return;
            }

            const data = await response.json();
            if (data.prompt_id) {
                logInfo(`[Generate] Accepted prompt_id: ${data.prompt_id} for job_id: ${jobId}`);
                // ポーリング処理を非同期で実行（クライアント応答とは独立）
                this.pollComfyUIStatus(data.prompt_id, jobId).catch((error) => {
                    logError('[Polling Error]', error);
                });
            } else {
                logError('[Generate] Invalid response from ComfyUI API:', data);
                return;
            }

        } catch (error) {
            logError('[Generate Error]', error);
        }
    }

    /**
     * ComfyUI の生成完了をポーリング
     * 2秒間隔でComfyUI APIを確認して、画像生成の完了を待つ
     */
    private async pollComfyUIStatus(promptId: string, jobId: string, maxAttempts: number = 600): Promise<void> {
        let attempts = 0;
        const maxWaitMs = 60 * 60 * 1000; // 最大1時間
        const startTime = Date.now();

        while (attempts < maxAttempts) {
            try {
                // 2秒待機
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;

                // ComfyUIの履歴を確認
                const history = await fetchHistoryFromComfyUI(this.config.getComfyUIUrl(), promptId);

                // promptIdが履歴に存在し、かつ結果が返されている場合は完了
                if (history && history[promptId]) {
                    const result = history[promptId];
                    logInfo(`[Polling] Completed - prompt_id: ${promptId}, job_id: ${jobId}`);

                    // 画像情報を抽出
                    const imageInfo: Array<{
                        filename: string;
                        subfolder: string;
                        type: string;
                    }> = [];

                    if (result.outputs) {
                        // outputsから画像情報を抽出
                        Object.entries(result.outputs).forEach(([_key, value]: [string, any]) => {
                            if (value.images && Array.isArray(value.images)) {
                                value.images.forEach((img: any) => {
                                    imageInfo.push({
                                        filename: img.filename,
                                        subfolder: img.subfolder || '',
                                        type: img.type || 'output',
                                    });
                                });
                            }
                        });
                    }

                    // 結果をキャッシュ
                    const completionResult: JobCompletionResult = {
                        jobId,
                        promptId,
                        status: 'completed',
                        imageInfo: imageInfo.length > 0 ? imageInfo : undefined,
                        completedAt: Date.now(),
                    };
                    this.jobResults.set(jobId, completionResult);

                    logDebug(`[Polling] Result cached for job_id: ${jobId}, imageInfo:`, JSON.stringify(imageInfo));
                    return;
                }

                // 最大待機時間を超過した場合は終了
                if (Date.now() - startTime > maxWaitMs) {
                    logError(`[Polling] Timeout - prompt_id: ${promptId}, job_id: ${jobId}`);

                    const timeoutResult: JobCompletionResult = {
                        jobId,
                        promptId,
                        status: 'timeout',
                        error: 'Generation timed out after 1 hour',
                        completedAt: Date.now(),
                    };
                    this.jobResults.set(jobId, timeoutResult);
                    return;
                }

            } catch (error) {
                logError(`[Polling] Error on attempt ${attempts}:`, error);
                // エラーが発生しても続行
                continue;
            }
        }

        logError(`[Polling] Max attempts reached - prompt_id: ${promptId}, job_id: ${jobId}`);
        const failResult: JobCompletionResult = {
            jobId,
            promptId,
            status: 'failed',
            error: `Max polling attempts (${maxAttempts}) reached`,
            completedAt: Date.now(),
        };
        this.jobResults.set(jobId, failResult);
    }

    /**
     * ComfyUI API プロキシミドルウェアを作成
     */
    private createComfyUIApiProxy(): express.RequestHandler {
        return (req: any, res: any, next: any) => {
            // パスを書き換える
            req.url = req.url.replace(/^\/comfyui\/api/, '');

            const proxy = createProxyMiddleware({
                target: this.config.getComfyUIUrl(),
                changeOrigin: true,
                ws: false,
                logger: {
                    log: () => {
                        logInfo(`[Proxy] ${req.method} ${req.originalUrl}`);
                    },
                    debug: () => undefined,
                    info: () => undefined,
                    warn: () => undefined,
                    error: () => {
                        logError(`[Proxy Error]`);
                    },
                } as any,
            } as any);

            proxy(req, res, next);
        };
    }


    /**
     * サーバーを初期化して起動
     */
    public async start(): Promise<void> {
        try {
            // 設定を読み込む
            await this.config.load();
            const config = this.config.get();

            // 画像サイズを初期化
            const sizes = parseAllowedSizes(
                config.image.available.widths.join(','),
                config.image.available.heights.join(',')
            );
            this.allowedWidths = sizes.allowedWidths;
            this.allowedHeights = sizes.allowedHeights;

            // HTTPサーバーをセットアップ
            this.setupServerHandlers();

            // サーバーを起動
            this.server.listen(config.server.port, () => {
                logInfo(`[Server] Listening on port ${config.server.port}`);
            });

        } catch (error) {
            logError('[Server] Failed to start:', error);
            process.exit(1);
        }
    }

    /**
     * サーバーイベントハンドラーをセットアップ
     */
    private setupServerHandlers(): void {
        if (!this.server) return;

        this.server.on('connection', (socket: Socket) => {
            this.activeConnections.add(socket);
            socket.on('close', () => {
                this.activeConnections.delete(socket);
            });

            if (this.isShuttingDown) {
                socket.end();
            }
        });
    }

}

// サーバー起動
const server = new ProxyServer();
server.start();

export default ProxyServer;
