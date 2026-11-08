import type { OperationRequests, OperationId } from './requests.js';
export type { OperationRequests, OperationId } from './requests.js';
export interface OperationResult {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: {code: string; message: string; [key: string]: unknown};
  governance?: Record<string, unknown> | null;
  action_id?: string | null;
  request_id?: string;
  status?: string;
  job_id?: string;
  eta_seconds?: number;
  [key: string]: unknown;
}
export interface OperationMetadata {
  method: string; path: string; scope: string | null; legacy: boolean;
  idempotencyRequired: boolean;
  parameters: Array<{in: string; name: string; required?: boolean; schema?: Record<string, unknown>}>;
  requestSchema: Record<string, unknown> | null;
}
export const operations: Readonly<Record<OperationId, OperationMetadata>>;
export class LeadAdapterError extends Error {
  code: string; status: number; requestId: string | null; retryAfter: string | null; result: OperationResult | null;
}
export class LeadAdapterClient {
  constructor(options: {apiKey: string; baseUrl?: string; fetch?: typeof fetch; allowCustomOrigin?: boolean});
  request<K extends OperationId>(operationId: K, ...args: {} extends OperationRequests[K] ? [options?: OperationRequests[K]] : [options: OperationRequests[K]]): Promise<OperationResult>;
  /** Returns the terminal receipt, including failed/cancelled jobs. Inspect data.status and data.delivery_state. */
  waitForJob(jobId: string, options?: {timeoutMs?: number; intervalMs?: number; signal?: AbortSignal}): Promise<OperationResult>;
}
