export class ExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
  }
}

/**
 * PDF.js is injected so the same extractor can run in a browser worker and tests.
 * The returned content contains no password, file metadata or PDF object handles.
 * @param {object} pdfjs
 * @returns {(bytes: Uint8Array, options?: {password?: string, onProgress?: Function}) => Promise<import('../domain/contracts.js').ExtractedDocument>}
 */
export function createPdfExtractor(pdfjs) {
  return async function extractPdf(bytes, { password, onProgress = () => {} } = {}) {
    // Supply local bytes, not a file URL. PDF.js handles password verification.
    const loadingTask = pdfjs.getDocument({ data: bytes, password, isEvalSupported: false });
    try {
      const pdf = await loadingTask.promise;
      const pages = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        try {
          // Convert PDF coordinates into a top-left page coordinate system. Keeping
          // positions is essential: plain text loses empty debit/credit columns.
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const items = content.items.filter(item => typeof item.str === 'string').map(item => {
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            return { text: item.str, x, y, width: item.width, height: item.height };
          });
          pages.push({ number, width: viewport.width, height: viewport.height, items });
          onProgress({ stage: 'extraction', completed: number, total: pdf.numPages });
        } finally {
          page.cleanup();
        }
      }
      if (!pages.some(page => page.items.some(item => item.text.trim()))) {
        throw new ExtractionError('no_text', 'No readable text found. Scanned statements need OCR, which is not supported yet.');
      }
      return { pages };
    } catch (error) {
      if (error instanceof ExtractionError) throw error;
      if (error.name === 'PasswordException') {
        const incorrect = error.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
        throw new ExtractionError(incorrect ? 'incorrect_password' : 'password_required',
          incorrect ? 'The PDF password is incorrect. Please try again.' : 'This PDF requires a password.');
      }
      throw new ExtractionError('pdf_unreadable', 'The PDF could not be opened or its text could not be extracted.');
    } finally {
      // Release PDF resources on success, bad passwords, and extraction failures.
      await loadingTask.destroy();
    }
  };
}
