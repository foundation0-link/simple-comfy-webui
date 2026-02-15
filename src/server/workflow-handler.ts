/**
 * ワークフロー生成とバリデーション
 * ComfyUI ワークフローJSONの生成、パラメータのバリデーションを管理
 */

import fs from 'fs';
import path from 'path';
import ConfigManager from './config-manager';
import { PromptParams, ValidationOptions, ValidationResult } from './types';

/**
 * ワークフローテンプレートを読み込む（セキュリティチェック付き）
 * workflowPath ごとにキャッシュを保持し、複数のワークフロー対応
 */
export function loadWorkflowTemplate(workflowPath: string, basePath?: string): string {
    // キャッシュキーを生成（basePath を含めることで異なるベースパスでの読み込みに対応）
    const base = basePath || process.cwd();

    // パスインジェクション対策: 相対パスや親ディレクトリ参照を禁止
    const normalizedPath = path.normalize(workflowPath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid workflow path: path traversal detected');
    }

    const templatePath = path.join(base, normalizedPath);
    const realPath = fs.realpathSync(templatePath);
    const realBasePath = fs.realpathSync(base);

    // 実パスがベースディレクトリ配下にあることを確認
    if (!realPath.startsWith(realBasePath)) {
        throw new Error('Invalid workflow path: outside of allowed directory');
    }

    const template = fs.readFileSync(realPath, 'utf-8');

    return template;
}

/**
 * 許可されたワークフロー名のリストを取得（ConfigManagerから）
 * config.yaml の workflow.getAllowedWorkflowIdentifiers に記載されたものだけを返す
 */
export function getAllowedWorkflowIdentifiers(config: ConfigManager): string[] {
    const identifiers = config.getWorkflow();
    return identifiers
        .map((v: { workflowIdentifier: string }) => v.workflowIdentifier.trim())
        .filter((v: string) => v.length > 0)
        .sort();
}

/**
 * ワークフロー名がホワイトリストに含まれているか確認
 */
export function isValidWorkflowName(workflowName: string, allowedNames: string[]): boolean {
    // ファイル名に含まれてはいけない文字のチェック
    if (!/^[\w\-.]+\.json$/i.test(workflowName)) {
        return false;
    }

    // パストラバーサル対策
    if (workflowName.includes('..') || workflowName.includes('/') || workflowName.includes('\\')) {
        return false;
    }

    // ホワイトリストチェック
    return allowedNames.includes(workflowName);
}

/**
 * JSON文字列用のエスケープ処理
 * JSON.stringify を使用してすべての特殊文字を安全にエスケープ
 */
export function escapeJsonString(str: string): string {
    // JSON.stringify は Unicode を含むすべての特殊文字を正しくエスケープ
    // 前後のダブルクォートを除去して値部分だけを返す
    return JSON.stringify(str).slice(1, -1);
}

/**
 * ワークフローにパラメータを埋め込む
 */
export function populateWorkflow(jobId: string, template: string, promptParams: PromptParams): string {
    // requiredInputs を最初に処理
    Object.entries(promptParams.requiredInputs).forEach(([key, value]) => {
        const escapedValue = escapeJsonString(String(value));
        template = template.replace(new RegExp(`\{\{${key}\}\}`, 'g'), escapedValue);
    });

    return template
        .replace(/\{\{checkpoint_name\}\}/g, promptParams.checkpointName)
        .replace(/\{\{seed\}\}/g, promptParams.seed.toString())
        .replace(/\{\{steps\}\}/g, String(promptParams.steps))
        .replace(/\{\{cfg\}\}/g, String(promptParams.cfg))
        .replace(/\{\{sampler_name\}\}/g, String(promptParams.samplerName))
        .replace(/\{\{width\}\}/g, String(promptParams.width))
        .replace(/\{\{height\}\}/g, String(promptParams.height))
        .replace(/\{\{request_job_id\}\}/g, String(jobId))
        .replace(/\{\{positive_prompt\}\}/g, escapeJsonString(promptParams.positivePrompt))  // 最後のほうではないと駄目(意図しないincorrectな置換が起きる可能性があるため)
        .replace(/\{\{negative_prompt\}\}/g, escapeJsonString(promptParams.negativePrompt)); // 最後のほうではないと駄目(意図しないincorrectな置換が起きる可能性があるため)
}

/**
 * パラメータのバリデーション
 */
export function validateParams(params: PromptParams, options: ValidationOptions): ValidationResult {
    // プロンプト最大文字数（DoS攻撃対策）
    const MAX_PROMPT_LENGTH = options.maxPromptLength || 5000;

    // 必須フィールドのチェック
    if (!params.positivePrompt || typeof params.positivePrompt !== 'string') {
        return { valid: false, error: 'positivePrompt is required and must be a string' };
    }

    if (params.positivePrompt.length > MAX_PROMPT_LENGTH) {
        return { valid: false, error: `positivePrompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
    }

    if (typeof params.negativePrompt !== 'string') {
        return { valid: false, error: 'negativePrompt must be a string' };
    }

    if (params.negativePrompt.length > MAX_PROMPT_LENGTH) {
        return { valid: false, error: `negativePrompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
    }

    // シード値の検証（文字列、数値、BigInt を受け付ける）
    if (params.seed === undefined || params.seed === null) {
        return { valid: false, error: 'seed is required' };
    }

    let actualSeed: bigint;
    try {
        // 文字列または数値を BigInt に変換
        actualSeed = BigInt(params.seed);
    } catch (error) {
        return { valid: false, error: 'seed must be a valid integer' };
    }

    if (actualSeed < BigInt(0) || actualSeed > BigInt('9223372036854775807')) {
        return { valid: false, error: 'seed must be between 0 and 2^63-1' };
    }

    // 画像サイズの検証
    if (!options.allowedWidths.includes(params.width)) {
        return { valid: false, error: `width must be one of: ${options.allowedWidths.join(', ')}` };
    }

    if (!options.allowedHeights.includes(params.height)) {
        return { valid: false, error: `height must be one of: ${options.allowedHeights.join(', ')}` };
    }

    return { valid: true };
}

/**
 * 環境変数から許可リストを解析
 */
export function parseAllowedSizes(widthList: string, heightList: string): {
    allowedWidths: number[];
    allowedHeights: number[];
} {
    const allowedWidths = widthList
        .split(',')
        .map(w => parseInt(w.trim(), 10))
        .filter(n => !isNaN(n));

    const allowedHeights = heightList
        .split(',')
        .map(h => parseInt(h.trim(), 10))
        .filter(n => !isNaN(n));

    return { allowedWidths, allowedHeights };
}
