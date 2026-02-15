/**
 * サイドメニュー管理モジュール
 * 複数のページで使用する共通メニュー機能
 */

interface MenuConfig {
    title?: string;
    onPromptSelect?: (positivePrompt: string, negativePrompt: string, width: number, height: number, seed: string, workflowName: string) => void; // プロンプト選択時のコールバック
    sections?: MenuSection[];
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

interface MenuItem {
    icon: string;
    label: string;
    href?: string;
    onClick?: () => void;
}

// ========================================
// メニューHTML生成
// ========================================

/**
 * メニューHTML を生成
 * @param config メニュー設定
 */
export function generateMenuHTML(config: MenuConfig = {}): string {
    const {
        title = 'Menu'
    } = config;

    let menuSections = `
        <div class="menu-section">
            <div class="menu-section-title">ナビゲーション</div>
            <ul class="menu-items">
                <li class="menu-item">
                    <a href="/">
                        <span class="icon">🏠</span>
                        <span>ホーム</span>
                    </a>
                </li>
                <li class="menu-item">
                    <a href="/prompt-template.html">
                        <span class="icon">💾</span>
                        <span>プロンプトテンプレート</span>
                    </a>
                </li>
            </ul>
        </div>
    `;

    return `
        <!-- メニュー開閉トグルボタン -->
        <button class="menu-toggle" id="menu-toggle" title="メニューを開く">☰</button>

        <!-- サイドメニュー -->
        <nav class="sidebar-menu" id="sidebar-menu">
            <div class="sidebar-menu-header">
                <h2>${title}</h2>
                <button class="menu-close-btn" id="menu-close-btn" title="メニューを閉じる">✕</button>
            </div>
            <div class="sidebar-menu-content">
                ${menuSections}
            </div>
        </nav>

        <!-- メニューオーバーレイ -->
        <div class="menu-overlay" id="menu-overlay"></div>
    `;
}

// ========================================
// メニュー機能セットアップ
// ========================================

/**
 * メニュー機能を初期化・設定（プロンプト履歴対応）
 */
export function setupMenu(config: MenuConfig = {}): void {
    // グローバルなメニュー設定を保存（動的更新時に使用）
    (window as any).__menuConfig = config;

    const menuToggle = document.getElementById('menu-toggle') as HTMLButtonElement;
    const sidebarMenu = document.getElementById('sidebar-menu') as HTMLElement;
    const menuOverlay = document.getElementById('menu-overlay') as HTMLElement;
    const menuCloseBtn = document.getElementById('menu-close-btn') as HTMLButtonElement;

    if (!menuToggle || !sidebarMenu || !menuOverlay || !menuCloseBtn) {
        console.warn('[Menu] Required menu elements not found');
        return;
    }

    // メニューを開く関数
    const openMenu = () => {
        sidebarMenu.classList.add('open');
        menuOverlay.classList.add('active');
    };

    // メニューを閉じる関数
    const closeMenu = () => {
        sidebarMenu.classList.remove('open');
        menuOverlay.classList.remove('active');
    };

    // メニュートグルボタンのクリックイベント
    menuToggle.addEventListener('click', () => {
        if (sidebarMenu.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // メニュー閉じるボタンのクリックイベント
    menuCloseBtn.addEventListener('click', () => {
        closeMenu();
    });

    // オーバーレイのクリックイベント
    menuOverlay.addEventListener('click', () => {
        closeMenu();
    });

    // メニュー内のリンククリック時に自動的に閉じる
    const menuLinks = sidebarMenu.querySelectorAll('.menu-item a');
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            const href = link.getAttribute('href');
            // href="#" かつ onclick がない場合は閉じない
            if (href !== '#' || link.hasAttribute('onclick')) {
                setTimeout(() => {
                    closeMenu();
                }, 100);
            }
        });
    });

    // ESC キー押下でメニューを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebarMenu.classList.contains('open')) {
            closeMenu();
        }
    });
}

// ========================================
// メニュー初期化
// ========================================

/**
 * ページ内にメニューを挿入して初期化
 */
export async function initializeMenu(config: MenuConfig = {}): Promise<void> {
    // メニューHTMLを生成
    const menuHTML = generateMenuHTML(config);

    // DOMに挿入（main-content-wrapperの最初に挿入）
    const mainContentWrapper = document.getElementById('main-content-wrapper');
    if (mainContentWrapper) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = menuHTML;
        while (tempDiv.firstChild) {
            mainContentWrapper.insertBefore(tempDiv.firstChild, mainContentWrapper.firstChild);
        }
    } else {
        // fallback: bodyの最初に挿入
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = menuHTML;
        while (tempDiv.firstChild) {
            document.body.insertBefore(tempDiv.firstChild, document.body.firstChild);
        }
    }

    // メニュー機能を初期化
    setupMenu(config);
}
