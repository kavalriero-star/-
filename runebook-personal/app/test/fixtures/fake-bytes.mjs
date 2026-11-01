#!/usr/bin/env node
// 한글 한 글자의 UTF-8 바이트를 두 번에 나눠 쓴다(줄 디코딩 경계 시험).
const b = Buffer.from('가나\n다라\n', 'utf8');
process.stdout.write(b.subarray(0, 2));
setTimeout(() => { process.stdout.write(b.subarray(2)); }, 50);
