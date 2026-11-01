import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const here = path.dirname(fileURLToPath(import.meta.url));
export const fx = (...p) => path.join(here, 'fixtures', ...p);
export async function tmp(tag = 't') { return fs.mkdtemp(path.join(os.tmpdir(), `rb-test-${tag}-`)); }
