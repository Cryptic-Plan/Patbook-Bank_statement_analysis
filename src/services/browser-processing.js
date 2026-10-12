/** One request per worker. Termination cancels processing and releases its state. */
export async function processLocalFile(file, { password, account, signal, onProgress = () => {} }) {
  if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
  const worker = new Worker(new URL('../workers/statement.worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      callback(value);
    };
    const cancel = () => finish(reject, new DOMException('Processing cancelled', 'AbortError'));
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish(reject, new Error('The local processing worker failed.'));
    worker.onmessage = ({ data }) => {
      if (data.kind === 'progress') onProgress(data.progress);
      if (data.kind === 'result') finish(resolve, data.result);
      if (data.kind === 'error') finish(reject, new Error(data.message));
    };
    // Transfer the buffer rather than copying it. It is detached on this side.
    try {
      worker.postMessage({ buffer, password, account }, [buffer]);
    } catch {
      finish(reject, new Error('Could not start local processing.'));
    } finally {
      password = undefined;
    }
  });
}
