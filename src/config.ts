/**
 * パブリック設定の型定義と動的読み込み
 * サーバーの /api/public-config エンドポイントから
 * 機密情報を除いた必要な設定のみを取得する
 *
 * セキュリティ: 機密情報（ComfyUI APIエンドポイント等）は
 * このエンドポイントには含まれません
 */

import { PublicConfig } from "./types";

let config: PublicConfig | null = null;

/**
 * デフォルト設定を返す
 * fetch失敗時やレスポンスが無効時に使用
 */
export function getDefaultConfig(): PublicConfig {
    return {
        image: {
            default: {
                width: 1024,
                height: 1024,
            },
            available: {
                widths: [1024],
                heights: [1024],
            },
        },
        workflows: [
            {
                workflowIdentifier: 'InactiveWorkflow',
                enabled: false,
            }
        ],
        logging: {
            timeZone: 'Asia/Tokyo',
        },
    };
}

/**
 * サーバーの /api/public-config エンドポイントから
 * 公開可能な設定のみを取得する（初期化を含む）
 *
 * 機密情報（ComfyUI APIホスト、URL等）は含まれません
 */
export async function getConfig(): Promise<PublicConfig> {
    if (config) {
        return config;
    }

    try {
        const configPath = '/api/public-config'
        console.log(`[Config] Fetching public configuration from: ${configPath}`)

        const response = await fetch(configPath)
        if (!response.ok) {
            console.warn(`[Config] Failed to fetch public config: ${response.status} ${response.statusText}. Using default configuration.`)
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as unknown as PublicConfig

        if (!data) {
            console.warn('[Config] Config response is empty or invalid. Using default configuration.')
            throw new Error('Invalid config data')
        }

        config = data

        // デバッグ用ログ
        console.log('[Config] Public configuration initialized:', {
            protocol: window.location.protocol,
            host: window.location.host,
            workflows: config.workflows,
            imageSizes: {
                default: config.image.default,
                available: config.image.available,
            },
            logging: config.logging,
        });

        return config;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[Config] Error loading configuration:', errorMsg)
        throw error
    }
}
