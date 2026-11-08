import type {LeadAdapterClient, JobWaitOptions} from './index.js';
export interface ResearchWorkflowOptions {
 client: LeadAdapterClient; keywords: string[]; profileId?: string; prospectIds?: string[]; prospectUrns?: string[];
 provider?: string; approvePromote?: boolean; approveCrm?: boolean; checkpoint?: string; accountFingerprint?: string;
 fixture?: boolean; pollOptions?: JobWaitOptions; maxProspectPages?: number;
}
export function researchToCrmPlan(options?: {keywords?: string[]; profileId?: string; provider?: string}): Record<string, unknown>;
export function createWorkflowFixtureClient(): LeadAdapterClient;
export function matchResearchProspects(result: unknown, prospects: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
export function runResearchToCrm(options: ResearchWorkflowOptions): Promise<Record<string, unknown>>;
