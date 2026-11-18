import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadVoiceInputs, saveVoiceInputs } from '../src/voice-input-config.js';
import { createBackup, restoreBackup } from '../src/backup.js';

test('configura dispositivos explícitos, restaura backup e preserva compatibilidade v3', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-inputs-'));
  try {
    const entries = [{ inputId: 'mic2', device: 'USB 2', channel: 2 }];
    await saveVoiceInputs(entries, { directory: dir });
    assert.deepEqual(await loadVoiceInputs({ directory: dir }), entries);
    await assert.rejects(saveVoiceInputs([{ inputId: 'principal', device: null, channel: 1 }], { directory: dir }), /inválido/);
    await assert.rejects(saveVoiceInputs([{ inputId: 'mic3', device: null, channel: 0 }], { directory: dir }), /Canal/);
    const filename = path.join(dir, 'backup');
    await createBackup({ directory: dir, destination: filename });
    const target = path.join(dir, 'restore');
    await restoreBackup({ directory: target, source: filename });
    assert.deepEqual(await loadVoiceInputs({ directory: target }), entries);
    const original = JSON.parse(await readFile(filename, 'utf8'));
    const { sha256: ignored, ...v3 } = original; void ignored;
    v3.version = 3;
    delete v3.files['voice-inputs.json'];
    delete v3.files['llm-state.sqlite'];
    v3.files['mode-config.json'] = Buffer.from(JSON.stringify({ passageInputs: ['principal'], masterInputId: null })).toString('base64');
    const legacy = path.join(dir, 'v3');
    await writeFile(legacy, JSON.stringify({ ...v3, sha256: createHash('sha256').update(JSON.stringify(v3)).digest('hex') }));
    const targetV3 = path.join(dir, 'restored-v3');
    await restoreBackup({ directory: targetV3, source: legacy });
    assert.deepEqual(await loadVoiceInputs({ directory: targetV3 }), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
