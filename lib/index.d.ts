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
export interface ResourceOptions {signal?: AbortSignal; idempotencyKey?: string}
export interface IdempotentOptions extends ResourceOptions {idempotencyKey: string}
export interface ApprovedWriteOptions extends IdempotentOptions {approved: true}
export interface JobWaitOptions {timeoutMs?: number; intervalMs?: number; profile_id?: string; signal?: AbortSignal}
export class LeadAdapterClient {
  readonly people: {search(input: OperationRequests['search_post']['body'], options: IdempotentOptions): Promise<OperationResult>};
  readonly profiles: {enrich(input: NonNullable<OperationRequests['enrich_post']['body']>, options: IdempotentOptions): Promise<OperationResult>};
  readonly posts: {engagers(input: OperationRequests['list_post_engagers_post']['body'], options: IdempotentOptions): Promise<OperationResult>};
  readonly prospects: {
    list(query?: OperationRequests['list_prospects_get']['query'], options?: ResourceOptions): Promise<OperationResult>;
    get(id: string, query?: OperationRequests['list_prospects_get']['query'], options?: ResourceOptions): Promise<OperationResult>;
    promote(id: string, body: OperationRequests['manage_prospect_promote_post']['body'], options: ApprovedWriteOptions): Promise<OperationResult>;
  };
  readonly leads: {list(query?: OperationRequests['list_leads_get']['query'], options?: ResourceOptions): Promise<OperationResult>; export(query?: OperationRequests['export_leads_get']['query'], options?: ResourceOptions): Promise<OperationResult>};
  readonly crm: {sync_lead(id: string, body: NonNullable<OperationRequests['sync_lead_to_crm_post']['body']> & {provider: string}, options: ApprovedWriteOptions): Promise<OperationResult>; syncLead(id: string, body: NonNullable<OperationRequests['sync_lead_to_crm_post']['body']> & {provider: string}, options: ApprovedWriteOptions): Promise<OperationResult>};
  readonly jobs: {wait(id: string, options?: JobWaitOptions): Promise<OperationResult>};

  constructor(options: {apiKey: string; baseUrl?: string; fetch?: typeof fetch; allowCustomOrigin?: boolean});
  request<K extends OperationId>(operationId: K, ...args: {} extends OperationRequests[K] ? [options?: OperationRequests[K]] : [options: OperationRequests[K]]): Promise<OperationResult>;
  /** Returns the terminal receipt, including failed/cancelled jobs. Inspect data.status and data.delivery_state. */
  waitForJob(jobId: string, options?: JobWaitOptions): Promise<OperationResult>;
}
