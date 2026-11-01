#!/usr/bin/env node
// 손자 프로세스를 띄우고 오래 기다린다(프로세스 트리 종료 시험). 손자 pid를 첫 줄로 출력한다.
import { spawn } from 'node:child_process';
const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { stdio: 'ignore' });
process.stdout.write(`${g.pid}\n`);
setTimeout(() => {}, 60000);
