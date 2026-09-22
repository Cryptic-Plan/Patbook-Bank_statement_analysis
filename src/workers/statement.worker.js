import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createPdfExtractor } from '../extraction/pdf.js';
import { unionParser } from '../parsers/union/parser.js';
import { kotakParser } from '../parsers/kotak/parser.js';
import { canaraParser } from '../parsers/canara/parser.js';
import { createStatementProcessor } from '../services/process-statement.js';

// Vite bundles this library asset locally. No external CDN receives PDF bytes.
// Supply an explicit nested worker: PDF.js's default worker creation assumes a
// window, while this module is itself running in a worker without a DOM.
const libraryWorker = new Worker(pdfWorkerUrl, { type: 'module' });
pdfjs.GlobalWorkerOptions.workerPort = libraryWorker;
const extractPdf = createPdfExtractor(pdfjs);

const noParserResult = {
  status: 'failed', transactions: [],
  issues: [{ code: 'unsupported_bank', severity: 'error', message: 'No parser is available for the selected bank yet.' }],
  summary: { pages: 0, candidateRows: 0, accepted: 0, rejected: 0 },
};

self.onmessage = async ({ data }) => {
  let bytes = new Uint8Array(data.buffer);
  let password = data.password;
  delete data.password;
  // Explicit parser selection by the bank chosen in the interface.
  const parser = { union: unionParser, kotak: kotakParser, canara: canaraParser }[data.account?.bankId];
  try {
    if (!parser) {
      self.postMessage({ kind: 'result', result: noParserResult });
      return;
    }
    const processStatement = createStatementProcessor({ extractPdf, parser });
    // Fingerprint the original encrypted bytes before PDF.js takes ownership.
    // This identifies statement rows; overlap/duplicate detection is deferred.
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const statementId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await processStatement({ bytes, password, account: data.account, statementId,
      onProgress: progress => self.postMessage({ kind: 'progress', progress }) });
    self.postMessage({ kind: 'result', result });
  } catch {
    self.postMessage({ kind: 'error', message: 'The statement could not be processed.' });
  } finally {
    // Drop our references. JavaScript strings cannot be explicitly zeroed;
    // termination of this worker releases its processing context afterwards.
    password = undefined;
    bytes = undefined;
    libraryWorker.terminate();
  }
};
