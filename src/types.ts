/**
 * 型定義
 */

/**
 * 公開提供される設定
 */
export interface PublicConfig {
    image: {
        default: {
            width: number;
            height: number;
        };
        available: {
            widths: number[];
            heights: number[];
        };
    };
    workflows: WorkflowConfig[];
    logging: {
        timeZone: string;
    };
}

/**
 * ワークフロー 設定
 */
export interface WorkflowConfig {
    workflowIdentifier: string; // ワークフロー識別子
    enabled?: boolean; // 有効/無効
    requiredInputs?: WorkflowRequiredInput[]; // HTML必須入力フィールド
}

export interface WorkflowRequiredInput {
    name: string;
    key: string;
    type: 'text' | 'number' | 'url';
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    default?: string | number;
}

// 生成パラメータ
export interface RequestPromptParams {
    positivePrompt: string;
    negativePrompt: string;
    userSeed: string; // ユーザー入力のシード値（-1 または指定値）
    seed: string | bigint;
    width: number;
    height: number;
    workflowIdentifier: string; // 選択されたワークフロー識別子
    requiredInputs?: Record<string, any>; // 追加の任意パラメータ
}

// ジョブの状態
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

// ジョブ情報
export interface RequestJob {
    jobId: string | null; // server 側で生成されるジョブID(ULID)
    promptId?: string; // ComfyUI APIから返されるprompt_id（WebSocketイベントマッチング用）
    status: JobStatus;
    requestPromptParams: RequestPromptParams; // ユーザが入力した生成パラメータ
    userSeed: string; // ユーザー入力のオリジナルシード値を保持
    createdAt: number;
    completedAt?: number;
    error?: string;
}

// 履歴エントリ（LocalStorage用 - メタデータのみ）
export interface HistoryEntry {
    id: string; // IndexedDB用の一次なID（Primary Key）
    createdAt: number; // UNIX タイムスタンプ（秒）
    isFavorite?: boolean; // お気に入りマーク（デフォルト: false）
}

// セッション状態
export interface SessionState {
    imagesStore: Map<string, Blob>;
}

// UI設定の永続化（LocalStorage用）
export interface UIPreferences {
    positivePromptHeight: number; // ピクセル単位
    negativePromptHeight: number; // ピクセル単位
}

// JSON シリアライズ可能な履歴エントリ
export interface SerializableHistoryEntry {
    id: string; // IndexedDB用の一意なID（Primary Key）
    createdAt: number;
    imageInfo?: { filename: string; subfolder: string; type: string };
}

// リアルタイム画像エントリ
export interface RealtimeImageEntry {
    promptId: string;
    imageUrl: string;
    positivePrompt: string;
    negativePrompt: string;
    workflowIdentifier: string;
    seed: string;
    width: number;
    height: number;
    timestamp: number;
}

// 画像エントリ（IndexedDB用）
export interface ImageEntry {
    id: string; // ブラウザ側で生成されるローカルジョブID（IndexedDBキー用）
    blob: Blob;
    createdAt: number; // UNIXタイムスタンプ（秒）
    fileExtension: string; // ファイル拡張子（例: png, jpg）
    mimeType: string; // MIMEタイプ（ダウンロード時の拡張子決定に使用）
    userSeed: string; // ユーザー入力のオリジナルシード値（-1またはユーザー指定値）
    promptParams: PromptParams; // プロンプトパラメータ
    serverJobId?: string; // サーバー側で生成されるジョブID（prompt_id）- ファイル名生成用
}

// プロンプトテンプレート
export interface PromptTemplate {
    id: string; // ULIDなどのユニークなID
    type: 'template' | 'label'; // テンプレートかラベルか
    name: string; // テンプレート名
    positivePrompt: string; // ポジティブプロンプト
    negativePrompt: string; // ネガティブプロンプト
    createdAt: number; // 作成日時（UNIXタイムスタンプ・秒）
    updatedAt?: number; // 更新日時（UNIXタイムスタンプ・秒）
    parentId?: string; // 親テンプレートのID（null = ルート）
    order?: number; // 表示順序（同じ階層内での順序）
}

// ComfyUI API の画像生成レスポンス
export interface RequestPromptResponse {
    status: 'accepted';
    job_id: string;
}

// 履歴レスポンスの型定義（ComfyUI API からのレスポンス）
export interface HistoryResponse {
    [promptId: string]: {
        prompt: unknown[];
        outputs: {
            [nodeId: string]: {
                images?: Array<{
                    filename: string;
                    subfolder: string;
                    type: string;
                }>;
            };
        };
    };
}

/**
 * 抽出したプロンプトのメタデータ
 */
export interface StoredPromptMetadata {
    prompt?: string;
    negativePrompt?: string;
    seed?: string | number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    model?: string;
    vae?: string;
    [key: string]: string | number | undefined;
}

/**
 * 永続化された画像エントリ
 */
export interface StoredImage {
    id: string;
    createdAt: number;
    url: string;
    mimeType: string;
    fileExtension: string;
}

/**
 * ComfyUI(Pixel Socket) からの通知メッセージ
 */
export interface NotificationFromPixelSocket {
    jobId: string;
    blobData: Uint8Array | null;
    imageLength: number;
    fileExtension: string;
    mimeType: string;
    objectUrl: string | null; // Object Storageに保管されている場合に付与
    secretToken: string;
    timestamp: number;
    promptParams?: Record<string, any>; // 任意のプロンプトパラメータ
}

/**
 * サーバ側で利用されるプロンプトパラメータの型定義
 */
export interface PromptParams {
    checkpointName: string;
    positivePrompt: string;
    negativePrompt: string;
    seed: string | bigint;
    steps: number;
    cfg: number;
    samplerName: string;
    width: number;
    height: number;
    requiredInputs: Record<string, string | number>;
    imageFileFormat: string; // server 限定
    secretToken: string; // server 限定
    websocketUrl: string; // server 限定
}

/**
 * ジョブ完了結果（サーバーから返されます）
 */
export interface JobCompletionResult {
    jobId: string;
    promptId: string;
    status: 'completed' | 'failed' | 'timeout';
    imageInfo?: Array<{
        filename: string;
        subfolder: string;
        type: string;
    }>;
    error?: string;
    completedAt: number;
}
