/**
 * プロンプトテンプレート階層表示の共有ユーティリティ
 */

import { saveTemplateToIndexedDB } from '../indexed-db-storage';
import { PromptTemplate } from '../types';
import { generateULID, getCurrentTimestamp } from '../utils';

/**
 * テンプレート階層構造をレンダリング
 */
export function renderTemplateHierarchy(
    allTemplates: PromptTemplate[],
    renderItemCallback: (template: PromptTemplate, depth: number) => string
): string {
    if (allTemplates.length === 0) {
        return '';
    }

    // ルートテンプレートを取得（parentIdがない）
    const rootTemplates = allTemplates
        .filter((t: PromptTemplate) => !t.parentId)
        .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

    return rootTemplates
        .map((template: PromptTemplate) => renderTemplateItemWithChildren(template, allTemplates, renderItemCallback, 0))
        .join('');
}

/**
 * テンプレートアイテムとその子要素をレンダリング
 */
function renderTemplateItemWithChildren(
    template: PromptTemplate,
    allTemplates: PromptTemplate[],
    renderItemCallback: (template: PromptTemplate, depth: number) => string,
    depth: number
): string {
    const itemHtml = renderItemCallback(template, depth);

    // 子テンプレートを取得
    const children = allTemplates
        .filter((t: PromptTemplate) => t.parentId === template.id)
        .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

    if (children.length === 0) {
        return itemHtml;
    }

    // 子要素のHTMLを生成
    const childrenHtml = children
        .map((child: PromptTemplate) => renderTemplateItemWithChildren(child, allTemplates, renderItemCallback, depth + 1))
        .join('');

    return `${itemHtml}${childrenHtml}`;
}

/**
 * テンプレートが親ラベルかどうかを判定
 */
export function isParentLabel(template: PromptTemplate): boolean {
    return Boolean(!template.positivePrompt && !template.parentId);
}

/**
 * テンプレートが実プロンプトを持つかどうかを判定
 */
export function hasPromptContent(template: PromptTemplate): boolean {
    return template.type === 'template' && Boolean(template.positivePrompt);
}

/**
 * 履歴からプロンプトをテンプレートとしてクイックセーブ
 */
export async function quickSaveTemplate(
    positivePrompt: string,
    negativePrompt: string
): Promise<void> {
    try {
        // テンプレート名の入力を求める
        const templateName = prompt('テンプレート名を入力してください:', `Template_${new Date().toLocaleString('ja-JP')}`);

        if (templateName === null || templateName.trim() === '') {
            return;
        }

        // テンプレートデータを作成
        const templateId = generateULID();
        const timestamp = getCurrentTimestamp();
        const template: PromptTemplate = {
            id: templateId,
            type: 'template',
            name: templateName.trim(),
            positivePrompt,
            negativePrompt,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        // IndexedDBに保存
        await saveTemplateToIndexedDB(template);

        alert(`「${templateName}」をテンプレートとして保存しました！`);
    } catch (error) {
        console.error('Failed to save template:', error);
        alert(`テンプレートの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}
