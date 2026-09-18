import test from 'node:test';
import assert from 'node:assert/strict';
import { processLocalFile } from '../src/services/browser-processing.js';

const account = { id: 'example-account', bankId: 'union', currency: 'INR' };
const file = () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });

// Fake only the browser Worker boundary. These are controller unit tests; they
// do not establish that the bundled workers execute in a real browser.
function mockWorker(t, { postError = false } = {}) {
  const original = globalThis.Worker;
  const instances = [];
  globalThis.Worker = class {
    constructor(url, options) { this.url = url; this.options = options; this.terminated = false; instances.push(this); }
    postMessage(data, transfer) { if (postError) throw new Error('Cannot post'); this.request = data; this.transfer = transfer; }
    terminate() { this.terminated = true; }
  };
  t.after(() => { if (original === undefined) delete globalThis.Worker; else globalThis.Worker = original; });
  return instances;
}

test('transfers PDF bytes, forwards progress and releases the worker on result', async t => {
  const instances = mockWorker(t);
  const progress = [];
  const processing = processLocalFile(file(), { account, onProgress: value => progress.push(value) });
  // Allow the asynchronous File.arrayBuffer() step to complete.
  await Promise.resolve();
  const worker = instances[0];
  assert.equal(worker.options.type, 'module');
  assert.equal(worker.transfer[0], worker.request.buffer);
  worker.onmessage({ data: { kind: 'progress', progress: { stage: 'parsing' } } });
  worker.onmessage({ data: { kind: 'result', result: { status: 'success' } } });
  assert.equal((await processing).status, 'success');
  assert.deepEqual(progress, [{ stage: 'parsing' }]);
  assert.equal(worker.terminated, true);
});

test('cancels an active request and terminates its worker', async t => {
  const instances = mockWorker(t);
  const controller = new AbortController();
  const processing = processLocalFile(file(), { account, signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(processing, error => error.name === 'AbortError');
  assert.equal(instances[0].terminated, true);
});

test('does not start a worker for an already cancelled request', async t => {
  const instances = mockWorker(t);
  await assert.rejects(processLocalFile(file(), { account, signal: AbortSignal.abort() }), error => error.name === 'AbortError');
  assert.equal(instances.length, 0);
});

test('releases resources when worker communication fails', async t => {
  const instances = mockWorker(t, { postError: true });
  await assert.rejects(processLocalFile(file(), { account }));
  assert.equal(instances[0].terminated, true);
});
