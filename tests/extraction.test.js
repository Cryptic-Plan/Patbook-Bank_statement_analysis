import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfExtractor } from '../src/extraction/pdf.js';

// Controlled library replacement: tests our wrapper's behavior, not PDF.js's
// own cryptography. The real protected PDF is checked separately outside Git.
function library({ error, items = [{ str: 'Example', width: 20, height: 9, transform: [1, 0, 0, 1, 10, 80] }], textError } = {}) {
  const state = { destroyed: 0, cleaned: 0, options: undefined };
  const page = {
    getViewport: () => ({ width: 100, height: 100, convertToViewportPoint: (x, y) => [x, 100 - y] }),
    getTextContent: async () => { if (textError) throw textError; return { items }; },
    cleanup: () => { state.cleaned++; },
  };
  return { state, pdfjs: {
    PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
    getDocument(options) {
      state.options = options;
      return {
        promise: error ? Promise.reject(error) : Promise.resolve({ numPages: 1, getPage: async () => page }),
        destroy: async () => { state.destroyed++; },
      };
    },
  } };
}

test('extracts positioned items, reports progress and releases PDF handles', async () => {
  const { pdfjs, state } = library();
  const progress = [];
  const result = await createPdfExtractor(pdfjs)(new Uint8Array([1]), { password: 'fictional-test-password', onProgress: value => progress.push(value) });
  assert.deepEqual(result.pages[0].items, [{ text: 'Example', x: 10, y: 20, width: 20, height: 9 }]);
  assert.equal(state.options.isEvalSupported, false);
  assert.equal(state.options.url, undefined);
  assert.equal(JSON.stringify(result).includes('fictional-test-password'), false);
  assert.deepEqual(progress, [{ stage: 'extraction', completed: 1, total: 1 }]);
  assert.equal(state.cleaned, 1);
  assert.equal(state.destroyed, 1);
});

test('distinguishes missing and incorrect passwords, and still destroys loading tasks', async () => {
  for (const [code, expected] of [[1, 'password_required'], [2, 'incorrect_password']]) {
    const { pdfjs, state } = library({ error: { name: 'PasswordException', code } });
    await assert.rejects(createPdfExtractor(pdfjs)(new Uint8Array([1])), error => error.code === expected);
    assert.equal(state.destroyed, 1);
  }
});

test('reports image-only PDFs and ignores non-text marked-content items', async () => {
  const { pdfjs, state } = library({ items: [{ type: 'beginMarkedContent' }] });
  await assert.rejects(createPdfExtractor(pdfjs)(new Uint8Array([1])), error => error.code === 'no_text');
  assert.equal(state.cleaned, 1);
  assert.equal(state.destroyed, 1);
});

test('sanitizes PDF errors and cleans up after failed text extraction', async () => {
  const { pdfjs, state } = library({ textError: new Error('Sensitive internals must not escape') });
  await assert.rejects(createPdfExtractor(pdfjs)(new Uint8Array([1])), error => error.code === 'pdf_unreadable' && !error.message.includes('Sensitive'));
  assert.equal(state.cleaned, 1);
  assert.equal(state.destroyed, 1);
});
