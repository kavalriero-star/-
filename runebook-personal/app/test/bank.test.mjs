import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { here } from './helpers.mjs';

test('실제 위저드 문항 은행이 형식·저장 위치·예시 검사를 통과한다', async () => {
  const app = path.join(here, '..');
  const r = await new Promise((resolve) => execFile(process.execPath, ['tools/check-bank.mjs', 'questions'], { cwd: app }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout })));
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /통과/);
});
