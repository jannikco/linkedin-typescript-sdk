/** LeadAdapter REST runtime. No implicit retries: queued and uncertain writes need receipt inspection. */
import { operations as generatedOperations } from './operations.js';
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
export const operations = deepFreeze(generatedOperations);

export class LeadAdapterError extends Error {
  constructor(message, {code = 'client_error', status = 0, requestId = null, retryAfter = null, result = null} = {}) {
    super(message);
    this.name = 'LeadAdapterError';
    Object.assign(this, {code, status, requestId, retryAfter, result});
  }
}

function baseUrl(value, allowCustomOrigin) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('baseUrl must be an absolute URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new TypeError('baseUrl cannot include credentials, query or fragment.');
  if (url.protocol !== 'https:' && !(allowCustomOrigin && loopback)) throw new TypeError('HTTPS is required, except explicitly trusted local test servers.');
  if (!allowCustomOrigin && url.origin !== 'https://leadadapter.com') throw new TypeError('A custom origin requires allowCustomOrigin: true.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
}
function queryPairs(value, name, output) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) { value.forEach(v => queryPairs(v, `${name}[]`, output)); return; }
  if (typeof value === 'object') { for (const [key, v] of Object.entries(value)) queryPairs(v, `${name}[${key}]`, output); return; }
  output.append(name, String(value));
}
function validateNames(value, parameters, location) {
  object(value, location);
  const names = new Set(parameters.filter(p => p.in === location).map(p => p.name));
  for (const key of Object.keys(value)) if (!names.has(key)) throw new TypeError(`Unknown ${location} parameter: ${key}`);
  for (const p of parameters.filter(p => p.in === location && p.required)) if (value[p.name] === undefined || value[p.name] === null) throw new TypeError(`Missing ${location} parameter: ${p.name}`);
}

export class LeadAdapterClient {
  #key; #base; #fetch;
  constructor({apiKey, baseUrl: endpoint = 'https://leadadapter.com/api/v1', fetch: fetcher = globalThis.fetch, allowCustomOrigin = false} = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new TypeError('apiKey must be a non-empty token without line breaks.');
    if (typeof fetcher !== 'function') throw new TypeError('A fetch implementation is required.');
    this.#key = apiKey;
    this.#base = baseUrl(endpoint, allowCustomOrigin);
    this.#fetch = fetcher;
  }
  async request(operationId, {path = {}, query = {}, body, idempotencyKey, signal} = {}) {
    if (!Object.hasOwn(operations, operationId)) throw new TypeError('Unknown LeadAdapter operation.');
    const op = operations[operationId];
    validateNames(path, op.parameters, 'path');
    validateNames(query, op.parameters, 'query');
    if (op.idempotencyRequired && (typeof idempotencyKey !== 'string' || !idempotencyKey.trim())) throw new TypeError('This operation requires an explicit idempotencyKey. Reuse it when retrying the same request.');
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || /[\r\n]/.test(idempotencyKey) || new TextEncoder().encode(idempotencyKey).length > 200)) throw new TypeError('idempotencyKey must contain 1–200 bytes without line breaks.');
    if (body !== undefined) {
      if (op.method === 'GET' || !op.requestSchema) throw new TypeError('This operation does not accept a JSON body.');
      object(body, 'body');
    }
    let resource = op.path.replace(/\{([^}]+)\}/g, (_, name) => {
      const v = path[name];
      if (!['string', 'number'].includes(typeof v) || String(v).length === 0 || ['.', '..'].includes(String(v))) throw new TypeError(`Invalid path parameter: ${name}`);
      return encodeURIComponent(String(v));
    });
    // Concatenate paths; URL resolution must never let a path argument change the origin.
    const url = new URL(this.#base.href.replace(/\/$/, '') + resource);
    for (const [key, value] of Object.entries(query)) queryPairs(value, key, url.searchParams);
    const headers = {Accept: 'application/json', Authorization: `Bearer ${this.#key}`};
    if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
    if (body !== undefined || op.method !== 'GET') headers['Content-Type'] = 'application/json';
    const response = await this.#fetch(url.href, {method: op.method, headers, body: op.method === 'GET' ? undefined : JSON.stringify(body ?? {}), signal, redirect: 'error'});
    let result;
    try { result = await response.json(); } catch { throw new LeadAdapterError('LeadAdapter returned an invalid JSON response.', {code: 'invalid_response', status: response.status, requestId: response.headers.get('x-request-id')}); }
    if (!result || typeof result !== 'object' || Array.isArray(result) || (!op.legacy && response.ok && typeof result.ok !== 'boolean')) throw new LeadAdapterError('LeadAdapter returned an invalid response envelope.', {code: 'invalid_response', status: response.status});
    if (!response.ok || result.ok === false) {
      // Do not interpolate remote messages, request bodies or bearer tokens into errors.
      throw new LeadAdapterError('LeadAdapter refused the request; inspect code, requestId and result.', {code: result.error?.code ?? `http_${response.status}`, status: response.status, requestId: response.headers.get('x-request-id') ?? result.request_id ?? null, retryAfter: response.headers.get('retry-after'), result});
    }
    return result;
  }
  async waitForJob(jobId, {timeoutMs = 60_000, intervalMs = 1000, signal} = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs < 1) throw new TypeError('Polling requires positive finite timeoutMs and intervalMs.');
    const deadlineSignal = AbortSignal.timeout(Math.ceil(timeoutMs));
    const combined = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;
    while (true) {
      combined.throwIfAborted();
      const result = await this.request('get_job_get', {path: {job_id: jobId}, signal: combined});
      const job = result.data;
      if (!job || typeof job.status !== 'string') throw new LeadAdapterError('Missing job status in polling response.', {code: 'invalid_response'});
      if (job.finished === true || ['done', 'failed', 'cancelled'].includes(job.status)) return result;
      await new Promise((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(combined.reason); };
        const timer = setTimeout(() => { combined.removeEventListener('abort', onAbort); resolve(); }, intervalMs);
        combined.addEventListener('abort', onAbort, {once: true});
        if (combined.aborted) onAbort();
      });
    }
  }
}
