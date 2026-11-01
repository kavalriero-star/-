// 브라우저 종단 시험(개발용, npm test에는 포함하지 않음): node test/e2e/app.e2e.mjs [스크린샷폴더]
// 실제 서버를 모의 AI·모의 그림으로 띄우고 화면을 처음부터 끝까지 누른다.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.argv[2] || null;
const real = path.join(here, '..', '..', 'questions');
const questionsDir = await fs.access(real).then(() => real).catch(() => path.join(here, '..', 'fixtures', 'bank'));
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-e2e-'));
const srv = await startServer({ port: 0, data, questionsDir, mockDelay: 30, imageMock: true, log: false });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const errors = [];
const log = (...a) => console.log(...a);
const browser = await chromium.launch(fs.access('/opt/pw-browsers/chromium-1194/chrome-linux/chrome').then ? {} : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: false }); };
const wait = (ms) => page.waitForTimeout(ms);
try {
  log('questions:', path.basename(questionsDir) === 'bank' ? '시험용 문항 은행' : '실제 문항 은행');
  await page.goto(srv.url);
  await page.waitForSelector('text=어떤 이야기를 함께 쓸까요?');
  log('홈 표시, 모의 배너:', await page.isVisible('text=모의 AI'));
  await shot('01-home');
  await page.click('text=새 작품 시작');
  await page.click('[data-act="genre"][data-id="hunter"]');
  await page.click('[data-act="genre"][data-id="wuxia"]');
  log('혼합 정책 표시:', await page.isVisible('text=혼합 정책'));
  await page.fill('#nwTitle', '균열 아래 청운문');
  await page.fill('#nwLog', 'E급 헌터가 게이트 심층에서 사라진 무림 문파의 석비를 발견한다');
  await shot('02-new');
  await page.click('[data-act="createWork"]');
  await page.waitForSelector('text=진행률');
  let rounds = 0;
  let edited = false;
  while (rounds++ < 40) {
    if (await page.isVisible('text=모든 문항을 지나왔어요')) break;
    if (await page.isVisible('[data-act="propose"]')) {
      await page.click('[data-act="propose"]');
      await page.waitForSelector('[data-act="pickCand"], .errline', { timeout: 10000 });
      if (rounds === 1) await shot('03-wizard-candidates');
    }
    if (await page.isVisible('[data-act="pickCand"]')) {
      if (!edited && await page.isVisible('[data-act="editCand"]')) {
        edited = true;
        await page.click('[data-act="editCand"] >> nth=0');
        await page.waitForSelector('#editBox');
        await shot('04-wizard-edit');
        await page.click('[data-act="confirmEdit"]');
        await wait(150);
        continue;
      }
      await page.click('[data-act="pickCand"] >> nth=0');
      await wait(120);
      continue;
    }
    if (await page.isVisible('[data-act="skip"]')) { await page.click('[data-act="skip"]'); await wait(100); continue; }
    break;
  }
  log('위저드 완료 화면:', await page.isVisible('text=모든 문항을 지나왔어요'), '라운드', rounds);
  await shot('05-wizard-done');
  // 되돌리기 한 번
  const undoBtn = page.locator('[data-act="undoAsk"]').first();
  if (await undoBtn.isVisible()) {
    await undoBtn.click();
    if (await page.isVisible('[data-act="undo"][data-cascade="0"]')) await page.click('[data-act="undo"][data-cascade="0"]');
    await wait(200);
    log('되돌린 뒤 후보 다시 보임:', await page.isVisible('[data-act="pickCand"]') || await page.isVisible('[data-act="propose"]'));
    if (await page.isVisible('[data-act="pickCand"]')) await page.click('[data-act="pickCand"] >> nth=0');
    else { await page.click('[data-act="propose"]'); await page.waitForSelector('[data-act="pickCand"]'); await page.click('[data-act="pickCand"] >> nth=0'); }
    await wait(200);
  }
  while (!(await page.isVisible('[data-act="startWriting"]'))) {
    if (await page.isVisible('[data-act="pickCand"]')) await page.click('[data-act="pickCand"] >> nth=0');
    else if (await page.isVisible('[data-act="propose"]')) { await page.click('[data-act="propose"]'); await page.waitForSelector('[data-act="pickCand"]'); }
    else break;
    await wait(120);
  }
  await page.click('[data-act="startWriting"]');
  await page.waitForSelector('.write3');
  if (await page.isVisible('text=첫 장면 추가')) await page.click('text=첫 장면 추가');
  await page.waitForSelector('[data-meta="goal"]');
  const goal = page.locator('[data-meta="goal"]').last();
  await goal.fill('석비 발견');
  await goal.dispatchEvent('change');
  const beats = page.locator('[data-meta="beats"]').last();
  await beats.fill('도윤이 심층 3층에서 석비를 발견한다\n교신이 끊긴다\n석비가 반응한다');
  await beats.dispatchEvent('change');
  await wait(300);
  await page.click('[data-act="preview"]');
  await page.waitForSelector('text=기억 장부');
  log('기억 장부 표시:', await page.isVisible('text=고정 기억 · 작품 헌장'));
  await page.click('[data-act="draft"]');
  await page.waitForSelector('[data-act="acceptDraft"]', { timeout: 10000 });
  await shot('06-write-draft');
  await page.click('[data-act="acceptDraft"]');
  await page.waitForSelector('text=기억을 갱신했어요');
  const txt = await page.locator('textarea.ms').last().inputValue();
  log('원고에 들어감:', txt.includes('모의 초안'));
  // 다듬기: 본문 일부 선택
  await page.click('[data-act="mode"][data-mode="polish"]');
  await page.locator('textarea.ms').last().evaluate((t) => { t.focus(); t.setSelectionRange(0, 20); t.dispatchEvent(new Event('select', { bubbles: true })); });
  await page.click('[data-act="draft"]');
  await page.waitForSelector('[data-act="acceptAlt"]', { timeout: 10000 });
  log('다듬기 대안:', await page.locator('[data-act="acceptAlt"]').count());
  await page.click('[data-act="acceptAlt"] >> nth=0');
  await page.waitForSelector('text=기억을 갱신했어요');
  // 회차 요약
  await page.click('[data-act="summarizeEp"]');
  await page.waitForSelector('[data-act="acceptSummary"]', { timeout: 10000 });
  await page.click('[data-act="acceptSummary"]');
  await wait(300);
  // 기억 탭
  await page.click('[data-act="tab"][data-tab="mem"]');
  await page.waitForSelector('text=마지막 기억 장부');
  await page.fill('#pinNotes', '도윤은 반말만 쓴다');
  await page.click('[data-act="savePins"]');
  await wait(300);
  log('회차 요약 저장:', await page.isVisible('text=1화'));
  await shot('07-memory');
  // 그림 탭: 수동 가져오기
  await page.click('[data-act="tab"][data-tab="img"]');
  await page.waitForSelector('#imKind');
  await page.selectOption('#imKind', 'character');
  await wait(200);
  const opts = await page.locator('#imTarget option').count();
  if (opts > 1) await page.selectOption('#imTarget', { index: 1 });
  await page.click('[data-act="imgPrompt"]');
  await page.waitForSelector('#imPrompt');
  log('그림 프롬프트에 금지 규칙:', (await page.inputValue('#imPrompt')).includes('글자'));
  await page.setInputFiles('#imFile', { name: '도윤.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.thumb');
  await page.click('.thumb >> nth=0');
  await wait(200);
  if (await page.isVisible('[data-act="setPortrait"]')) await page.click('[data-act="setPortrait"]');
  await page.click('[data-act="insertImg"]');
  await wait(1500);
  log('원고에 그림 자리:', (await page.locator('textarea.ms').last().inputValue()).includes('](그림:im_'));
  await shot('08-images');
  // AI 연결: 그림 자동 생성 켜기
  await page.click('#topnav >> text=AI 연결');
  await page.waitForSelector('#stImg');
  await shot('09-settings');
  await page.selectOption('#stImg', 'codex');
  await page.click('[data-act="saveSettings"]');
  await wait(300);
  await page.goBack();
  await page.goBack();
  await page.waitForTimeout(1500);
  log('뒤로 두 번 뒤 화면이 주소와 일치:', await page.isVisible('.wiz'));
  await page.click('#topnav >> text=집필');
  await page.waitForSelector('.write3');
  await page.click('[data-act="tab"][data-tab="img"]');
  await page.waitForSelector('[data-act="imgGenerate"]');
  await page.click('[data-act="imgGenerate"]');
  await page.waitForSelector('[data-yes]');
  log('그림 생성 전 한도 확인창:', true);
  await page.click('[data-yes]');
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length >= 2, null, { timeout: 10000 });
  log('자동 생성 그림 저장:', await page.locator('.thumb').count());
  // 설정집
  await page.click('#topnav >> text=설정집');
  await page.waitForSelector('.lib');
  await page.click('[data-act="bibCat"][data-c="character"]');
  await wait(200);
  await shot('10-bible');
  log('설정집 인물 카드:', await page.locator('.lc').count());
  await page.fill('#newName', '석비 수호자');
  await page.click('[data-act="newCard"]');
  await wait(300);
  log('몬스터 카드 생성:', await page.isVisible('text=석비 수호자'));
  // 폰 폭에서 가로 넘침
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goBack();
  await wait(400);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log('폰 폭 가로 넘침(px):', ov);
  if (ov > 2) errors.push(`overflow ${ov}px at 390`);
} catch (e) {
  errors.push(`step failed: ${e.message.split('\n')[0]}`);
  await shot('99-fail');
} finally {
  await browser.close();
  await srv.close();
}
log('---- ERRORS ----');
log(errors.length ? errors.join('\n') : 'none');
process.exit(errors.length ? 1 : 0);
