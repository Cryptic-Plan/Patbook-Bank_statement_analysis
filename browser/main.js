import './style.css';
import { processLocalFile } from '../src/services/browser-processing.js';

const form = document.querySelector('#statement-form');
const bankSelect = document.querySelector('#bank');
const fileInput = document.querySelector('#statement');
const accountInput = document.querySelector('#account');
const passwordInput = document.querySelector('#password');
const processButton = document.querySelector('#process');
const cancelButton = document.querySelector('#cancel');
const status = document.querySelector('#status');
const resultSection = document.querySelector('#result-section');
let controller;

const banks = {
  union: 'Union Bank',
  kotak: 'Kotak Mahindra Bank',
  canara: 'Canara Bank',
  sbi: 'State Bank of India',
  kgb: 'Kerala Gramin Bank',
};
// The worker injects parsers for these banks; other banks stay selectable for
// testing until their parsers exist.
const supportedBanks = new Set(['union', 'kotak', 'canara']);

// Event registration happens at module load; processing begins only on submit.
form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file || !accountInput.value.trim()) return;
  controller = new AbortController();
  setBusy(true);
  clearResult();
  status.textContent = 'Opening statement locally…';
  try {
    // The page knows only a service call and its normalized result. Neither
    // PDF.js nor the bank parser is imported into this interface module.
    const processing = processLocalFile(file, {
      password: passwordInput.value || undefined,
      account: { id: accountInput.value.trim(), bankId: bankSelect.value, currency: 'INR' },
      signal: controller.signal,
      onProgress: updateProgress,
    });
    passwordInput.value = '';
    showResult(await processing);
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? 'Processing cancelled.' : 'Local processing failed. Please try again.';
  } finally {
    passwordInput.value = '';
    controller = undefined;
    setBusy(false);
  }
});

cancelButton.addEventListener('click', () => controller?.abort());

// A new selection clears the preceding statement's visible data and password.
fileInput.addEventListener('change', () => {
  clearResult();
  passwordInput.value = '';
  status.textContent = 'Statement selected. Ready to process locally.';
});
accountInput.addEventListener('input', clearResult);
bankSelect.addEventListener('change', () => {
  clearResult();
  updateBankAvailability();
});

updateBankAvailability();

function updateBankAvailability() {
  const supported = supportedBanks.has(bankSelect.value);
  fileInput.disabled = !supported;
  processButton.disabled = !supported;
  status.textContent = supported
    ? 'Choose a PDF to begin.'
    : `${banks[bankSelect.value]} parsing is not available yet. Select a supported bank.`;
}

function setBusy(busy) {
  [bankSelect, fileInput, accountInput, passwordInput, processButton].forEach(element => { element.disabled = busy; });
  cancelButton.disabled = !busy;
  form.setAttribute('aria-busy', String(busy));
  if (!busy) updateBankAvailability();
}

function clearResult() {
  resultSection.hidden = true;
  document.querySelector('#summary').textContent = '';
  document.querySelector('#issues').replaceChildren();
  document.querySelector('#json').textContent = '';
  document.querySelector('#json-details').open = false;
}

function updateProgress(progress) {
  const bank = banks[bankSelect.value] ?? 'bank';
  const labels = { parsing: `Reading ${bank} transaction rows…`, validation: 'Validating transactions and balances…' };
  status.textContent = progress.stage === 'extraction'
    ? `Extracted page ${progress.completed} of ${progress.total}…`
    : labels[progress.stage] ?? 'Processing locally…';
}

function showResult(result) {
  const labels = { success: 'Statement processed.', partial_success: 'Statement processed with issues requiring review.', failed: 'Statement could not be processed.' };
  status.textContent = labels[result.status];
  resultSection.hidden = false;
  document.querySelector('#summary').textContent =
    `${result.summary.accepted} transactions accepted · ${result.summary.rejected} rows rejected · ${result.issues.length} issues`;
  for (const issue of result.issues) {
    const element = document.createElement('li');
    const location = issue.source ? ` Page ${issue.source.page}, extracted line ${issue.source.line}.` : '';
    element.textContent = `${issue.message}${location}`;
    document.querySelector('#issues').append(element);
  }
  // Treat descriptions as plain text. A narration containing HTML must never
  // become executable markup. No browser storage or telemetry is used here.
  document.querySelector('#json').textContent = JSON.stringify(result, null, 2);
  if (result.issues.some(issue => ['password_required', 'incorrect_password'].includes(issue.code))) {
    passwordInput.disabled = false;
    passwordInput.focus();
  }
}
