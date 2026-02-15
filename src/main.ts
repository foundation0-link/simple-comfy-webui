/**
 * メインエントリポイント
 */

import './main.css';
import { AppController } from './app-controller';
import { stateManager } from './state-manager';
import { loadHistory, clearHistory, toggleFavoriteHistoryEntry, loadUIPreferences, updateTextareaHeight } from './local-storage';
import { initIndexedDB, resetIndexedDB, getAllTemplatesFromIndexedDB, getTemplateFromIndexedDB, getImageFromIndexedDB } from './indexed-db-storage';
import { getConfig, getDefaultConfig } from './config';
import { RequestPromptParams, PromptTemplate, PublicConfig, RequestJob } from './types';
import { tagDictionary } from './tag-dictionary';
import { escapeHtml, convertImageFormat } from './utils';
import { initializeMenu } from './menu';
import {
    SelectedTags,
    renderTagSearchWidget,
    renderNegativePromptPresets,
    NegativePromptPresets,
} from './prompt/tag-selector';
import { createPromptTranslator } from './prompt/translator';
import { hasPromptContent, quickSaveTemplate } from './prompt/template-utils';
import { renderTranslationPanel, setupTokenClickListeners } from './prompt/translation-panel';
import { mergePromptContent } from './utils/prompt-utils';

// UI ヘルパー
import { getPromptFields, getPromptValues, setPromptValues } from './ui/dom-helpers';
import { setupModalClose } from './ui/modal-helpers';
import { renderHistoryItem, renderHistoryContent, deleteHistoryItem as deleteHistoryItemHelper } from './ui/history-renderer';

// アプリケーションコントローラー
let appController: AppController;

// グローバル設定（initializeApp で初期化）
let config: PublicConfig;

// オフラインモード（設定読み込み失敗時）
let isOfflineMode = false;

// 選択中のタグ
const selectedPositiveTags = new SelectedTags();
const selectedNegativeTags = new SelectedTags();

// プロンプト翻訳機能
let promptTranslator: ReturnType<typeof createPromptTranslator>;

// DOM要素
const appElement = document.querySelector<HTMLDivElement>('#app')!;

// グローバルイベントリスナーの登録状態フラグ
let isImageModalInitialized = false;
let isScrollListenerInitialized = false;

/**
 * UI設定を復元（CSS変数を設定）
 */
function restoreUIPreferences(): void {
    const preferences = loadUIPreferences();
    const root = document.documentElement;

    root.style.setProperty('--textarea-positive-height', `${preferences.positivePromptHeight}px`);
    root.style.setProperty('--textarea-negative-height', `${preferences.negativePromptHeight}px`);

    console.debug('UI preferences restored:', preferences);
}

/**
 * フォームの値をLocalStorageに保存
 */
function saveFormValues(): void {
    const positivePrompt = document.getElementById('positive-prompt') as HTMLTextAreaElement;
    const negativePrompt = document.getElementById('negative-prompt') as HTMLTextAreaElement;
    const width = document.getElementById('width') as HTMLSelectElement;
    const height = document.getElementById('height') as HTMLSelectElement;
    const userSeed = document.getElementById('user-seed') as HTMLInputElement;
    const workflow = document.getElementById('workflow') as HTMLSelectElement | null;

    if (positivePrompt && negativePrompt && width && height && userSeed) {
        try {
            // ワークフロー必須入力フィールドの値を収集
            const workflowRequiredInputs: Record<string, string | number> = {};
            const container = document.getElementById('workflow-required-inputs-container');
            if (container) {
                const inputs = container.querySelectorAll('input[name]');
                inputs.forEach(input => {
                    const inputElement = input as HTMLInputElement;
                    const key = inputElement.name;
                    const value = inputElement.type === 'number'
                        ? parseFloat(inputElement.value)
                        : inputElement.value;
                    workflowRequiredInputs[key] = value;
                });
            }

            const savedPrompts = {
                positivePrompt: positivePrompt?.value || '',
                negativePrompt: negativePrompt?.value || '',
                width: parseInt(width.value, 10),
                height: parseInt(height.value, 10),
                workflowIdentifier: workflow?.value || config!.workflows[0].workflowIdentifier,
                workflowRequiredInputs: workflowRequiredInputs,
            };
            localStorage.setItem('last_prompts', JSON.stringify(savedPrompts));
        } catch (error) {
            console.warn('Failed to save prompts:', error);
        }
    }
}

/**
 * フォームの値を復元（LocalStorageから）
 */
function restoreFormValues(): void {
    const positivePrompt = document.getElementById('positive-prompt') as HTMLTextAreaElement;
    const negativePrompt = document.getElementById('negative-prompt') as HTMLTextAreaElement;
    const width = document.getElementById('width') as HTMLSelectElement;
    const height = document.getElementById('height') as HTMLSelectElement;
    const workflowIdentifier = document.getElementById('workflow') as HTMLSelectElement | null;

    // LocalStorageから最後に使用したプロンプトを復元
    try {
        const stored = localStorage.getItem('last_prompts');
        if (stored) {
            const {
                positivePrompt: storedPositive,
                negativePrompt: storedNegative,
                width: storedWidth,
                height: storedHeight,
                workflowIdentifier: storedWorkflowId,
                workflowRequiredInputs: storedWorkflowRequiredInputs
            } = JSON.parse(stored);

            if (positivePrompt && storedPositive) {
                positivePrompt.value = storedPositive;
            }
            if (negativePrompt && storedNegative) {
                negativePrompt.value = storedNegative;
            }
            // widthは選択可能な値のみ復元
            if (width && storedWidth) {
                const availableWidths = config!.image.available.widths;
                if (availableWidths.includes(storedWidth)) {
                    width.value = String(storedWidth);
                } else {
                    width.value = String(config!.image.default.width);
                }
            }
            // heightは選択可能な値のみ復元
            if (height && storedHeight) {
                const availableHeights = config!.image.available.heights;
                if (availableHeights.includes(storedHeight)) {
                    height.value = String(storedHeight);
                } else {
                    height.value = String(config!.image.default.height);
                }
            }
            // ワークフロー識別子を復元
            if (workflowIdentifier && storedWorkflowId) {
                const availableWorkflows = config!.workflows.filter(w => w.enabled === true).map(w => w.workflowIdentifier);
                if (availableWorkflows.includes(storedWorkflowId)) {
                    workflowIdentifier.value = storedWorkflowId;
                    // ワークフロー変更イベントを手動で発火させて必須入力フィールドを再構築
                    workflowIdentifier.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            // ワークフロー必須入力フィールドの値を復元（change イベント後に実行）
            if (storedWorkflowRequiredInputs && typeof storedWorkflowRequiredInputs === 'object') {
                setTimeout(() => {
                    const container = document.getElementById('workflow-required-inputs-container');
                    if (container) {
                        const inputs = container.querySelectorAll('input[name]');
                        inputs.forEach(input => {
                            const inputElement = input as HTMLInputElement;
                            const key = inputElement.name;
                            if (storedWorkflowRequiredInputs.hasOwnProperty(key)) {
                                inputElement.value = String(storedWorkflowRequiredInputs[key]);
                            }
                        });
                    }
                }, 0);
            }
        }
    } catch (error) {
        console.warn('Failed to load prompts from LocalStorage:', error);
    }
    // 翻訳パネルを更新
    updateTranslationPanels();
}

/**
 * プロンプト翻訳パネルを更新
 */
function updateTranslationPanels(): void {
    const fields = getPromptFields();
    if (!fields.positive || !fields.negative || !promptTranslator) {
        return;
    }

    const positiveText = fields.positive.value.trim();
    const negativeText = fields.negative.value.trim();

    // 正のプロンプト翻訳パネルを更新
    const positivePanelContainer = document.getElementById('positive-translation-panel');
    if (positivePanelContainer) {
        const positiveTokens = promptTranslator.translatePrompt(positiveText);
        const positiveHtml = renderTranslationPanel(positiveTokens, 'positive-translation-panel', false);
        positivePanelContainer.outerHTML = positiveHtml;
        setupTokenClickListeners('positive-translation-panel', false);
    }

    // 負のプロンプト翻訳パネルを更新
    const negativePanelContainer = document.getElementById('negative-translation-panel');
    if (negativePanelContainer) {
        const negativeTokens = promptTranslator.translatePrompt(negativeText);
        const negativeHtml = renderTranslationPanel(negativeTokens, 'negative-translation-panel', true);
        negativePanelContainer.outerHTML = negativeHtml;
        setupTokenClickListeners('negative-translation-panel', true);
    }
}

/**
 * UIをレンダリング
 */
async function renderUI(): Promise<void> {
    // オフラインモード警告バナー
    const offlineModeBanner = isOfflineMode ? `
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 1.5rem;">⚠️</span>
            <div>
                <strong style="color: #856404;">オフラインモード</strong>
                <p style="color: #856404; margin: 0.25rem 0 0 0; font-size: 0.9rem;">サーバーに接続できないため、暫定設定で動作しています。</p>
            </div>
        </div>
    ` : '';

    appElement.innerHTML = `
        <div class="main-content-wrapper" id="main-content-wrapper">
            <div class="header-container">
                <h1>Simple Comfy WebUI</h1>
            </div>
            ${offlineModeBanner}

        <div class="main-layout">
        <!-- 左側: 画像生成フォーム -->
        <div class="left-panel">
        <form id="generate-form">
        <div class="form-header">
        <h2>画像生成</h2>
        </div>

        <div class="form-group">
            <label for="workflow">ワークフロー</label>
            <select id="workflow" name="workflow" required>
                ${config!.workflows.filter(w => w.enabled === true).map(w => `<option value="${w.workflowIdentifier}">${w.workflowIdentifier}</option>`).join('')}
            </select>
        </div>
        <div class="form-group" id="workflow-required-inputs-container">
            <!-- ワークフロー必須入力フィールドがここに挿入されます -->
        </div>
        <hr/>
        <div class="form-group">
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button type="button" id="load-template-btn" class="secondary" style="flex: 1;">
                🪟 プロンプトテンプレートUIを開く
                </button>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button type="button" id="quicksave-template-btn" style="flex: 1;">
                💾 現在のプロンプトをテンプレートに保存
                </button>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button type="submit" id="generate-btn-top" style="flex: 1;">
                ⚙️ 画像の生成要求
                </button>
            </div>
        </div>
        <div class="form-group">
        <label for="positive-prompt">プロンプト *</label>
        <textarea id="positive-prompt" name="positivePrompt" rows="5" required>1girl, best quality</textarea>
        <!-- プロンプト翻訳パネル -->
        <div id="positive-translation-panel" class="prompt-translation-panel"></div>
        <!-- タグ検索ウィジェット（プロンプト） -->
        <div id="positive-tags-widget"></div>
        </div>
        <hr/>
        <div class="form-group">
        <label for="negative-prompt-preset">ネガティブプロンプト プリセット</label>
        <div id="negative-prompt-preset"></div>
        </div>

        <div class="form-group">
        <label for="negative-prompt">ネガティブプロンプト</label>
        <textarea id="negative-prompt" name="negativePrompt"></textarea>
        <!-- ネガティブプロンプト翻訳パネル -->
        <div id="negative-translation-panel" class="prompt-translation-panel negative"></div>

        <!-- タグ検索ウィジェット（ネガティブプロンプト） -->
        <div id="negative-tags-widget"></div>
        </div>

        <div class="form-group-row">
        <div class="form-group">
        <label for="width">幅</label>
        <select id="width" name="width" required>
        ${config!.image.available.widths.map((w: number) => `<option value="${w}" ${w === config!.image.default.width ? 'selected' : ''}>${w}px</option>`).join('')}
        </select>
        </div>

        <div class="form-group">
        <label for="height">高さ</label>
        <select id="height" name="height" required>
        ${config!.image.available.heights.map(h => `<option value="${h}" ${h === config!.image.default.height ? 'selected' : ''}>${h}px</option>`).join('')}
        </select>
        </div>
        </div>

        <div class="form-group">
            <label for="user-seed">シード値<br> (-1 でランダム)</label>
            <input type="text" id="user-seed" name="user-seed" value="-1" maxlength="20" pattern="^-1$|^[0-9]{1,20}$" required>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button type="submit" id="generate-btn-bottom" class="primary" style="flex: 1;">
            ⚙️ 画像の生成要求
            </button>
        </div>

        </form>
    </div>

    <!-- 右側: ジョブキューと履歴 -->
    <div class="right-panel">
      <!-- ジョブキュー（実行中のみ） -->
      ${stateManager.getJobQueue().filter((job: RequestJob) => job.status !== 'completed' && job.status !== 'failed').length > 0 ? `
        <div class="job-queue">
          <h2>実行中ジョブ(${stateManager.getJobQueue().filter((job: RequestJob) => job.status !== 'completed' && job.status !== 'failed').length})</h2>
        </div>
      ` : ''}

      <!-- 履歴セクション -->
      <div id="history-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <h2 style="margin: 0;">生成履歴</h2>
            <span id="history-count-badge" style="background-color: #e0e0e0; border-radius: 12px; padding: 0.25rem 0.75rem; font-size: 0.85rem; color: #333; font-weight: 500; min-width: 2.5rem; text-align: center;">0</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button id="clear-history-btn" class="danger">生成履歴を全て削除</button>
          </div>
        </div>
        <div id="history-content">
          <p style="color: #666; margin-top: 1rem;">読み込み中...</p>
        </div>
      </div>
    </div>
  </div>

  <!-- スクロールトップボタン（固定配置） -->
  <button id="scroll-to-top-btn" style="display: none;" title="ページトップに戻る">▲</button>

  <!-- 画像モーダル -->
  <div id="image-modal" class="image-modal">
    <button id="modal-prev-btn" class="modal-nav-btn modal-prev" title="前の画像" style="display: none;">◀</button>
    <img id="modal-image" src="" alt="Full size image">
    <button id="modal-next-btn" class="modal-nav-btn modal-next" title="次の画像" style="display: none;">▶</button>
    <div id="modal-counter" class="modal-counter"></div>
  </div>

  <!-- テンプレート選択モーダル -->
  <div id="template-selection-modal" class="template-selection-modal" style="display: none;">
    <div class="template-selection-modal-content">
      <div class="template-selection-modal-header">
        <h2>プロンプトテンプレートUI(読み取り専用)</h2>
        <button class="modal-close" id="template-selection-close">&times;</button>
      </div>
      <div class="template-selection-modal-body">
        <div id="template-selection-list" class="template-selection-list">
          <p style="color: #666; padding: 1rem;">読み込み中...</p>
        </div>
        <div id="template-detail-panel" class="template-detail-panel">
          <div class="template-detail-empty">テンプレートを選択してください</div>
        </div>
      </div>
    </div>
  </div>
        </div>
    `;

    // 必須処理
    setupEventListeners();
    setupTagWidgets();
    initializeTranslationPanels();
    restoreFormValues();
    await updateHistorySection().catch(error => {
        console.error('Failed to load history:', error);
    });
}

/**
 * タグウィジェットを設定
 */
function setupTagWidgets(): void {
    if (!tagDictionary.isReady()) {
        return;
    }

    // プロンプトタグウィジェット
    renderTagSearchWidget('positive-tags-widget', selectedPositiveTags, (_tag) => {
        updatePromptFromTags('positive-prompt', selectedPositiveTags);
    });

    // ネガティブプロンプトタグウィジェット
    renderTagSearchWidget('negative-tags-widget', selectedNegativeTags, (_tag) => {
        updatePromptFromTags('negative-prompt', selectedNegativeTags);
    });

    // ネガティブプロンプトプリセット
    const negativePromptTextarea = document.getElementById('negative-prompt') as HTMLTextAreaElement;
    const onPresetChange = (presetValue: string) => {
        const textarea = document.getElementById('negative-prompt') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = presetValue;
            // プリセット選択時は選択中のタグをクリア
            if (presetValue) {
                selectedNegativeTags.clear();
            }
            // input イベントを手動で発火させて翻訳パネルを更新
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    renderNegativePromptPresets('negative-prompt-preset', onPresetChange);

    // 初期値として基本プリセットを設定（ただし、復元済みのプロンプトがある場合はスキップ）
    if (!negativePromptTextarea?.value) {
        onPresetChange(NegativePromptPresets.basic.value);
    }

    // 折りたたみセクション
    setupCollapsibleSection('positive-tags-header', 'positive-tags-content');
    setupCollapsibleSection('negative-tags-header', 'negative-tags-content');

    // 画像モーダル
    setupImageModal();
}

/**
 * 翻訳パネルを初期化
 */
function initializeTranslationPanels(): void {
    if (!promptTranslator) {
        return;
    }

    const fields = getPromptFields();

    // 正プロンプトの翻訳パネルを初期化
    if (fields.positive && fields.positive.value && promptTranslator) {
        const panel = document.getElementById('positive-translation-panel');
        if (panel) {
            const tokens = promptTranslator.translatePrompt(fields.positive.value);
            const html = renderTranslationPanel(tokens, 'positive-translation-panel', false);
            panel.outerHTML = html;
            setupTokenClickListeners('positive-translation-panel', false);
        }
    }

    // 負プロンプトの翻訳パネルを初期化
    if (fields.negative && fields.negative.value && promptTranslator) {
        const panel = document.getElementById('negative-translation-panel');
        if (panel) {
            const tokens = promptTranslator.translatePrompt(fields.negative.value);
            const html = renderTranslationPanel(tokens, 'negative-translation-panel', true);
            panel.outerHTML = html;
            setupTokenClickListeners('negative-translation-panel', true);
        }
    }
}

/**
 * 折りたたみセクションを設定
 */
function setupCollapsibleSection(headerId: string, contentId: string): void {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    const icon = header?.querySelector('.collapsible-icon');

    header?.addEventListener('click', () => {
        const isOpen = content?.classList.contains('open');
        if (isOpen) {
            content?.classList.remove('open');
            icon?.classList.remove('open');
        } else {
            content?.classList.add('open');
            icon?.classList.add('open');
        }
    });
}

/**
 * 画像モーダルを設定
 */
function setupImageModal(): void {
    // 既に初期化済みの場合はスキップ
    if (isImageModalInitialized) {
        return;
    }

    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image') as HTMLImageElement;
    const prevBtn = document.getElementById('modal-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('modal-next-btn') as HTMLButtonElement;
    const counter = document.getElementById('modal-counter') as HTMLElement;

    if (!modal || !modalImage) return;

    // スライドショー状態
    let currentImageIndex = -1;
    let imageElements: HTMLElement[] = [];

    // 画像要素のリストを取得
    function updateImageList(): void {
        imageElements = Array.from(document.querySelectorAll('.clickable-image')) as HTMLElement[];
    }

    // モーダルを表示
    function showModal(index: number): void {
        if (index < 0 || index >= imageElements.length) return;

        currentImageIndex = index;
        const img = imageElements[index] as HTMLImageElement;
        const imgSrc = img.getAttribute('data-fullsize') || img.src;
        modalImage.src = imgSrc;
        modal!.style.display = 'flex';

        // 複数画像がある場合のみナビゲーションボタンを表示
        if (imageElements.length > 1) {
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
            counter.style.display = 'block';

            // カウンター表示
            counter.textContent = `${index + 1} / ${imageElements.length}`;

            // 矢印ボタンの有効/無効を更新
            prevBtn.disabled = index === 0;
            prevBtn.style.opacity = index === 0 ? '0.3' : '1';
            nextBtn.disabled = index === imageElements.length - 1;
            nextBtn.style.opacity = index === imageElements.length - 1 ? '0.3' : '1';
        } else {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            counter.style.display = 'none';
        }
    }

    // 画像クリックでモーダル表示
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.classList.contains('clickable-image')) {
            updateImageList();
            const clickedIndex = imageElements.indexOf(target as HTMLElement);
            showModal(clickedIndex >= 0 ? clickedIndex : 0);
        }
    });

    // 前の画像を表示
    prevBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentImageIndex > 0) {
            showModal(currentImageIndex - 1);
        }
    });

    // 次の画像を表示
    nextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentImageIndex < imageElements.length - 1) {
            showModal(currentImageIndex + 1);
        }
    });

    // キーボード操作（← → 矢印キーで移動、Esc キーで閉じる）
    document.addEventListener('keydown', (e) => {
        if (modal!.style.display === 'flex') {
            if (e.key === 'ArrowLeft' && currentImageIndex > 0) {
                e.preventDefault();
                showModal(currentImageIndex - 1);
            } else if (e.key === 'ArrowRight' && currentImageIndex < imageElements.length - 1) {
                e.preventDefault();
                showModal(currentImageIndex + 1);
            } else if (e.key === 'Escape') {
                modal!.style.display = 'none';
            }
        }
    });

    // モーダルクリックで閉じる（矢印ボタン以外）
    modal!.addEventListener('click', (e) => {
        if (e.target === modal || e.target === modalImage) {
            modal!.style.display = 'none';
        }
    });

    // 初期化完了フラグを設定
    isImageModalInitialized = true;
}

/**
 * 選択中のタグからプロンプトを更新（既存テキストに追記）
 */
function updatePromptFromTags(textareaId: string, selectedTags: SelectedTags): void {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) {
        return;
    }

    // 現在のテキストを取得
    const currentText = textarea.value.trim();
    const currentTags = currentText
        .split(',')
        .map(t => t.trim())
        .filter(t => t);

    // 選択中のタグを取得
    const selectedTagsList = selectedTags.getTags();

    // 既存のタグに新しいタグを追加（重複なし）
    const allTags = [...currentTags];
    for (const tag of selectedTagsList) {
        if (!allTags.includes(tag)) {
            allTags.push(tag);
        }
    }

    // テキストエリアに設定
    textarea.value = allTags.length > 0 ? allTags.join(', ') : '';

    // blur イベントを手動で発火させて翻訳パネルを更新
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * ワークフロー必須入力フィールドをレンダリング
 */
function renderWorkflowRequiredInputs(workflowIdentifier: string): void {
    const container = document.getElementById('workflow-required-inputs-container');
    if (!container) return;

    // 選択されたワークフロー定義を取得
    const workflow = config!.workflows.find(w => w.workflowIdentifier === workflowIdentifier);

    // 必須入力フィールドがない場合は空にする
    if (!workflow || !workflow.requiredInputs || workflow.requiredInputs.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 必須入力フィールドをHTMLに変換
    const fieldsHtml = workflow.requiredInputs
        .map(input => {
            const inputId = `workflow-input-${input.key}`;
            const defaultValue = input.default ?? '';

            switch (input.type) {
                case 'number':
                    return `
                        <div class="form-group">
                            <label for="${inputId}">${escapeHtml(input.name)}</label>
                            <input type="number" id="${inputId}" name="${input.key}"
                                   value="${defaultValue}"
                                   ${input.min !== undefined ? `min="${input.min}"` : ''}
                                   ${input.max !== undefined ? `max="${input.max}"` : ''}
                                   ${input.step !== undefined ? `step="${input.step}"` : ''}
                                   required>
                        </div>
                    `;
                case 'url':
                    return `
                        <div class="form-group">
                            <label for="${inputId}">${escapeHtml(input.name)}</label>
                            <input type="url" id="${inputId}" name="${input.key}"
                                   value="${defaultValue}"
                                   ${input.placeholder ? `placeholder="${escapeHtml(input.placeholder)}"` : ''}
                                   required>
                        </div>
                    `;
                case 'text':
                default:
                    return `
                        <div class="form-group">
                            <label for="${inputId}">${escapeHtml(input.name)}</label>
                            <input type="text" id="${inputId}" name="${input.key}"
                                   value="${defaultValue}"
                                   ${input.placeholder ? `placeholder="${escapeHtml(input.placeholder)}"` : ''}
                                   required>
                        </div>
                    `;
            }
        })
        .join('');

    container.innerHTML = fieldsHtml;
}

// ========================================
// イベントハンドラー関数群
// ========================================

/**
 * ワークフロー変更ハンドラー
 */
function handleWorkflowChange(e: Event): void {
    const selectedWorkflowId = (e.target as HTMLSelectElement).value;
    renderWorkflowRequiredInputs(selectedWorkflowId);
}

/**
 * フォーム送信ハンドラー
 */
async function handleFormSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const workflowElement = document.getElementById('workflow') as HTMLSelectElement;

    // ワークフロー必須入力フィールドの値を収集
    const workflowRequiredInputs: Record<string, string | number> = {};
    const container = document.getElementById('workflow-required-inputs-container');
    if (container) {
        const inputs = container.querySelectorAll('input[name]');
        inputs.forEach(input => {
            const inputElement = input as HTMLInputElement;
            const key = inputElement.name;
            const value = inputElement.type === 'number'
                ? parseFloat(inputElement.value)
                : inputElement.value;
            workflowRequiredInputs[key] = value;
        });
    }

    const params: RequestPromptParams = {
        positivePrompt: formData.get('positivePrompt') as string,
        negativePrompt: (formData.get('negativePrompt') as string) || '',
        userSeed: formData.get('user-seed') as string,
        seed: '-1', // ここでは仮の値を設定
        width: parseInt(formData.get('width') as string, 10),
        height: parseInt(formData.get('height') as string, 10),
        workflowIdentifier: workflowElement?.value || config!.workflows[0].workflowIdentifier,
        requiredInputs: {}
    };

    // 必須入力フィールドが存在する場合はパラメータに追加
    if (Object.keys(workflowRequiredInputs).length > 0) {
        for (const [key, value] of Object.entries(workflowRequiredInputs)) {
            params.requiredInputs![key] = value;
        }
    }

    try {
        await appController.requestGenerate(params);
        // フォーム送信成功時にプロンプトを保存
        saveFormValues();
        // ジョブキューUIを即座に更新
        updateJobQueueSection();
    } catch (error) {
        alert(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * プロンプトフィールドのblurハンドラー
 */
function handlePromptBlur(fieldId: string, isNegative: boolean): void {
    const field = document.getElementById(fieldId) as HTMLTextAreaElement;
    if (!field) return;

    // <br> と <br/> タグを除外
    field.value = field.value.replace(/<br\s*\/?>/gi, '');

    const panelId = isNegative ? 'negative-translation-panel' : 'positive-translation-panel';
    const panel = document.getElementById(panelId);

    if (panel && promptTranslator) {
        const tokens = promptTranslator.translatePrompt(field.value);
        const html = renderTranslationPanel(tokens, panelId, isNegative);
        panel.outerHTML = html;
        setupTokenClickListeners(panelId, isNegative);
    }
}

/**
 * テンプレート読み込みボタンハンドラー
 */
async function handleLoadTemplate(): Promise<void> {
    await showTemplateSelectionModal();
}

/**
 * 履歴クリアボタンハンドラー
 */
async function handleClearHistory(): Promise<void> {
    if (confirm('履歴をすべて削除しますか？')) {
        // ジョブキューにあるすべての実行中ジョブを削除
        const activeJobs = stateManager.getJobQueue();
        for (const job of activeJobs) {
            if (job.jobId) {
                // ポーリングをキャンセル
                if (job.promptId) {
                    appController.client.cancelPolling(job.promptId);
                }
                stateManager.removeJob(job.jobId);
            }
        }

        // 履歴をクリア
        await clearHistory();
        isHistoryInitialized = false;
        renderedHistoryIds.clear();
        await updateHistorySection();
    }
}

/**
 * スクロールトップボタンハンドラー
 */
function handleScrollToTop(): void {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

/**
 * スクロールイベントハンドラー
 */
function handleScroll(): void {
    const btn = document.querySelector<HTMLButtonElement>('#scroll-to-top-btn');
    if (btn) {
        btn.style.display = window.scrollY > 300 ? 'block' : 'none';
    }
}

/**
 * クイックセーブボタンハンドラー
 */
async function handleQuickSave(e: Event): Promise<void> {
    e.preventDefault();
    const positivePromptField = document.getElementById('positive-prompt') as HTMLTextAreaElement;
    const negativePromptField = document.getElementById('negative-prompt') as HTMLTextAreaElement;
    const positive = positivePromptField?.value || '';
    const negative = negativePromptField?.value || '';
    await quickSaveTemplate(positive, negative);
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners(): void {
    // フォーム要素を先に取得
    const form = document.querySelector<HTMLFormElement>('#generate-form');
    const positivePromptField = document.getElementById('positive-prompt') as HTMLTextAreaElement;
    const negativePromptField = document.getElementById('negative-prompt') as HTMLTextAreaElement;

    // ワークフロー選択変更時に必須入力フィールドを再構築
    const workflowSelect = document.getElementById('workflow') as HTMLSelectElement;
    workflowSelect?.addEventListener('change', handleWorkflowChange);

    // 初回ロード時に選択されているワークフローの必須入力フィールドをレンダリング
    if (workflowSelect) {
        renderWorkflowRequiredInputs(workflowSelect.value);
    }

    // フォーム送信
    form?.addEventListener('submit', handleFormSubmit);

    // プロンプト入力欄の翻訳更新リスナー（フォーカス喪失時に処理）
    positivePromptField?.addEventListener('blur', () => handlePromptBlur('positive-prompt', false));
    negativePromptField?.addEventListener('blur', () => handlePromptBlur('negative-prompt', true));

    // テンプレート呼び出し
    const loadTemplateBtn = document.querySelector('#load-template-btn') as HTMLButtonElement | null;
    if (loadTemplateBtn) {
        loadTemplateBtn.onclick = handleLoadTemplate;
    }

    // 履歴クリア
    const clearHistoryBtn = document.querySelector('#clear-history-btn') as HTMLButtonElement | null;
    if (clearHistoryBtn) {
        clearHistoryBtn.onclick = handleClearHistory;
    }

    // スクロールトップボタン
    const scrollToTopBtn = document.querySelector<HTMLButtonElement>('#scroll-to-top-btn');
    if (scrollToTopBtn) {
        scrollToTopBtn.onclick = handleScrollToTop;

        // スクロール位置に応じてボタンの表示/非表示を切り替え（一度だけ登録）
        if (!isScrollListenerInitialized) {
            window.addEventListener('scroll', handleScroll, { passive: true });
            isScrollListenerInitialized = true;
        }
    }

    // フォーム上部のクイックセーブボタン
    const quickSaveFormBtn = document.querySelector('#quicksave-template-btn') as HTMLButtonElement | null;
    if (quickSaveFormBtn) {
        quickSaveFormBtn.onclick = handleQuickSave;
    }

    // テキストエリアの高さ変更イベント（ResizeObserverで確実に検知）
    // mouseupイベントだけでなく、ResizeObserverで高さ変更を監視
    let lastPositiveHeight = positivePromptField?.offsetHeight ?? 0;
    let lastNegativeHeight = negativePromptField?.offsetHeight ?? 0;

    const resizeObserver = new ResizeObserver(() => {
        if (positivePromptField && positivePromptField.offsetHeight !== lastPositiveHeight) {
            lastPositiveHeight = positivePromptField.offsetHeight;
            if (lastPositiveHeight > 0) {
                updateTextareaHeight('positive-prompt', lastPositiveHeight);
            }
        }

        if (negativePromptField && negativePromptField.offsetHeight !== lastNegativeHeight) {
            lastNegativeHeight = negativePromptField.offsetHeight;
            if (lastNegativeHeight > 0) {
                updateTextareaHeight('negative-prompt', lastNegativeHeight);
            }
        }
    });

    // テキストエリアの変更をObserve
    if (positivePromptField) {
        resizeObserver.observe(positivePromptField);
    }
    if (negativePromptField) {
        resizeObserver.observe(negativePromptField);
    }
}

/**
 * フォーマット選択ダイアログを表示
 */
function showFormatSelectionDialog(): Promise<'png' | 'webp' | null> {
    return new Promise((resolve) => {
        // ダイアログ要素を作成
        const dialogContainer = document.createElement('div');
        dialogContainer.className = 'format-selection-dialog';
        dialogContainer.innerHTML = `
            <div class="format-dialog-content">
                <div class="format-dialog-header">
                    <h3>画像フォーマットを選択</h3>
                    <p>ダウンロード時のファイル形式を選んでください</p>
                </div>
                <div class="format-options">
                    <div class="format-option">
                        <input type="radio" id="format-png" name="format" value="png" checked>
                        <label for="format-png">PNG</label>
                    </div>
                    <div class="format-option">
                        <input type="radio" id="format-webp" name="format" value="webp">
                        <label for="format-webp">WEBP</label>
                    </div>
                </div>
                <div class="format-dialog-actions">
                    <button class="primary" id="format-download-btn">ダウンロード</button>
                    <button class="secondary" id="format-cancel-btn">キャンセル</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialogContainer);

        // ダウンロードボタンのイベント
        const downloadBtn = dialogContainer.querySelector('#format-download-btn') as HTMLButtonElement;
        const cancelBtn = dialogContainer.querySelector('#format-cancel-btn') as HTMLButtonElement;

        downloadBtn.addEventListener('click', async () => {
            const selectedFormat = (dialogContainer.querySelector('input[name="format"]:checked') as HTMLInputElement).value as 'png' | 'webp';
            dialogContainer.remove();
            resolve(selectedFormat);
        });

        cancelBtn.addEventListener('click', () => {
            dialogContainer.remove();
            resolve(null);
        });

        // ダイアログの背景クリックでキャンセル
        dialogContainer.addEventListener('click', (e) => {
            if (e.target === dialogContainer) {
                dialogContainer.remove();
                resolve(null);
            }
        });

        // エンターキーでダウンロード
        dialogContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                downloadBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
    });
}

/**
 * ダウンロードファイル名を生成
 * 形式: studio_YYYYMMDD-HHmmss.(server側のジョブID).(拡張子)
 */
function generateDownloadFilename(createdAt: number, serverJobId: string, extension: string): string {
    const date = new Date(createdAt * 1000); // UNIXタイムスタンプは秒なので1000をかける
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
    return `studio_${timestamp}.${serverJobId}.${extension}`;
}

/**
 * 画像をダウンロード
 */
async function downloadImage(id: string, blobId: string): Promise<void> {
    try {
        // IndexedDB から Blob を取得
        const imageEntry = await getImageFromIndexedDB(blobId);
        if (!imageEntry) {
            alert('画像が見つかりません');
            return;
        }

        // フォーマット選択ダイアログを表示
        const selectedFormat = await showFormatSelectionDialog();
        if (!selectedFormat) {
            // キャンセルされた
            return;
        }

        let blobData = imageEntry.blob;
        let extension = selectedFormat;

        // フォーマット変換が必要な場合は変換
        if (selectedFormat === 'png' && !imageEntry.blob.type.includes('png')) {
            console.info('Converting image to PNG format...');
            blobData = await convertImageFormat(imageEntry.blob, 'png');
        } else if (selectedFormat === 'webp' && !imageEntry.blob.type.includes('webp')) {
            console.info('Converting image to WEBP format...');
            blobData = await convertImageFormat(imageEntry.blob, 'webp');
        }

        // Blob URL を作成してダウンロード
        const blobUrl = URL.createObjectURL(blobData);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = generateDownloadFilename(imageEntry.createdAt, imageEntry.serverJobId || id, extension);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // メモリを解放
        URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Failed to download image:', error);
        alert('ダウンロードに失敗しました');
    }
}

/**
 * 履歴アイテムを削除
 */

// グローバル変数：初回ロード済みフラグと既存アイテムID管理
let isHistoryInitialized = false;
let renderedHistoryIds = new Set<string>();

// イベントハンドラーの参照を保持（古いリスナーを削除するため）
let currentHistoryClickHandler: ((e: Event) => void) | null = null;

// 履歴更新のデバウンスタイマー
let historyUpdateTimeout: number | null = null;

/**
 * ジョブキューセクションを更新
 */
function updateJobQueueSection(): void {
    const jobQueueContainer = document.querySelector('.job-queue');
    const rightPanel = document.querySelector('.right-panel');

    if (!rightPanel) return;

    const activeJobs = stateManager.getJobQueue().filter((job: RequestJob) =>
        job.status !== 'completed' && job.status !== 'failed'
    );

    // 既存のジョブキューセクションを削除
    if (jobQueueContainer) {
        jobQueueContainer.remove();
    }

    // アクティブなジョブがある場合のみ表示
    if (activeJobs.length > 0) {
        const jobQueueHtml = `
            <div class="job-queue">
                <h2>実行中ジョブ(${activeJobs.length})</h2>
                <div class="job-queue-items">
                    ${activeJobs.map(job => {
            // promptId（サーバー側のジョブID）を優先的に表示
            const displayJobId = job.promptId || job.jobId || '';
            return `
                        <div class="job-item" data-job-id="${job.jobId}">
                            <div class="job-status">${job.status === 'running' ? '⚙️ 生成中...' : '⏳ 待機中...'}</div>
                            <div class="job-info">
                                <p class="job-prompt"><strong>JobID:</strong> ${escapeHtml(displayJobId)}</p>
                            </div>
                        </div>
                    `;
        }).join('')}
                </div>
            </div>
        `;

        const historySection = rightPanel.querySelector('#history-section');
        if (historySection) {
            historySection.insertAdjacentHTML('beforebegin', jobQueueHtml);
        }
    }

    // 画像生成ボタンの状態を更新
    updateGenerateButtonsState();
}

/**
 * 画像生成ボタンの状態を更新
 */
function updateGenerateButtonsState(): void {
    const generateBtnTop = document.getElementById('generate-btn-top') as HTMLButtonElement;
    const generateBtnBottom = document.getElementById('generate-btn-bottom') as HTMLButtonElement;

    if (generateBtnTop) {
        generateBtnTop.disabled = false;
    }
    if (generateBtnBottom) {
        generateBtnBottom.disabled = false;
    }
}

/**
 * 履歴部分のみを更新（差分更新）
 * 初回ロード時は全体構築、2回目以降は新規アイテムのみを追加
 */
async function updateHistorySection(): Promise<void> {
    const historyContent = document.getElementById('history-content');
    if (!historyContent) {
        return;
    }

    const history = loadHistory();
    const countBadge = document.getElementById('history-count-badge');

    // 初回ロード時：全体構築
    if (!isHistoryInitialized) {
        historyContent.innerHTML = await renderHistoryContent(history, config!);
        renderedHistoryIds = new Set(history.map(entry => entry.id));
        isHistoryInitialized = true;

        if (countBadge) {
            countBadge.textContent = String(history.length);
        }

        setupHistoryEventDelegation();
        return;
    }

    // 2回目以降：差分更新（新規アイテムのみを先頭に追加）
    const newEntries = history.filter(entry => !renderedHistoryIds.has(entry.id));

    if (newEntries.length > 0) {
        const newItemsHtml = await Promise.all(
            newEntries.map((entry) => renderHistoryItem(entry, config!))
        );

        const validNewItems = newItemsHtml.filter((item): item is string => item !== null);

        let historyContainer = historyContent.querySelector('.history-container') as HTMLElement | null;

        if (!historyContainer) {
            const containerHtml = `<div class="history-container">${validNewItems.join('')}</div>`;
            historyContent.innerHTML = containerHtml;
        } else {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = validNewItems.join('');
            while (tempDiv.firstChild) {
                historyContainer.insertBefore(tempDiv.firstChild, historyContainer.firstChild);
            }
        }

        newEntries.forEach(entry => {
            renderedHistoryIds.add(entry.id);
        });
    }

    // カウント表示を更新
    if (countBadge) {
        countBadge.textContent = String(history.length);
    }
}

/**
 * 履歴コンテナのイベントリスナーを設定（Event Delegation）
 */
function setupHistoryEventDelegation(): void {
    const historyContent = document.getElementById('history-content');
    if (!historyContent) {
        return;
    }

    // 既にイベントリスナーが登録されている場合はスキップ
    if (currentHistoryClickHandler) {
        return;
    }

    // クリックイベントハンドラを登録
    const clickHandler = (e: Event) => {
        handleHistoryClick(e).catch(error => {
            console.error('Error in handleHistoryClick:', error);
        });
    };

    historyContent.addEventListener('click', clickHandler, false);
    currentHistoryClickHandler = clickHandler;
}

/**
 * 履歴コンテナのクリックイベントハンドラー（単純化）
 */
async function handleHistoryClick(e: Event): Promise<void> {
    const target = e.target as HTMLElement;

    // ダウンロードボタン
    const downloadBtn = target.closest('.download-btn') as HTMLElement | null;
    if (downloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        const blobId = downloadBtn.getAttribute('data-blob-id');
        const id = downloadBtn.getAttribute('data-id');
        if (blobId && id) {
            await downloadImage(id, blobId);
        }
        return;
    }

    // Favoriteボタン
    const favoriteBtn = target.closest('.favorite-btn') as HTMLElement | null;
    if (favoriteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = favoriteBtn.getAttribute('data-id');
        if (id) {
            const isFavorited = favoriteBtn.classList.contains('favorited');
            favoriteBtn.classList.toggle('favorited');
            favoriteBtn.textContent = isFavorited ? '☆' : '⭐';
            favoriteBtn.setAttribute('title', isFavorited ? 'お気に入り追加' : 'お気に入り解除');
            toggleFavoriteHistoryEntry(id);
            renderedHistoryIds.delete(id);
        }
        return;
    }

    // クイックセーブボタン
    const quicksaveBtn = target.closest('.quicksave-template-btn') as HTMLElement | null;
    if (quicksaveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const positive = quicksaveBtn.getAttribute('data-positive') || '';
        const negative = quicksaveBtn.getAttribute('data-negative') || '';
        await quickSaveTemplate(positive, negative);
        await updateHistorySection();
        return;
    }

    // 履歴適用ボタン
    const applyBtn = target.closest('.apply-prompt-btn') as HTMLElement | null;
    if (applyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const positive = applyBtn.getAttribute('data-positive') || '';
        const negative = applyBtn.getAttribute('data-negative') || '';
        await applyPrompt(positive, negative);
        return;
    }

    // 履歴追記ボタン
    const mergeBtn = target.closest('.merge-prompt-btn') as HTMLElement | null;
    if (mergeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const positive = mergeBtn.getAttribute('data-positive') || '';
        const negative = mergeBtn.getAttribute('data-negative') || '';
        await mergePrompt(positive, negative);
        return;
    }

    // 削除ボタン
    const deleteBtn = target.closest('.delete-btn') as HTMLElement | null;
    if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-id');
        if (id) {
            const historyItem = deleteBtn.closest('.history-item') as HTMLElement | null;
            if (historyItem) {
                historyItem.remove();
            }
            try {
                await deleteHistoryItemHelper(id, renderedHistoryIds);
            } catch (error) {
                alert(error instanceof Error ? error.message : String(error));
            }
            await updateHistorySection();
        }
        return;
    }

    // コピーボタン
    const copyBtn = target.closest('.copy-btn') as HTMLElement | null;
    if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const text = copyBtn.getAttribute('data-text');
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✓ コピー完了';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            } catch (error) {
                console.error('Copy failed:', error);
            }
        }
        return;
    }

    // エラー削除ボタン
    if (target.id === 'clear-all-history-error-btn') {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('履歴をすべて削除しますか？この操作は取り消せません。')) {
            await clearHistory();
            isHistoryInitialized = false;
            renderedHistoryIds.clear();
            await updateHistorySection();
        }
        return;
    }
}

/**
 * アプリケーション初期化
 */
async function initializeApp(): Promise<void> {
    try {
        // APIより設定を読み込み（fetch で動的に読み込む）
        config = await getConfig();
    } catch (configError) {
        config = getDefaultConfig();
        isOfflineMode = true;
        console.warn('[App] Running in offline mode - using default configuration');
    }

    try {
        // ローディング表示
        appElement.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>初期化中...</p>
      </div>
    `;

        // IndexedDBを初期化
        try {
            await initIndexedDB();
        } catch (dbError) {
            console.error('[IndexedDB] Initialization failed:', dbError);
            console.warn('[IndexedDB] Attempting to reset database...');
            try {
                await resetIndexedDB();
                await initIndexedDB();
                console.log('[IndexedDB] Database reset and reinitialized successfully');
            } catch (resetError) {
                console.error('[IndexedDB] Reset failed:', resetError);
                // リセット失敗時も続行（ローカルストレージのみで動作）
            }
        }

        // タグ辞書を読み込み
        await tagDictionary.load();

        // プロンプト翻訳機能を初期化
        promptTranslator = createPromptTranslator(tagDictionary);

        // コントローラーを初期化
        appController = new AppController(config);

        // ジョブ完了時のコールバックを設定（可視化のためUIを更新）
        appController.setOnJobCompleted(async (jobId: string) => {
            console.log(`[App] Job completed: ${jobId}, updating UI...`);
            await updateHistorySection();
        });

        // UI設定を復元（CSS変数設定）
        restoreUIPreferences();


        // 初回レンダリング
        await renderUI();

        // stateManagerの変更を監視してUIを更新
        stateManager.subscribe(() => {
            updateJobQueueSection();

            // 履歴更新をデバウンス（300msごとに1回）
            // こうすることで、ジョブが完了するたびに履歴が更新される
            if (historyUpdateTimeout !== null) {
                clearTimeout(historyUpdateTimeout);
            }
            historyUpdateTimeout = window.setTimeout(() => {
                updateHistorySection().catch(error => {
                    console.error('Failed to update history:', error);
                });
                historyUpdateTimeout = null;
            }, 300);
        });

        // 初回セットアップ（メニュー）
        await initializeMenu({})
            .catch(error => {
                console.error('Failed to initialize menu:', error);
            });
        // setupHistoryEventDelegation は renderUI 内で呼ばれるため、ここでは呼ばない

    } catch (error) {
        appElement.innerHTML = `
      <div class="error">
        <h2>初期化エラー</h2>
        <p>${error instanceof Error ? error.message : String(error)}</p>
      </div>
    `;
    }
}

/**
 * テンプレート選択モーダルを表示
 */
async function showTemplateSelectionModal(): Promise<void> {
    try {
        const modal = document.getElementById('template-selection-modal');
        if (!modal) return;

        const listContainer = document.getElementById('template-selection-list');
        if (!listContainer) return;

        const detailPanel = document.getElementById('template-detail-panel');
        if (!detailPanel) return;

        // 既存のイベントリスナーをクリアするため、要素をクローン
        const newListContainer = listContainer.cloneNode(true) as HTMLElement;
        listContainer.parentNode?.replaceChild(newListContainer, listContainer);

        // すべてのテンプレートを取得
        const allTemplates = await getAllTemplatesFromIndexedDB();

        // 実プロンプトを持つテンプレートのみをフィルタリング
        const selectableTemplates = allTemplates.filter(hasPromptContent);

        if (selectableTemplates.length === 0) {
            newListContainer.innerHTML = '<p style="color: #666; padding: 1rem;">保存済みテンプレートはありません</p>';
            detailPanel.innerHTML = '<div class="template-detail-empty">保存済みテンプレートがありません</div>';
        } else {
            // テンプレートアイテムをレンダリング（階層対応、深度情報を含める）
            const renderItem = (template: PromptTemplate, depth: number): string => {
                // 子テンプレートを取得して子の有無を判定
                const children = allTemplates
                    .filter((t: PromptTemplate) => t.parentId === template.id)
                    .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

                const hasChildren = children.length > 0;
                const isParent = !template.positivePrompt;
                const createdDate = new Date(template.createdAt * 1000).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                });

                const paddingLeft = depth * 20;

                if (isParent) {
                    // 親ラベル（プロンプトなし）
                    return `
                        <div class="template-category" style="padding-left: ${paddingLeft}px;"
                             data-template-id="${escapeHtml(template.id)}">
                            ${hasChildren
                            ? `<button class="btn-toggle-children" data-template-id="${escapeHtml(template.id)}" title="展開">
                                <span class="toggle-icon">▶</span>
                              </button>`
                            : '<span class="toggle-placeholder"></span>'
                        }
                            <div class="template-item-content">
                                <div class="template-name">${escapeHtml(template.name)}</div>
                                <span class="parent-label-badge">親ラベル</span>
                            </div>
                        </div>
                        ${hasChildren ? `<div class="template-children collapsed" data-parent-id="${escapeHtml(template.id)}"></div>` : ''}
                    `;
                }

                // 実プロンプトを持つテンプレート（選択可能）
                return `
                    <div class="template-selection-item" style="padding-left: ${paddingLeft}px;"
                         data-template-id="${escapeHtml(template.id)}">
                        ${hasChildren
                        ? `<button class="btn-toggle-children" data-template-id="${escapeHtml(template.id)}" title="展開">
                                <span class="toggle-icon">▶</span>
                              </button>`
                        : '<span class="toggle-placeholder"></span>'
                    }
                        <div class="template-item-content">
                            <div class="template-name">${escapeHtml(template.name)}</div>
                            <div class="template-date">作成日時: ${escapeHtml(createdDate)}</div>
                        </div>
                    </div>
                    ${hasChildren ? `<div class="template-children collapsed" data-parent-id="${escapeHtml(template.id)}"></div>` : ''}
                `;
            };

            // カスタム階層レンダリング（子要素を別途処理）
            const renderTemplateItemWithChildrenForModal = (
                template: PromptTemplate,
                depth: number
            ): string => {
                const itemHtml = renderItem(template, depth);

                // 子テンプレートを取得
                const children = allTemplates
                    .filter((t: PromptTemplate) => t.parentId === template.id)
                    .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

                if (children.length === 0) {
                    return itemHtml;
                }

                // 子要素のHTMLを生成
                const childrenHtml = children
                    .map((child: PromptTemplate) => renderTemplateItemWithChildrenForModal(child, depth + 1))
                    .join('');

                return `${itemHtml}<div class="template-children-wrapper" data-parent-id="${escapeHtml(template.id)}" style="display: none;">${childrenHtml}</div>`;
            };

            // ルートテンプレートをレンダリング
            const rootTemplates = allTemplates
                .filter((t: PromptTemplate) => !t.parentId)
                .sort((a: PromptTemplate, b: PromptTemplate) => (a.order || 0) - (b.order || 0));

            const templateListHTML = rootTemplates
                .map((template: PromptTemplate) => renderTemplateItemWithChildrenForModal(template, 0))
                .join('');

            newListContainer.innerHTML = templateListHTML;

            // 展開/折り畳み機能（ボタンまたは親ラベルクリック）
            const toggleChildren = (templateId: string) => {
                const childrenWrapper = newListContainer.querySelector(
                    `.template-children-wrapper[data-parent-id="${templateId}"]`
                ) as HTMLElement | null;

                if (childrenWrapper) {
                    const isHidden = childrenWrapper.style.display === 'none';
                    childrenWrapper.style.display = isHidden ? 'block' : 'none';

                    // アイコンを回転
                    const toggleBtn = newListContainer.querySelector(
                        `.btn-toggle-children[data-template-id="${templateId}"]`
                    ) as HTMLElement | null;
                    if (toggleBtn) {
                        const icon = toggleBtn.querySelector('.toggle-icon');
                        if (icon) {
                            icon.textContent = isHidden ? '▼' : '▶';
                        }
                    }
                }
            };

            // 統一されたクリックハンドラー
            newListContainer.addEventListener('click', async (e) => {
                const target = e.target as HTMLElement;

                // 展開/折り畳みボタン
                const toggleBtn = target.closest('.btn-toggle-children') as HTMLElement | null;
                if (toggleBtn) {
                    const templateId = toggleBtn.getAttribute('data-template-id');
                    if (templateId) {
                        toggleChildren(templateId);
                    }
                    return;
                }

                // 親ラベルクリックで展開/折り畳み
                const parentLabel = target.closest('.template-category') as HTMLElement | null;
                if (parentLabel) {
                    const templateId = parentLabel.getAttribute('data-template-id');
                    if (templateId) {
                        toggleChildren(templateId);
                    }
                    return;
                }

                // テンプレートアイテムクリック（詳細表示）
                const item = target.closest('.template-selection-item') as HTMLElement | null;
                if (item) {
                    const templateId = item.getAttribute('data-template-id');
                    if (templateId) {
                        newListContainer.querySelectorAll('.template-selection-item').forEach(el => {
                            el.classList.remove('active');
                        });
                        item.classList.add('active');

                        const template = allTemplates.find(t => t.id === templateId);
                        if (template) {
                            displayTemplateDetail(template, detailPanel);
                        }
                    }
                    return;
                }
            });

            // ダブルクリックで適用
            newListContainer.addEventListener('dblclick', async (e) => {
                const item = (e.target as HTMLElement).closest('.template-selection-item');
                if (item) {
                    const templateId = item.getAttribute('data-template-id');
                    if (templateId) {
                        modal.style.display = 'none';
                        await applyPromptFromTemplate(templateId);
                    }
                }
            });
        }

        // モーダルを表示
        modal.style.display = 'flex';

        // モーダルクローズ処理をセットアップ
        setupModalClose('template-selection-modal', 'template-selection-close');
    } catch (error) {
        console.error('Failed to show template selection modal:', error);
        alert(`テンプレートの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * テンプレートの詳細を右パネルに表示
 */
function displayTemplateDetail(template: PromptTemplate, panel: HTMLElement): void {
    panel.innerHTML = `
        <div class="template-detail-name">${escapeHtml(template.name)}</div>

        <div class="template-detail-section">
            <div class="template-detail-label">ポジティブプロンプト</div>
            <div class="template-detail-content">${escapeHtml(template.positivePrompt)}</div>
        </div>

        ${template.negativePrompt ? `
            <div class="template-detail-section">
                <div class="template-detail-label">ネガティブプロンプト</div>
                <div class="template-detail-content">${escapeHtml(template.negativePrompt)}</div>
            </div>
        ` : ''}

        <div class="apply-and-merge-buttons">
            <button class="primary apply-template-btn" data-template-id="${template.id}">適用(上書き)</button>
            <button class="merge-template-btn" data-template-id="${template.id}">マージ</button>
        </div>
    `;

    // テンプレート詳細パネル内のボタンイベント
    const applyBtn = panel.querySelector('.apply-template-btn') as HTMLElement | null;
    if (applyBtn) {
        applyBtn.onclick = async () => {
            const modal = document.getElementById('template-selection-modal');
            if (modal) {
                modal.style.display = 'none';
            }
            await applyPromptFromTemplate(template.id);
        };
    }

    const addBtn = panel.querySelector('.merge-template-btn') as HTMLElement | null;
    if (addBtn) {
        addBtn.onclick = async () => {
            const modal = document.getElementById('template-selection-modal');
            if (modal) {
                modal.style.display = 'none';
            }
            await mergePromptFromTemplate(template.id);
        };
    }
}

/**
 * テンプレートを適用（フォームに読み込む）
 */
async function applyPromptFromTemplate(templateId: string): Promise<void> {
    const template = await getTemplateFromIndexedDB(templateId);
    if (!template) {
        alert('テンプレートが見つかりません');
        return;
    }

    await applyPrompt(template.positivePrompt, template.negativePrompt);
}

/**
 * プロンプトを適用（フォームに読み込む）
 */
async function applyPrompt(positivePromptValue: string, negativePromptValue: string): Promise<void> {
    try {
        setPromptValues(positivePromptValue, negativePromptValue);
        //alert(`プロンプトを適用しました`);
    } catch (error) {
        console.error('Failed to apply prompt:', error);
        alert(`プロンプトの適用に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * テンプレートコンテンツを既存プロンプトに追加（重複排除）
 * 既存のプロンプト内のカンマ区切り文字列と重複しない形で新規ワードを追記
 */
async function mergePromptFromTemplate(templateId: string): Promise<void> {
    const template = await getTemplateFromIndexedDB(templateId);
    if (!template) {
        alert('テンプレートが見つかりません');
        return;
    }
    await mergePrompt(template.positivePrompt, template.negativePrompt);
}

/**
 * プロンプトを既存プロンプトに追加（重複排除）
 * 既存のプロンプト内のカンマ区切り文字列と重複しない形で新規ワードを追記
 */
async function mergePrompt(positivePromptValue: string, negativePromptValue: string): Promise<void> {
    try {
        const currentValues = getPromptValues();
        const mergedPositive = mergePromptContent(currentValues.positive, positivePromptValue);
        const mergedNegative = mergePromptContent(currentValues.negative, negativePromptValue);
        setPromptValues(mergedPositive, mergedNegative);
        //alert(`プロンプトをマージしました`);
    } catch (error) {
        console.error('Failed to add prompt content:', error);
        alert(`プロンプトの追加に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// アプリケーション開始
initializeApp();

// ページリロード時、実行中のジョブがある場合は確認を表示
window.addEventListener('beforeunload', (event) => {
    // 実行中のジョブがある場合、ページリロードの確認を表示
    const activeJobsCount = stateManager.getActiveJobsCount();
    if (activeJobsCount > 0) {
        const message = `${activeJobsCount}のジョブが実行中です。本当にページを離れますか？`;
        event.preventDefault();
        event.returnValue = message;
        return message;
    }
});

// クリーンアップ
window.addEventListener('beforeunload', () => {
    if (appController) {
        appController.cleanup();
    }
});
