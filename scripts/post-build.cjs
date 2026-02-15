const fs = require('fs');
const path = require('path');

/**
 * TypeScriptコンパイル後の処理:
 * 1. .js ファイルを .cjs にリネーム
 * 2. require文のパスに .cjs 拡張子を追加
 * 3. ダッシュボードファイルをdist-serverにコピー
 */
function postBuild() {
    const dir = 'dist-server';

    if (!fs.existsSync(dir)) {
        console.error(`Error: ${dir} directory not found`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

    if (files.length === 0) {
        console.log('No .js files to process');
        return;
    }

    files.forEach(f => {
        const file = path.join(dir, f);
        let content = fs.readFileSync(file, 'utf8');

        // require("./module") -> require("./module.cjs") に変換
        content = content.replace(
            /require\("\.\/([^"]+)"\)/g,
            (match, p1) => `require("./${p1}.cjs")`
        );

        const newFile = file.replace('.js', '.cjs');
        fs.writeFileSync(newFile, content);
        fs.unlinkSync(file);

        console.log(`Processed: ${f} -> ${path.basename(newFile)}`);
    });

    console.log(`✓ Post-build completed: ${files.length} file(s) processed`);
}

postBuild();
