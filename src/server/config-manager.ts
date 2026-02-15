/**
 * YAML設定管理クラス
 */

import path from 'path';
import fs from 'fs';
import { logInfo, logError } from './utils';
import type { GlobalConfig, WorkflowConfig } from './types';

export class ConfigManager {
    private config: GlobalConfig | null = null;

    /**
     * YAML設定ファイルを読み込み
     * 環境に応じて config.dev.yaml または config.prod.yaml を読み込む
     */
    async load(): Promise<GlobalConfig> {
        try {
            const isDevelopment = process.env.NODE_ENV === 'development';
            const configFileName = isDevelopment ? 'config.dev.yaml' : 'config.yaml';
            const configPath = path.join(process.cwd(), 'config', configFileName);

            // ファイルシステムから読み込み
            const yamlText = fs.readFileSync(configPath, 'utf-8');

            // js-yaml は動的インポートで使用
            const { load } = await import('js-yaml');
            this.config = load(yamlText) as GlobalConfig;

            logInfo(`[Config] Loaded ${configFileName} successfully`);
            return this.config;
        } catch (error) {
            logError(`[Config] Error loading YAML config:`, error);
            throw new Error(`Failed to load configuration: ${error}`);
        }
    }

    /**
     * 設定を取得
     */
    get(): GlobalConfig {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
        return this.config;
    }

    /**
     * ワークフロー設定取得
     */
    getWorkflow(): WorkflowConfig[] {
        return this.get().workflows;
    }

    /**
     * 許可された画像幅と高さを取得
     */
    getAllowedImageSizes(): { widths: number[]; heights: number[] } {
        const config = this.get();
        return {
            widths: config.image.available.widths || [],
            heights: config.image.available.heights || [],
        };
    }

    /**
     * デフォルト画像サイズを取得
     */
    getDefaultImageSize(): { width: number; height: number } {
        return this.get().image.default;
    }

    /**
     * ポート番号を取得
     */
    getPort(): number {
        return this.get().server.port;
    }

    /**
     * ComfyUIのURLを取得
     */
    getComfyUIUrl(): string {
        return this.get().server.comfyuiUrl;
    }

    /**
     * ログレベルを取得
     */
    getLogLevel(): string {
        return (this.get().logging.level || 'INFO').toUpperCase();
    }

    /**
     * タイムゾーンを取得
     */
    getTimeZone(): string {
        return this.get().logging.timeZone || 'Asia/Tokyo';
    }
}

export default ConfigManager;
