#!/usr/bin/env node
// 룬북 환경 점검(설계서 8.10절). 기본은 구독 한도를 쓰지 않는다.
//   node tools/check-env.mjs                 로컬 점검만
//   node tools/check-env.mjs --live          Claude·Codex를 각각 1회 짧게 불러 출력 형식 샘플 저장(한도 조금 사용)
//   node tools/check-env.mjs --live-schema   Claude의 --tools "" 와 --json-schema 조합 시험(한도 조금 사용)
//   node tools/check-env.mjs --live-image    Codex로 그림 1장(한도를 글보다 많이 사용)
// 결과: check-env-result.json, 샘플: check-env-samples/. 원고나 API 키 값은 기록하지 않는다.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, cleanEnv } from '../lib/runner.mjs';
import { claudeArgs } from '../lib/adapters/claude.mjs';
import { codexArgs } from '../lib/adapters/codex.mjs';
import { findGenerated } from '../lib/images.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const out = { at: new Date().toISOString(), checks: {} };
const SAMPLES = path.join(APP, 'check-env-samples');
const say = (ok, name, detail = '') => console.log(`${ok === true ? '✓' : ok === false ? '✗' : '·'} ${name}${detail ? ` — ${detail}` : ''}`);
const capture = async (cmd, a, opt = {}) => {
  const lines = [];
  const r = await runCli({ cmd, args: a, env: cleanEnv(), timeouts: { first: 30000, total: 60000, ...(opt.timeouts || {}) }, onLine: (l) => lines.push(l), input: opt.input || '', cwd: opt.cwd });
  return { code: r.code, spawnError: r.spawnError, timedOut: r.timedOut, stdout: lines.join('\n').slice(0, 4000), stderr: r.stderrTail.slice(-2000), lines };
};

async function whichBin(name) {
  const r = await capture(process.platform === 'win32' ? 'where' : 'which', [name]);
  return r.code === 0 ? r.stdout.split('\n').map((x) => x.trim()).filter(Boolean) : [];
}

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
out.checks.node = { version: process.version, ok: major >= 22, platform: process.platform, arch: process.arch, release: os.release() };
say(major >= 22, 'Node.js', `${process.version} (22 이상 필요)`);

// 2. 한글·공백 경로를 작업 폴더로
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '룬북 점검 '));
  const r = await capture(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], { cwd: dir });
  const ok = r.code === 0 && path.resolve(r.stdout.trim()) === path.resolve(dir);
  out.checks.koreanCwd = { ok, dir, got: r.stdout.trim() };
  say(ok, '한글·공백 경로 작업 폴더');
  await fs.rm(dir, { recursive: true, force: true });
}

// 3. 한글 stdin 왕복
{
  const text = '한글 왕복 시험 — 가나다 ✓';
  const r = await capture(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: text });
  const ok = r.stdout.trim() === text;
  out.checks.koreanStdin = { ok };
  say(ok, '한글 stdin 왕복(UTF-8)');
}

// 4. 타임아웃 시 프로세스 트리 종료
{
  const script = "const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});console.log(g.pid);setTimeout(()=>{},60000)";
  let grand = 0;
  const r = await runCli({ cmd: process.execPath, args: ['-e', script], env: cleanEnv(), timeouts: { idle: 800 }, onLine: (l) => { grand = Number(l); } });
  await new Promise((res) => setTimeout(res, 2500));
  let alive = false;
  if (process.platform === 'win32') {
    const t = await capture('tasklist', ['/FI', `PID eq ${grand}`, '/NH']);
    alive = new RegExp(`\\b${grand}\\b`).test(t.stdout);
  } else {
    try { process.kill(grand, 0); alive = true; } catch { alive = false; }
    if (alive) { try { alive = !/State:\s+Z/.test(await fs.readFile(`/proc/${grand}/status`, 'utf8')); } catch { alive = false; } }
  }
  out.checks.treeKill = { ok: r.timedOut === 'idle' && !alive, timedOut: r.timedOut, grandchildAlive: alive };
  say(!alive, '타임아웃 시 손자 프로세스까지 종료');
}

// 5. API 키 환경변수(값은 기록하지 않음)
{
  const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY'].filter((k) => process.env[k]);
  out.checks.apiKeyEnv = { present: keys };
  say(keys.length === 0 ? true : null, 'API 키 환경변수', keys.length ? `${keys.join(', ')} 있음 — 도우미는 넘기지 않지만 다른 곳에서는 API 요금이 나갈 수 있어요` : '없음');
}

// 6. Claude Code
{
  const where = await whichBin('claude');
  const v = await capture('claude', ['--version']);
  const a = v.spawnError ? null : await capture('claude', ['auth', 'status']);
  out.checks.claude = { where, isCmd: where.some((p) => /\.cmd$/i.test(p)), installed: !v.spawnError, version: v.stdout.trim(), authExit: a?.code ?? null, authStdout: a?.stdout.slice(0, 1000) ?? null, authStderr: a?.stderr.slice(0, 500) ?? null };
  say(!v.spawnError, 'Claude Code 설치', v.spawnError ? '설치 안 됨' : `${v.stdout.trim()} (${where[0] || '?'})`);
  if (a) say(a.code === 0, 'Claude 로그인', `auth status 종료 코드 ${a.code}`);
  if (where.some((p) => /\.cmd$/i.test(p)) && !where.some((p) => /\.exe$/i.test(p))) say(false, 'claude 실행 파일', '.cmd만 있어요. 셸 없이 실행할 수 없으니 네이티브 설치(claude.exe)를 권해요');
}

// 7. Codex CLI
{
  const where = await whichBin('codex');
  const v = await capture('codex', ['--version']);
  const a = v.spawnError ? null : await capture('codex', ['login', 'status']);
  out.checks.codex = { where, installed: !v.spawnError, version: v.stdout.trim(), loginExit: a?.code ?? null, loginStderr: a?.stderr.slice(0, 500) ?? null };
  say(!v.spawnError, 'Codex CLI 설치', v.spawnError ? '설치 안 됨(그림 자동 생성에 필요)' : v.stdout.trim());
  if (a) say(a.code === 0, 'Codex 로그인', (a.stderr || '').trim().split('\n')[0]);
  const gen = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');
  out.checks.codex.generatedImagesDir = gen;
}

// 8. 데이터 폴더 원자적 저장
{
  const dataDir = path.join(os.homedir(), '룬북데이터');
  let ok = false;
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const f = path.join(dataDir, '.check-env.tmp');
    await fs.writeFile(f, '점검');
    await fs.rename(f, path.join(dataDir, '.check-env.json'));
    await fs.rm(path.join(dataDir, '.check-env.json'));
    ok = true;
  } catch (e) { out.checks.dataDirError = e.code; }
  out.checks.dataDir = { ok, dataDir, onedrive: /onedrive/i.test(dataDir) };
  say(ok, '데이터 폴더 쓰기·이름 바꾸기', dataDir);
}

// ---- 실제 호출(선택) ----
async function liveClaude(extraArgs, file) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-live-'));
  const sys = path.join(cwd, '..', `rb-sys-${Date.now()}.txt`);
  await fs.writeFile(sys, '짧게 답한다.');
  const lines = [];
  const started = Date.now();
  const r = await runCli({ cmd: 'claude', args: [...claudeArgs({ systemPromptFile: sys }), ...extraArgs], input: 'OK 두 글자만 출력하라.', cwd, env: cleanEnv(), timeouts: { first: 90000, total: 180000 }, onLine: (l) => lines.push(l) });
  await fs.mkdir(SAMPLES, { recursive: true });
  await fs.writeFile(path.join(SAMPLES, file), `${lines.join('\n')}\n`);
  await fs.rm(sys, { force: true });
  await fs.rm(cwd, { recursive: true, force: true });
  const evs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const init = evs.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = evs.find((e) => e.type === 'result');
  const limit = evs.find((e) => e.type === 'rate_limit_event');
  return { exit: r.code, ms: Date.now() - started, tools: init?.tools ?? null, apiKeySource: init?.apiKeySource ?? null, model: init?.model ?? null, isError: result?.is_error ?? null, subtype: result?.subtype ?? null, hasStructured: result ? 'structured_output' in result : null, structured: result?.structured_output ?? null, rateLimit: limit?.rate_limit_info ?? null, eventTypes: [...new Set(evs.map((e) => e.type))] };
}

if (args.has('--live')) {
  console.log('\n[실제 호출] 구독 한도를 조금 씁니다.');
  if (out.checks.claude.installed) {
    out.checks.liveClaude = await liveClaude([], 'claude-stream.jsonl');
    const c = out.checks.liveClaude;
    say(c.exit === 0 && !c.isError, 'claude -p 왕복', `${c.ms}ms, apiKeySource=${c.apiKeySource}, tools=${JSON.stringify(c.tools)}`);
    if (c.apiKeySource && c.apiKeySource !== 'none') say(false, '과금 경고', '구독이 아니라 API 키로 인증되고 있어요');
  }
  if (out.checks.codex.installed) {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-live-'));
    const lines = [];
    const r = await runCli({ cmd: 'codex', args: codexArgs({ cwd }), input: '짧게 답한다.\n\n---\n\nOK 두 글자만 출력하라.', cwd, env: cleanEnv(), timeouts: { first: 90000, total: 180000 }, onLine: (l) => lines.push(l) });
    await fs.mkdir(SAMPLES, { recursive: true });
    await fs.writeFile(path.join(SAMPLES, 'codex-exec.jsonl'), `${lines.join('\n')}\n`);
    await fs.rm(cwd, { recursive: true, force: true });
    out.checks.liveCodex = { exit: r.code, eventTypes: [...new Set(lines.map((l) => { try { return JSON.parse(l).type; } catch { return '(json 아님)'; } }))] };
    say(r.code === 0, 'codex exec 왕복', `이벤트: ${out.checks.liveCodex.eventTypes.join(', ')}`);
  }
}

if (args.has('--live-schema') && out.checks.claude.installed) {
  console.log('\n[실제 호출] --tools "" 와 --json-schema 조합 시험');
  const schema = JSON.stringify({ type: 'object', properties: { 답: { type: 'string' } }, required: ['답'] });
  out.checks.liveSchema = await liveClaude(['--json-schema', schema], 'claude-schema.jsonl');
  const c = out.checks.liveSchema;
  say(!!c.structured, '--tools "" + --json-schema', c.structured ? `structured_output=${JSON.stringify(c.structured)}` : `구조화 출력 없음(tools=${JSON.stringify(c.tools)}, subtype=${c.subtype}) → 앱 쪽 검증기를 씁니다`);
}

if (args.has('--live-image') && out.checks.codex.installed) {
  console.log('\n[실제 호출] Codex로 그림 1장. 구독 한도를 글보다 많이 씁니다.');
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-img-'));
  let threadId = null;
  const started = Date.now();
  const r = await runCli({ cmd: 'codex', args: ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '--color', 'never', '-'], input: 'image_gen 도구로 "작은 초록 슬라임 몬스터, 단색 배경" 그림 1장을 만들어라. 끝나면 "완료"만 답한다.', cwd, env: cleanEnv(), timeouts: { first: 120000, total: 600000 }, onLine: (l) => { try { const e = JSON.parse(l); if (e.type === 'thread.started') threadId = e.thread_id; } catch { /* 무시 */ } } });
  const files = await findGenerated(process.env, threadId, started);
  out.checks.liveImage = { exit: r.code, threadId, files, threadDirMatched: files.some((f) => threadId && f.includes(threadId)) };
  say(files.length > 0, 'Codex 그림 생성', files[0] || '파일을 찾지 못했어요');
  await fs.rm(cwd, { recursive: true, force: true });
}

const file = path.join(APP, 'check-env-result.json');
await fs.writeFile(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n결과를 저장했어요: ${file}`);
