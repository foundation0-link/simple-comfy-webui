/**
 * プロンプトテンプレート管理ページ
 * テンプレートのCRUD、Import/Export機能
 */

import '../prompt-template.css';
import { PromptTemplate } from '../types';
import { escapeHtml, generateULID, getCurrentTimestamp } from '../utils';
import {
    getAllTemplatesFromIndexedDB,
    getTemplateFromIndexedDB,
    saveTemplateToIndexedDB,
    deleteTemplateFromIndexedDB,
    clearAllTemplatesFromIndexedDB,
} from '../indexed-db-storage';
import { initializeMenu } from '../menu';

class PromptTemplateManager {
    private app: HTMLElement;
    private currentEditingId: string | null = null;
    private draggedTemplateId: string | null = null;
    private expandedTemplateIds: Set<string> = new Set(); // 展開状態を管理

    // DOM要素（キャッシュ）
    private templateNameInput: HTMLInputElement | null = null;
    private positivePromptInput: HTMLTextAreaElement | null = null;
    private negativePromptInput: HTMLTextAreaElement | null = null;
    private buttonGroupContainer: HTMLDivElement | null = null;
    private resetFormBtn: HTMLButtonElement | null = null;
    private templateListContainer: HTMLDivElement | null = null;
    private statusMessage: HTMLDivElement | null = null;
    private importBtn: HTMLButtonElement | null = null;
    private exportBtn: HTMLButtonElement | null = null;
    private clearAllBtn: HTMLButtonElement | null = null;
    private fileInput: HTMLInputElement | null = null;
    private createAsParentOnlyCheckbox: HTMLInputElement | null = null;
    private promptSectionsContainer: HTMLDivElement | null = null;
    private promptViewDialog: HTMLDivElement | null = null;

    constructor(containerId: string) {
        const appElement = document.getElementById(containerId);
        if (!appElement) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        this.app = appElement;
    }

    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        try {
            // app 要素を初期化
            this.app = document.getElementById('app') || document.body;

            // UI をレンダリング
            this.renderUI();

            // DOM要素をキャッシュ
            this.cacheElements();

            // イベントリスナーを設定
            this.setupEventListeners();

            // テンプレート一覧を表示
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to initialize PromptTemplateManager:', error);
            this.showStatus('ページの読み込みに失敗しました', 'error');
        }
    }

    /**
     * UI をレンダリング
     */
    private renderUI(): void {
        this.app.innerHTML = `
            <div class="main-content-wrapper" id="main-content-wrapper">
            <div class="header-container">
                <h1>プロンプトテンプレート</h1>
            </div>

            <div class="main-layout">
                <!-- 左側：テンプレートリスト -->
                <div class="left-panel">
                    <div class="form-container">
                        <h2>保存済みテンプレート</h2>

                        <div class="action-buttons">
                            <button class="btn btn-secondary" id="importBtn">インポート</button>
                            <button class="btn btn-secondary" id="exportBtn">エクスポート</button>
                            <button class="btn btn-danger" id="clearAllBtn">すべて削除</button>
                        </div>

                        <div id="templateListContainer" style="min-height: 200px; padding-top: 1rem;">
                            <div class="empty-message">テンプレートはまだありません</div>
                        </div>
                    </div>
                </div>

                <!-- 右側：フォーム -->
                <div class="right-panel">
                    <div class="form-container">
                        <h2>テンプレート作成/編集</h2>

                        <div id="statusMessage" class="status-message"></div>

                        <div class="form-group">
                        <label>
                            <input type="checkbox" id="createAsParentOnly" />
                            <span>親ラベルとして作成（プロンプト不要）</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label for="templateName">テンプレート名 *</label>
                        <input type="text" id="templateName" placeholder="例: 高品質なポートレート" />
                    </div>

                    <div class="prompt-sections" id="promptSections">
                        <div class="form-group">
                            <label for="positivePrompt">ポジティブプロンプト *</label>
                            <textarea id="positivePrompt" placeholder="生成したい画像の説明を入力..."></textarea>
                        </div>

                        <div class="form-group">
                            <label for="negativePrompt">ネガティブプロンプト</label>
                            <textarea id="negativePrompt" placeholder="避けたい要素を入力..."></textarea>
                        </div>
                    </div>

                    <div class="button-group" id="buttonGroup">
                        <button class="btn btn-primary" id="saveTemplateBtn">保存</button>
                        <button class="btn btn-secondary" id="resetFormBtn">リセット</button>
                    </div>
                    </div>
                </div>
            </div>

            <!-- 隠し要素：ファイルインポート用 -->
            <input type="file" id="fileInput" accept=".json" style="display: none;" />

            <!-- プロンプト表示ダイアログ -->
            <div id="promptViewDialog" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="promptViewTitle"></h2>
                        <button class="modal-close" id="promptViewClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="prompt-view-section">
                            <label>ポジティブプロンプト</label>
                            <div id="promptViewPositive" class="prompt-view-content"></div>
                        </div>
                        <div class="prompt-view-section">
                            <label>ネガティブプロンプト</label>
                            <div id="promptViewNegative" class="prompt-view-content"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="promptViewCloseBtn">閉じる</button>
                    </div>
                </div>
            </div>
            </div>
        `;

        // メニューを初期化（ツール機能なし）
        initializeMenu({});
    }

    /**
     * DOM 要素をキャッシュ
     */
    private cacheElements(): void {
        this.templateNameInput = document.getElementById('templateName') as HTMLInputElement;
        this.positivePromptInput = document.getElementById('positivePrompt') as HTMLTextAreaElement;
        this.negativePromptInput = document.getElementById('negativePrompt') as HTMLTextAreaElement;
        this.buttonGroupContainer = document.getElementById('buttonGroup') as HTMLDivElement;
        this.resetFormBtn = document.getElementById('resetFormBtn') as HTMLButtonElement;
        this.templateListContainer = document.getElementById('templateListContainer') as HTMLDivElement;
        this.statusMessage = document.getElementById('statusMessage') as HTMLDivElement;
        this.importBtn = document.getElementById('importBtn') as HTMLButtonElement;
        this.exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
        this.clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement;
        this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
        this.createAsParentOnlyCheckbox = document.getElementById('createAsParentOnly') as HTMLInputElement;
        this.promptSectionsContainer = document.getElementById('promptSections') as HTMLDivElement;
        this.promptViewDialog = document.getElementById('promptViewDialog') as HTMLDivElement;
    }

    /**
     * イベントリスナーを設定
     */
    private setupEventListeners(): void {
        this.resetFormBtn?.addEventListener('click', async () => await this.handleResetForm());
        this.importBtn?.addEventListener('click', () => this.fileInput?.click());
        this.exportBtn?.addEventListener('click', () => this.handleExportTemplates());
        this.clearAllBtn?.addEventListener('click', () => this.handleClearAllTemplates());
        this.fileInput?.addEventListener('change', (e) => this.handleImportTemplates(e));

        // 親ラベルチェックボックスの変更を監視
        this.createAsParentOnlyCheckbox?.addEventListener('change', () => this.handleParentOnlyToggle());

        // ボタングループのイベント委譲
        this.buttonGroupContainer?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.id === 'saveTemplateBtn' || target.classList.contains('btn-save')) {
                this.handleSaveTemplate();
            } else if (target.id === 'addTemplateBtn' || target.classList.contains('btn-add-new')) {
                this.handleAddAsNewTemplate();
            } else if (target.id === 'resetFormBtn') {
                this.handleResetForm();
            }
        });

        // テンプレートリストのイベントリスナーをセットアップ（重複防止）
        this.setupTemplateListEventListeners();

        // プロンプト表示ダイアログのクローズボタン
        const promptViewClose = document.getElementById('promptViewClose') as HTMLButtonElement;
        const promptViewCloseBtn = document.getElementById('promptViewCloseBtn') as HTMLButtonElement;
        promptViewClose?.addEventListener('click', () => this.closePromptViewDialog());
        promptViewCloseBtn?.addEventListener('click', () => this.closePromptViewDialog());

        // ダイアログ背景クリックでクローズ
        this.promptViewDialog?.addEventListener('click', (e) => {
            if (e.target === this.promptViewDialog) {
                this.closePromptViewDialog();
            }
        });
    }

    /**
     * テンプレートリストのイベントリスナーをセットアップ
     * 毎回の renderTemplateList で新しいリスナーを追加しないようにする
     */
    private setupTemplateListEventListeners(): void {
        if (!this.templateListContainer) return;

        // 既存のリスナーをクリアするため、要素をクローン
        const newListContainer = this.templateListContainer.cloneNode(true) as HTMLDivElement;
        this.templateListContainer.parentNode?.replaceChild(newListContainer, this.templateListContainer);
        this.templateListContainer = newListContainer;

        // テンプレートリストのイベントリスナー（イベント委譲）
        this.templateListContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // btn-toggle-children またはその子要素をクリックした場合
            const toggleBtn = target.closest('.btn-toggle-children');
            if (toggleBtn) {
                const templateId = toggleBtn.getAttribute('data-template-id');
                if (templateId) {
                    this.toggleChildren(templateId);
                }
                return;
            }

            // 親ラベルのヘッダーをクリックして展開/折り畳み
            const parentLabelHeader = target.closest('.parent-label-header');
            if (parentLabelHeader && !target.closest('.btn-edit, .btn-delete')) {
                const templateId = parentLabelHeader.closest('.template-item')?.getAttribute('data-template-id');
                if (templateId) {
                    this.toggleChildren(templateId);
                }
                return;
            }

            if (target.classList.contains('btn-edit')) {
                const templateId = target.getAttribute('data-template-id');
                if (templateId) {
                    this.loadTemplate(templateId);
                }
            } else if (target.classList.contains('btn-delete')) {
                const templateId = target.getAttribute('data-template-id');
                if (templateId) {
                    this.deleteTemplate(templateId);
                }
            }
        });

        // ドラッグ&ドロップイベント
        this.templateListContainer.addEventListener('dragstart', (e) => {
            const item = (e.target as HTMLElement).closest('.template-item');
            if (item) {
                const templateId = item.getAttribute('data-template-id');
                if (templateId) {
                    this.draggedTemplateId = templateId;
                    item.classList.add('dragging');
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                    }
                }
            }
        });

        this.templateListContainer.addEventListener('dragend', (e) => {
            const item = (e.target as HTMLElement).closest('.template-item');
            if (item) {
                item.classList.remove('dragging');
            }
            this.draggedTemplateId = null;
        });

        this.templateListContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }

            // すべての drag-over クラスを削除
            if (this.templateListContainer) {
                this.templateListContainer.querySelectorAll('.drag-over').forEach((el) => {
                    el.classList.remove('drag-over');
                });
            }

            // ドロップターゲットをハイライト
            const dropTarget = (e.target as HTMLElement).closest('.template-item');
            if (dropTarget && !dropTarget.classList.contains('dragging')) {
                dropTarget.classList.add('drag-over');
            }
        });

        this.templateListContainer.addEventListener('dragleave', () => {
            // dragleave は内部要素から出るときもトリガーされるため、
            // ここではクリーンアップのみ行う（dragoverで処理済み）
        });

        this.templateListContainer.addEventListener('drop', (e) => {
            e.preventDefault();

            // すべての drag-over クラスを削除
            if (this.templateListContainer) {
                this.templateListContainer.querySelectorAll('.drag-over').forEach((el) => {
                    el.classList.remove('drag-over');
                });
            }

            const dropTarget = (e.target as HTMLElement).closest('.template-item');
            if (dropTarget && this.draggedTemplateId) {
                const targetTemplateId = dropTarget.getAttribute('data-template-id');
                if (targetTemplateId && targetTemplateId !== this.draggedTemplateId) {
                    this.handleMoveTemplate(this.draggedTemplateId, targetTemplateId);
                }
            }
        });

        // テンプレートアイテムのダブルクリック
        this.templateListContainer.addEventListener('dblclick', (e) => {
            const item = (e.target as HTMLElement).closest('.template-item');
            if (item && !['btn-edit', 'btn-delete', 'btn-toggle-children'].some(cls => (e.target as HTMLElement).classList.contains(cls))) {
                const templateId = item.getAttribute('data-template-id');
                if (templateId) {
                    this.showPromptViewDialog(templateId);
                }
            }
        });
    }

    /**
     * ボタングループをレンダリング（編集状態に応じて変更）
     */
    private async renderButtonGroup(): Promise<void> {
        if (!this.buttonGroupContainer) return;

        // 編集中のテンプレートが親ラベルかどうかを判定
        let isEditingParentLabel = false;
        if (this.currentEditingId) {
            const editingTemplate = await getTemplateFromIndexedDB(this.currentEditingId);
            isEditingParentLabel = editingTemplate ? (!editingTemplate.positivePrompt && !editingTemplate.parentId) : false;
        }

        if (this.currentEditingId) {
            if (isEditingParentLabel) {
                // 親ラベル編集モード：更新と新規として保存
                this.buttonGroupContainer.innerHTML = `
                    <button class="btn btn-primary btn-save" id="saveTemplateBtn">更新</button>
                    <button class="btn btn-secondary btn-add-new" id="addTemplateBtn">新規として保存</button>
                `;
            } else {
                // 通常のテンプレート編集モード：上書き保存と追記
                this.buttonGroupContainer.innerHTML = `
                    <button class="btn btn-primary btn-save" id="saveTemplateBtn">更新</button>
                    <button class="btn btn-secondary btn-add-new" id="addTemplateBtn">追記</button>
                `;
            }
        } else {
            // 新規作成モード：保存とリセット
            this.buttonGroupContainer.innerHTML = `
                <button class="btn btn-primary btn-save" id="saveTemplateBtn">保存</button>
                <button class="btn btn-secondary" id="resetFormBtn">リセット</button>
            `;
        }

        // キャッシュを更新
        this.resetFormBtn = document.getElementById('resetFormBtn') as HTMLButtonElement;
    }

    /**
     * 親ラベルチェックボックスの状態変更を処理
     */
    private handleParentOnlyToggle(): void {
        if (!this.promptSectionsContainer) return;

        const isParentOnly = this.createAsParentOnlyCheckbox?.checked ?? false;
        if (isParentOnly) {
            this.promptSectionsContainer.style.display = 'none';
        } else {
            this.promptSectionsContainer.style.display = 'block';
        }
    }

    /**
     * ステータスメッセージを表示
     */
    private showStatus(message: string, type: 'success' | 'error' = 'success'): void {
        if (!this.statusMessage) return;

        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message show ${type}`;

        // 3秒後に非表示
        setTimeout(() => {
            this.statusMessage?.classList.remove('show');
        }, 3000);
    }

    /**
     * テンプレートを保存
     */
    private async handleSaveTemplate(): Promise<void> {
        if (!this.templateNameInput || !this.positivePromptInput || !this.negativePromptInput) {
            return;
        }

        const name = this.templateNameInput.value.trim();
        const isParentOnly = this.createAsParentOnlyCheckbox?.checked ?? false;
        const positivePrompt = isParentOnly ? '' : this.positivePromptInput.value.trim().replace(/<br\s*\/?>/gi, '');
        const negativePrompt = isParentOnly ? '' : this.negativePromptInput.value.trim().replace(/<br\s*\/?>/gi, '');

        // バリデーション
        if (!name) {
            this.showStatus('テンプレート名を入力してください', 'error');
            return;
        }

        if (!isParentOnly && !positivePrompt) {
            this.showStatus('ポジティブプロンプトを入力してください', 'error');
            return;
        }

        try {
            const now = getCurrentTimestamp();
            const existingTemplate = this.currentEditingId
                ? await getTemplateFromIndexedDB(this.currentEditingId)
                : null;

            const template: PromptTemplate = {
                id: this.currentEditingId || generateULID(),
                type: isParentOnly ? 'label' : 'template',
                name,
                positivePrompt,
                negativePrompt,
                createdAt: existingTemplate?.createdAt || now,
                updatedAt: now,
                parentId: existingTemplate?.parentId || undefined,
                order: existingTemplate?.order || 0,
            };

            // IndexedDBに保存
            await saveTemplateToIndexedDB(template);

            const message = this.currentEditingId ? 'テンプレートを更新しました' : 'テンプレートを保存しました';
            this.showStatus(message, 'success');

            // フォームをリセット
            await this.handleResetForm();

            // テンプレート一覧を再読み込み
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to save template:', error);
            this.showStatus('テンプレートの保存に失敗しました', 'error');
        }
    }

    /**
     * テンプレートをフォームに読み込む
     */
    private async loadTemplate(id: string): Promise<void> {
        try {
            const template = await getTemplateFromIndexedDB(id);
            if (!template) {
                this.showStatus('テンプレートが見つかりません', 'error');
                return;
            }

            this.currentEditingId = id;
            if (this.templateNameInput) this.templateNameInput.value = template.name;
            if (this.positivePromptInput) this.positivePromptInput.value = template.positivePrompt;
            if (this.negativePromptInput) this.negativePromptInput.value = template.negativePrompt;

            // 親ラベルのみの場合をチェック
            const isParentOnly = !template.positivePrompt && !template.parentId;
            if (this.createAsParentOnlyCheckbox) {
                this.createAsParentOnlyCheckbox.checked = isParentOnly;
            }
            this.handleParentOnlyToggle();

            // ボタングループを再レンダリング
            await this.renderButtonGroup();

            // フォーム全体をスクロール位置トップに
            this.templateNameInput?.focus();
            this.templateNameInput?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to load template:', error);
            this.showStatus('テンプレートの読み込みに失敗しました', 'error');
        }
    }

    /**
     * テンプレートを削除
     */
    private async deleteTemplate(id: string): Promise<void> {
        try {
            // 子テンプレートを取得
            const allTemplates = await getAllTemplatesFromIndexedDB();
            const children = allTemplates.filter((t: PromptTemplate) => t.parentId === id);

            // 子テンプレートがある場合の処理
            let shouldDeleteChildren = false;
            if (children.length > 0) {
                const childrenNames = children.map((c: PromptTemplate) => `「${c.name}」`).join('、');
                const message = `このテンプレート配下に ${childrenNames} があります。\n\n` +
                    `【OK】親ラベルとともに配下のアイテムも削除します`;
                shouldDeleteChildren = confirm(message);

                if (!shouldDeleteChildren) {
                    // ignore: 何もしない
                    /*
                    // Cancel：子テンプレートを親に移動
                    const templateToDelete = allTemplates.find((t: PromptTemplate) => t.id === id);
                    const parentId = templateToDelete?.parentId;

                    for (const child of children) {
                        child.parentId = parentId;
                        child.updatedAt = getCurrentTimestamp();
                        await saveTemplateToIndexedDB(child);
                    }

                    // 親を削除
                    await deleteTemplateFromIndexedDB(id);
                    await removeTemplateMetadata(id);

                    if (this.currentEditingId === id) {
                        await this.handleResetForm();
                    }

                    this.showStatus('配下のアイテムを親に移動させて、テンプレートを削除しました', 'success');
                    await this.renderTemplateList();
                    */
                    return;
                }
            }

            if (!confirm('本当に宜しいでしょうか？ この操作は取り消せません。')) {
                return;
            }
            // YES：子テンプレートも一緒に削除
            for (const child of children) {
                await deleteTemplateFromIndexedDB(child.id);
            }

            await deleteTemplateFromIndexedDB(id);

            if (this.currentEditingId === id) {
                await this.handleResetForm();
            }

            this.showStatus('テンプレートを削除しました', 'success');
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to delete template:', error);
            this.showStatus('テンプレートの削除に失敗しました', 'error');
        }
    }

    /**
     * 子テンプレートの表示/非表示を切り替え
     */
    private toggleChildren(templateId: string): void {
        const item = this.templateListContainer?.querySelector(`[data-template-id="${templateId}"]`);
        if (!item) return;

        const childrenContainer = item.querySelector('.template-children');
        const toggleBtn = item.querySelector('.btn-toggle-children');
        const toggleIcon = toggleBtn?.querySelector('.toggle-icon');

        if (childrenContainer) {
            childrenContainer.classList.toggle('collapsed');

            // 展開状態を記録
            if (childrenContainer.classList.contains('collapsed')) {
                this.expandedTemplateIds.delete(templateId);
            } else {
                this.expandedTemplateIds.add(templateId);
            }

            // アイコンを更新
            if (toggleIcon) {
                const isCollapsed = childrenContainer.classList.contains('collapsed');
                toggleIcon.textContent = isCollapsed ? '▶' : '▼';
            }
        }
    }

    /**
     * プロンプト表示ダイアログを表示
     */
    private async showPromptViewDialog(templateId: string): Promise<void> {
        try {
            const template = await getTemplateFromIndexedDB(templateId);
            if (!template) {
                this.showStatus('テンプレートが見つかりません', 'error');
                return;
            }

            // 親ラベル（プロンプトなし）の場合は表示しない
            if (!template.positivePrompt && !template.parentId) {
                return;
            }

            const titleElement = document.getElementById('promptViewTitle');
            const positiveElement = document.getElementById('promptViewPositive');
            const negativeElement = document.getElementById('promptViewNegative');

            if (titleElement) titleElement.textContent = template.name;
            if (positiveElement) {
                positiveElement.textContent = template.positivePrompt || '（未設定）';
            }
            if (negativeElement) {
                negativeElement.textContent = template.negativePrompt || '（未設定）';
            }

            if (this.promptViewDialog) {
                this.promptViewDialog.style.display = 'flex';
            }
        } catch (error) {
            console.error('Failed to show prompt view dialog:', error);
            this.showStatus('プロンプトの表示に失敗しました', 'error');
        }
    }

    /**
     * プロンプト表示ダイアログを閉じる
     */
    private closePromptViewDialog(): void {
        if (this.promptViewDialog) {
            this.promptViewDialog.style.display = 'none';
        }
    }

    /**
     * テンプレートを移動（ドラッグ&ドロップ）
     */
    private async handleMoveTemplate(draggedId: string, targetId: string): Promise<void> {
        try {
            const allTemplates = await getAllTemplatesFromIndexedDB();
            const draggedTemplate = allTemplates.find((t: PromptTemplate) => t.id === draggedId);
            const targetTemplate = allTemplates.find((t: PromptTemplate) => t.id === targetId);

            if (!draggedTemplate || !targetTemplate || draggedId === targetId) {
                return;
            }

            const draggedIsParentLabel = draggedTemplate.type === 'label' || (!draggedTemplate.positivePrompt && !draggedTemplate.parentId);
            const targetIsParentLabel = targetTemplate.type === 'label' || (!targetTemplate.positivePrompt && !targetTemplate.parentId);

            // 循環参照チェック（親ラベルを自分の子孫に移動しようとしていないか）
            if (draggedIsParentLabel && targetTemplate.parentId) {
                const isDescendant = this.isDescendant(allTemplates, targetTemplate.parentId, draggedId);
                if (isDescendant || targetTemplate.parentId === draggedId) {
                    this.showStatus('親ラベルを自分の配下に移動することはできません', 'error');
                    return;
                }
            }

            // ケース1: 親ラベルへドロップ → 子として追加（入れ子は禁止）
            if (targetIsParentLabel && !draggedIsParentLabel) {
                draggedTemplate.parentId = targetId;
                draggedTemplate.updatedAt = getCurrentTimestamp();
                await saveTemplateToIndexedDB(draggedTemplate);

                // 親配下の順序を再計算
                await this.reorderTemplates(targetId);

                const message = '親ラベルの配下に移動しました';
                this.showStatus(message, 'success');
                await this.renderTemplateList();
                return;
            }

            // ケース2: 同じ親を持つアイテム間 → 順序変更（親ラベル同士もここで対応）
            if (draggedTemplate.parentId === targetTemplate.parentId) {
                // 同じ親を持つすべてのテンプレートを取得
                const siblings = allTemplates.filter((t: PromptTemplate) =>
                    t.parentId === draggedTemplate.parentId
                ).sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

                // ドラッグしたテンプレートを配列から削除
                const draggedIndex = siblings.findIndex((t: PromptTemplate) => t.id === draggedId);
                const targetIndex = siblings.findIndex((t: PromptTemplate) => t.id === targetId);

                if (draggedIndex === -1 || targetIndex === -1) return;

                siblings.splice(draggedIndex, 1);
                siblings.splice(targetIndex, 0, draggedTemplate);

                // 順序を再設定して保存
                const now = getCurrentTimestamp();
                for (let i = 0; i < siblings.length; i++) {
                    siblings[i].order = i;
                    siblings[i].updatedAt = now;
                    await saveTemplateToIndexedDB(siblings[i]);
                }

                this.showStatus('順序を変更しました', 'success');
                await this.renderTemplateList();
                return;
            }

            // ケース3: 親ラベル同士で異なる親へのドロップ（入れ子禁止）
            if (draggedIsParentLabel && targetIsParentLabel && draggedTemplate.parentId !== targetTemplate.parentId) {
                this.showStatus('親ラベルを別の親ラベルの配下に移動することはできません', 'error');
                return;
            }

            // ケース3: 子アイテムを別の親に移動 → 新しい親に追加
            if (!draggedIsParentLabel && targetIsParentLabel) {
                draggedTemplate.parentId = targetId;
                draggedTemplate.updatedAt = getCurrentTimestamp();
                await saveTemplateToIndexedDB(draggedTemplate);

                // 元の親と新しい親の順序を再計算
                await this.reorderTemplates(draggedTemplate.parentId);
                await this.reorderTemplates(targetId);

                this.showStatus('テンプレートを別の親に移動しました', 'success');
                await this.renderTemplateList();
                return;
            }

            // ケース4: 異なる親を持つ子アイテム間でのドロップ → 移動不可
            if (!draggedIsParentLabel && !targetIsParentLabel && draggedTemplate.parentId !== targetTemplate.parentId) {
                this.showStatus('テンプレートは親ラベルの上にドロップしてください', 'error');
                return;
            }

            // ケース5: それ以外は操作不可
            this.showStatus('操作できません', 'error');
        } catch (error) {
            console.error('Failed to move template:', error);
            this.showStatus('テンプレートの移動に失敗しました', 'error');
        }
    }

    /**
     * 指定したIDがancestorIdの子孫かどうかをチェック
     */
    private isDescendant(allTemplates: PromptTemplate[], currentId: string, ancestorId: string): boolean {
        let current = allTemplates.find(t => t.id === currentId);
        while (current?.parentId) {
            if (current.parentId === ancestorId) {
                return true;
            }
            current = allTemplates.find(t => t.id === current!.parentId);
        }
        return false;
    }

    /**
     * 特定の親配下のテンプレートの順序を再計算
     */
    private async reorderTemplates(parentId: string | undefined): Promise<void> {
        const allTemplates = await getAllTemplatesFromIndexedDB();
        const children = allTemplates
            .filter((t: PromptTemplate) => t.parentId === parentId)
            .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

        const now = getCurrentTimestamp();
        for (let i = 0; i < children.length; i++) {
            children[i].order = i;
            children[i].updatedAt = now;
            await saveTemplateToIndexedDB(children[i]);
        }
    }

    /**
     * フォームをリセット
     */
    private async handleResetForm(): Promise<void> {
        this.currentEditingId = null;
        if (this.templateNameInput) this.templateNameInput.value = '';
        if (this.positivePromptInput) this.positivePromptInput.value = '';
        if (this.negativePromptInput) this.negativePromptInput.value = '';
        if (this.createAsParentOnlyCheckbox) this.createAsParentOnlyCheckbox.checked = false;

        // プロンプトセクションを再度表示
        if (this.promptSectionsContainer) {
            this.promptSectionsContainer.style.display = 'block';
        }

        // ボタングループを再レンダリング
        await this.renderButtonGroup();
    }

    /**
     * 現在のフォーム内容を新しいテンプレートとして保存（追記）
     */
    private async handleAddAsNewTemplate(): Promise<void> {
        if (!this.templateNameInput || !this.positivePromptInput || !this.negativePromptInput) {
            return;
        }

        const name = this.templateNameInput.value.trim();
        const isParentOnly = this.createAsParentOnlyCheckbox?.checked ?? false;
        const positivePrompt = isParentOnly ? '' : this.positivePromptInput.value.trim();
        const negativePrompt = isParentOnly ? '' : this.negativePromptInput.value.trim();

        // バリデーション
        if (!name) {
            this.showStatus('テンプレート名を入力してください', 'error');
            return;
        }

        if (!isParentOnly && !positivePrompt) {
            this.showStatus('ポジティブプロンプトを入力してください', 'error');
            return;
        }

        try {
            const now = getCurrentTimestamp();

            // 新しいテンプレートを作成（新しいIDで）
            const template: PromptTemplate = {
                id: generateULID(),
                type: isParentOnly ? 'label' : 'template',
                name,
                positivePrompt,
                negativePrompt,
                createdAt: now,
                updatedAt: now,
                parentId: undefined,
                order: 0,
            };

            // IndexedDBに保存
            await saveTemplateToIndexedDB(template);

            this.showStatus('テンプレートを追記しました', 'success');

            // フォームをリセット
            await this.handleResetForm();

            // テンプレート一覧を再読み込み
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to add template:', error);
            this.showStatus('テンプレートの追記に失敗しました', 'error');
        }
    }

    /**
     * すべてのテンプレートを削除
     */
    private async handleClearAllTemplates(): Promise<void> {
        if (!confirm('すべてのテンプレートを削除しますか？この操作は取り消せません。')) {
            return;
        }
        if (!confirm('本当に宜しいでしょうか？この操作は取り消せません。')) {
            return;
        }

        try {
            if (this.clearAllBtn) {
                this.clearAllBtn.disabled = true;
            }

            await clearAllTemplatesFromIndexedDB();

            await this.handleResetForm();
            this.showStatus('すべてのテンプレートを削除しました', 'success');
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to clear all templates:', error);
            this.showStatus('テンプレートの削除に失敗しました', 'error');
        } finally {
            if (this.clearAllBtn) {
                this.clearAllBtn.disabled = false;
            }
        }
    }

    /**
     * テンプレートをエクスポート
     */
    private async handleExportTemplates(): Promise<void> {
        try {
            if (this.exportBtn) {
                this.exportBtn.disabled = true;
            }

            const templates = await getAllTemplatesFromIndexedDB();

            if (templates.length === 0) {
                this.showStatus('エクスポートするテンプレートがありません', 'error');
                return;
            }

            const dataStr = JSON.stringify(templates, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `prompt-templates-${new Date().getTime()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showStatus('テンプレートをエクスポートしました', 'success');
        } catch (error) {
            console.error('Failed to export templates:', error);
            this.showStatus('エクスポートに失敗しました', 'error');
        } finally {
            if (this.exportBtn) {
                this.exportBtn.disabled = false;
            }
        }
    }

    /**
     * テンプレートをインポート
     */
    private async handleImportTemplates(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        try {
            if (this.importBtn) {
                this.importBtn.disabled = true;
            }

            const text = await file.text();
            const templates: PromptTemplate[] = JSON.parse(text);

            if (!Array.isArray(templates)) {
                this.showStatus('無効なJSONファイル形式です', 'error');
                return;
            }

            let importedCount = 0;
            const idMap = new Map<string, string>(); // 古いID → 新しいIDのマッピング

            // 2パス処理：まず親ラベルを処理、次に子テンプレートを処理
            for (const template of templates) {
                // バリデーション
                const isParentLabel = template.type === 'label' || (!template.positivePrompt && !template.parentId);
                if (!template.id || !template.name) {
                    console.warn('Skipping invalid template (missing id or name):', template);
                    continue;
                }
                if (!isParentLabel && !template.positivePrompt) {
                    console.warn('Skipping invalid template (missing positivePrompt for non-parent):', template);
                    continue;
                }

                const newId = generateULID();
                idMap.set(template.id, newId); // IDマッピングを保存

                // 新規IDを生成（競合回避）
                const importedTemplate: PromptTemplate = {
                    ...template,
                    id: newId,
                    type: template.type || (isParentLabel ? 'label' : 'template'),
                    parentId: undefined, // 1パス目では親IDを設定しない
                    order: template.order || 0,
                };

                // IndexedDBに保存
                await saveTemplateToIndexedDB(importedTemplate);

                importedCount++;
            }

            // 2パス目：親子関係を復元
            for (const template of templates) {
                if (template.parentId) {
                    const newId = idMap.get(template.id);
                    const newParentId = idMap.get(template.parentId);

                    if (newId && newParentId) {
                        const importedTemplate = await getTemplateFromIndexedDB(newId);
                        if (importedTemplate) {
                            importedTemplate.parentId = newParentId;
                            await saveTemplateToIndexedDB(importedTemplate);
                        }
                    }
                }
            }

            this.showStatus(`${importedCount}個のテンプレートをインポートしました`, 'success');
            await this.renderTemplateList();
        } catch (error) {
            console.error('Failed to import templates:', error);
            this.showStatus('インポートに失敗しました', 'error');
        } finally {
            if (this.importBtn) {
                this.importBtn.disabled = false;
            }
            // ファイル入力をリセット
            if (this.fileInput) {
                this.fileInput.value = '';
            }
        }
    }

    /**
     * テンプレート一覧をレンダリング
     */
    private async renderTemplateList(): Promise<void> {
        try {
            if (!this.templateListContainer) return;

            const templates = await getAllTemplatesFromIndexedDB();

            if (templates.length === 0) {
                this.templateListContainer.innerHTML = '<div class="empty-message">テンプレートはまだありません</div>';
                return;
            }

            // ルートテンプレートを取得（parentIdがない）
            const rootTemplates = templates
                .filter((t: PromptTemplate) => !t.parentId)
                .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

            const html = rootTemplates
                .map((template: PromptTemplate) => this.renderTemplateItem(template, templates, 0))
                .join('');

            this.templateListContainer.innerHTML = html;
        } catch (error) {
            console.error('Failed to render template list:', error);
            if (this.templateListContainer) {
                this.templateListContainer.innerHTML = '<div class="empty-message">テンプレートの読み込みに失敗しました</div>';
            }
        }
    }

    /**
     * テンプレートアイテムをレンダリング（階層対応）
     */
    private renderTemplateItem(template: PromptTemplate, allTemplates: PromptTemplate[], depth: number): string {
        const isActive = this.currentEditingId === template.id;
        const createdDate = new Date(template.createdAt * 1000).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });

        // 子テンプレートを取得
        const children = allTemplates
            .filter((t: PromptTemplate) => t.parentId === template.id)
            .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

        const hasChildren = children.length > 0;
        // 展開状態を復元（expandedTemplateIdsに含まれているかで判定）
        const isExpanded = hasChildren ? this.expandedTemplateIds.has(template.id) : true;
        const childrenHtml = children
            .map((child: PromptTemplate) => this.renderTemplateItem(child, allTemplates, depth + 1))
            .join('');

        const paddingLeft = depth * 20;

        // 親ラベルのみ（プロンプトなし）かどうかを判定
        const isParentLabel = !template.positivePrompt && !template.parentId;

        return `
            <div class="template-item ${isActive ? 'active' : ''} ${isParentLabel ? 'parent-label' : ''}"
                 data-template-id="${escapeHtml(template.id)}"
                 draggable="true"
                 style="padding-left: ${paddingLeft}px;">
                <div class="template-header ${isParentLabel ? 'parent-label-header' : ''}">
                    ${hasChildren
                ? `<button class="btn-toggle-children" data-template-id="${escapeHtml(template.id)}" title="展開">
                        <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
                      </button>`
                : '<span class="toggle-placeholder"></span>'
            }
                    <div class="template-info">
                        <div class="template-name">${escapeHtml(template.name)}</div>
                        ${isParentLabel ? '<div class="parent-label-badge">親ラベル</div>' : `<div class="template-date">作成日時: ${escapeHtml(createdDate)}</div>`}
                    </div>
                    <div class="template-actions">
                        <button class="btn btn-secondary btn-edit" data-template-id="${escapeHtml(template.id)}">編集</button>
                        <button class="btn btn-danger btn-delete" data-template-id="${escapeHtml(template.id)}">削除</button>
                    </div>
                </div>
                ${hasChildren ? `<div class="template-children ${!isExpanded ? 'collapsed' : ''}">${childrenHtml}</div>` : ''}
            </div>
        `;
    }
}

// =====================
// メニュー用エクスポート関数
// =====================

/**
 * メニューで表示するテンプレート一覧を取得
 * @param limit 取得する最大件数
 */
export async function getTemplatesForMenu(limit: number = 10): Promise<Array<{ id: string; name: string }>> {
    try {
        const templates = await getAllTemplatesFromIndexedDB();
        // ルートテンプレートのみを取得（parentIdなし）
        return templates
            .filter((t: PromptTemplate) => !t.parentId)
            .sort((a: PromptTemplate, b: PromptTemplate) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
            .slice(0, limit)
            .map((template: PromptTemplate) => ({
                id: template.id,
                name: template.name,
            }));
    } catch (error) {
        console.error('Failed to load templates for menu:', error);
        return [];
    }
}

/**
 * テンプレートをメニューから読み込む
 * @param templateId テンプレートID
 */
export async function loadTemplateFromMenu(templateId: string): Promise<{
    positivePrompt: string;
    negativePrompt: string;
} | null> {
    try {
        const template = await getTemplateFromIndexedDB(templateId);
        if (!template) {
            return null;
        }
        return {
            positivePrompt: template.positivePrompt,
            negativePrompt: template.negativePrompt,
        };
    } catch (error) {
        console.error('Failed to load template from menu:', error);
        return null;
    }
}

// =====================
// ページロード時の処理
// =====================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const manager = new PromptTemplateManager('app');
        await manager.initialize();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
});
