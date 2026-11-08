# LeadAdapter REST client

Zero runtime dependencies. Node.js 22+. Generated operation metadata and TypeScript request inputs cover the pinned public OpenAPI contract. Response `data` stays untyped because the upstream schema defines an arbitrary object.

```js
import {LeadAdapterClient} from './index.js';
const client = new LeadAdapterClient({apiKey: process.env.LEADADAPTER_API_KEY});
const receipt = await client.request('list_leads_get', {query: {per_page: 10}});
console.log(receipt.data);
```

Use an existing workspace key from https://leadadapter.com/app/settings/api-keys with appropriate scopes. A listed route does not guarantee its LinkedIn adapter can execute. Mock tests verify the client contract; authenticated operations have not been tested by this package.

Fresh LinkedIn reads use POST and require an explicit idempotency key:

```js
const queued = await client.request('search_post', {
  body: {keywords: ['software']},
  idempotencyKey: crypto.randomUUID(),
});
// Preserve that key if retrying the same operation; never resubmit uncertain work with a new key.
if (queued.job_id) {
  const terminal = await client.waitForJob(queued.job_id, {timeoutMs: 60000});
  console.log(terminal.data); // Inspect status, error and delivery_state; failed jobs also return receipts.
}
```

No automatic retries occur. 202, queued and approval-required outcomes remain explicit. `LeadAdapterError` includes `code`, `status`, `requestId`, `retryAfter` and the API `result`. Error messages omit request details; handle API data according to its sensitivity. Source-bound legacy conversion operations retain their own scopes, shapes and deduplication rules; they do not require the new REST idempotency header.

Redirects are refused to prevent forwarding bearer credentials. Custom origins require `allowCustomOrigin: true`; HTTP is allowed only for explicitly trusted loopback test servers. No telemetry is collected.

Regenerate all 134 operation definitions from the pinned schema with `python3 packages/leadadapter/generate.py` from the factory root. No network access is needed to regenerate. `sources/leadadapter-evidence.json` records the source checksum and verification level.
