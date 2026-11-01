import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCommand } from '../lib/runner.mjs';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rb-win-')); }
const W = { platform: 'win32', nodePath: '/node' };

test('윈도가 아니면 그대로', () => {
  assert.deepEqual(resolveCommand('claude', ['-p'], { platform: 'linux' }), { cmd: 'claude', args: ['-p'] });
});

test('npm 셔틀(.cmd)은 node로 js를 직접 실행', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'node_modules', '@anthropic-ai', 'claude-code'), { recursive: true });
  fs.writeFileSync(path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), '');
  fs.writeFileSync(path.join(d, 'claude.cmd'), '@ECHO off\r\nSETLOCAL\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n');
  const r = resolveCommand('claude', ['-p', 'x y'], { ...W, env: { PATH: d, PATHEXT: '.EXE;.CMD' } });
  assert.equal(r.cmd, '/node');
  assert.deepEqual(r.args, [path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), '-p', 'x y']);
});

test('.exe가 있으면 그것을 쓴다', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'claude.exe'), '');
  const r = resolveCommand('claude', ['--version'], { ...W, env: { PATH: `C:\\없음;${d}`, PATHEXT: '.EXE;.CMD' } });
  assert.equal(r.cmd, path.join(d, 'claude.exe'));
});

test('js를 못 찾는 .cmd는 cmd.exe로 감싸고 따옴표 처리', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'codex.cmd'), '@echo off\r\nsomething.exe %*\r\n');
  const r = resolveCommand('codex', ['exec', 'a"b'], { ...W, env: { PATH: d, PATHEXT: '.CMD', ComSpec: 'C:\\cmd.exe' } });
  assert.equal(r.cmd, 'C:\\cmd.exe');
  assert.equal(r.verbatim, true);
  assert.deepEqual(r.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(r.args[3], `""${path.join(d, 'codex.cmd')}" "exec" "a""b""`);
});

test('찾지 못하면 그대로 두어 ENOENT로 "설치 안 됨"이 된다', () => {
  assert.deepEqual(resolveCommand('nope', [], { ...W, env: { PATH: tmp() } }), { cmd: 'nope', args: [] });
});
