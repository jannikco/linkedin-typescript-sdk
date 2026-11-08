/** Dry-run by default. --live requires a scoped LeadAdapter API key. */
import {LeadAdapterClient,operations} from './lib/index.js';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('./integration.json',import.meta.url)));
const id=manifest.operationIds[0]; const operation=operations[id];
if (!operation) throw new Error('Unknown operation');
const params=JSON.parse(process.env.LEADADAPTER_PARAMS || '{}');
if (!process.argv.includes('--live')) console.log(JSON.stringify({operationId:id,operation,params,mode:'dry-run'},null,2));
else {
 if (operation.scope!=='api:read') throw new Error('This starter only executes api:read operations');
 if (operation.idempotencyRequired && !params.idempotencyKey) throw new Error('Supply idempotencyKey in LEADADAPTER_PARAMS; preserve it when retrying');
 for(const name of operation.requestSchema?.required||[]) if(params.body?.[name]===undefined) throw new Error('Supply body.'+name+' in LEADADAPTER_PARAMS');
 if(id==='enrich_post' && !['public_id','linkedin_urn','lead_id'].some(name=>params.body?.[name])) throw new Error('Supply an authorized public_id, linkedin_urn or lead_id in LEADADAPTER_PARAMS.body');
 const client=new LeadAdapterClient({apiKey:process.env.LEADADAPTER_API_KEY});
 console.log(JSON.stringify(await client.request(id,params),null,2));
}
