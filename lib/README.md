# LeadAdapter JavaScript SDK0.2

One LeadAdapter workspace key for research, prospect review and CRM workflows. The raw `request(operationId, options)` API remains supported; resource helpers preserve the original response envelope.

```js
import {LeadAdapterClient} from './index.js';
const leadadapter = new LeadAdapterClient({apiKey: process.env.LEADADAPTER_API_KEY});
const receipt = await leadadapter.people.search(
  {keywords: ['B2B SaaS founder'], profile_id: 'your-connected-profile'},
  {idempotencyKey: 'your-stable-logical-request-key'}
);
// Research may be queued: inspect the receipt; do not treat acceptance as results.
if (receipt.job_id) console.log(await leadadapter.jobs.wait(receipt.job_id));
```

Available resources: `people.search`, `profiles.enrich`, `posts.engagers`, `prospects.list/get/promote`, `leads.list/export`, `crm.syncLead` (alias `crm.sync_lead`) and `jobs.wait`. Bodies and query keys follow the pinned API contract in `requests.d.ts`. POST research reads require an explicit idempotency key. Resource writes additionally require `{approved: true, idempotencyKey: '...'}`; account governance still applies. No transport request is retried implicitly.

```js
const selected = await leadadapter.prospects.get('exact-prospect-id');
// Review selected.data.record and its source identity before approving.
const promoted = await leadadapter.prospects.promote('exact-prospect-id', {}, {
  approved: true, idempotencyKey: 'approved-native-promotion-key'
});
// Native LeadAdapter CRM is the default. External sync is a separate decision.
```

## Research → CRM workflow

Node.js22+. These commands are local; the fixture never contacts a provider:

```sh
node cli.mjs workflows research-to-crm
node cli.mjs workflows research-to-crm --fixture
node cli.mjs workflows research-to-crm --fixture --output /private/path/research-review.json
node cli.mjs workflows research-to-crm --fixture --prospect-id fixture-prospect-1 --approve-promote
```

The first command prints a no-network plan. The fixture demonstrates review before promotion. To use your own account, set `LEADADAPTER_API_KEY`, then provide `--live --keywords 'your explicit query' --profile-id YOUR_PROFILE --checkpoint /private/path/research.json`. Review returned prospect IDs and rerun with the same research arguments plus `--prospect-id EXACT_ID --approve-promote`. An external destination additionally requires `--provider NAME --approve-crm`.

The workflow waits for successful terminal research, matches complete URNs or public IDs, re-reads selected records before promotion and never matches names or stripped URN suffixes. Its private atomic checkpoint preserves stable per-step idempotency and holds ambiguous outcomes for reconciliation. The same checkpoint cannot be used with different research inputs, fixture mode or workspace key. An expired/rotated key requires deliberate reconciliation; do not delete a checkpoint to replay an uncertain write.

`--output` writes new private JSON, formula-safe CSV and Markdown review files. Existing reports are never overwritten; credential fields and the active key are redacted.

CLI receipts include language-neutral `workflow`, `mode`, `status`, `stage`, `destination`, `prospects` and/or `records`; saved checkpoint internals are language-specific. Use fixture receipts to evaluate an AI agent without credentials or real records.

## Agent setup

`node cli.mjs agents install --client codex|claude|grok --scope project --project /path` dispatches to the bundled installer. Choose the intended client/scope; existing agent files are not silently overwritten.

## Existing API and evidence

`waitForJob` and `request` retain their original interfaces. `jobs.wait` additionally accepts `profile_id`. Polling returns failed/cancelled receipts unchanged; inspect terminal status and returned delivery/result fields. Generated response data remains open-ended rather than inventing a universal lead/profile type. Fixtures test HTTP contracts and workflow controls; they do not establish live LinkedIn execution.

[API reference](https://leadadapter.com/docs/api-reference?lang=en) · [Create a workspace](https://leadadapter.com/github/start?integration=linkedin-typescript-sdk&utm_source=github&utm_campaign=github-linkedin-typescript-sdk&utm_content=readme)
