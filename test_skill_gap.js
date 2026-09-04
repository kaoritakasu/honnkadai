const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:4201', { waitUntil: 'networkidle', timeout: 30000 });
    
    const screenshot = await page.screenshot({ path: '/tmp/skill-gap-ui.png' });
    console.log('Screenshot saved to /tmp/skill-gap-ui.png');
    
    const html = await page.content();
    
    // スキルギャップ関連のチェック
    console.log('\n=== UI Updates Check ===');
    if (html.includes('総合達成率')) {
      console.log('✓ 総合達成率の表示が確認されました');
    } else if (html.includes('平均ギャップ')) {
      console.log('✗ 古い表現「平均ギャップ」がまだ表示されています');
    } else {
      console.log('? スキルギャップセクションが見つかりません（ログイン画面の可能性）');
    }
    
    // HTMLから色の情報を確認
    if (html.includes('10b981')) {
      console.log('✓ 緑色（#10b981）が含まれています');
    }
    if (html.includes('f97316')) {
      console.log('✓ オレンジ色（#f97316）が含まれています');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
