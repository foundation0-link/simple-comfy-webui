/**
 * 全体設定ファイルの型定義
 */
export interface GlobalConfig {
    server: {
        port: number;
        comfyuiUrl: string;
    };
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
        level: string;
        timeZone: string;
    };
}

/**
 * 生成ジョブ情報
 */
export interface GenerateJob {
    jobId: string; // ユニークなジョブID(ULID)
    promptId: string; // ComfyUIのプロンプトID
    params: PromptParams; // ワークフローパラメータ
    attempts: number;  // 試行回数
    startTime: number; // ジョブ開始時間のタイムスタンプ
}

/**
 * ジョブ完了時のコールバック関数型
 */
export type JobCompletionCallback = (
    job: GenerateJob,
    base64Data: string | null,
    mimeType: string | null,
    imageInfo: any,
    imageIdx: number,
    imageLength: number
) => Promise<void>;

/**
 * ワークフロー 設定
 */
export interface WorkflowConfig {
    workflowIdentifier: string; // ワークフロー識別子
    jsonFile?: string; // ワークフローテンプレートのJSONファイル名
    enabled?: boolean; // 有効/無効
    variables?: { // ワークフロー変数
        imageFileFormat: string;
        checkpointName?: string;
        samplerName?: string;
        steps?: number;
        cfg?: number;
    };
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

/**
 * プロンプトパラメータの型定義
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
}

/**
 * バリデーション結果の型定義
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * バリデーションオプション
 */
export interface ValidationOptions {
    allowedWidths: number[];
    allowedHeights: number[];
    allowedWorkflowNames?: string[];
    maxPromptLength?: number;
}

/**
 * ジョブ完了結果（画像情報を含む）
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
