/** Runnable task recipes: offline plan by default, synthetic fixtures or explicitly authorized live calls. */
import{LeadAdapterClient}from'../lib/index.js';
import contract from'../lib/workflow-contract.json'with{type:'json'};
export async function runTask(task,argv=process.argv.slice(2)){
 const modes=argv.filter(v=>['--fixture','--live'].includes(v));if(modes.length>1)throw new Error('Choose fixture or live.');
 const tasks={'people-research':{resource:'people.search',operation:'search_post',write:false},'post-engagers':{resource:'posts.engagers',operation:'list_post_engagers_post',write:false},'profile-enrichment':{resource:'profiles.enrich',operation:'enrich_post',write:false},'reviewed-crm-handoff':{resource:'prospects.promote',operation:'manage_prospect_promote_post',write:true},'existing-crm-sync':{resource:'crm.syncLead',operation:'sync_lead_to_crm_post',write:true}};
 const definition=tasks[task];if(!definition)throw new Error('Unknown task');
 const allowed=new Set(['--fixture','--live','--approve-promote','--approve-crm']);for(const flag of argv)if(!allowed.has(flag))throw new Error('Unknown flag '+flag);
 if(!modes.length){console.log(JSON.stringify({task,mode:'plan',...definition,requiredCredential:'LEADADAPTER_API_KEY',inputEnvironment:'LEADADAPTER_TASK_INPUT (JSON)',networkRequests:0,mutationApprovalRequired:definition.write},null,2));return;}
 const fixture=modes[0]==='--fixture';const input=process.env.LEADADAPTER_TASK_INPUT?JSON.parse(process.env.LEADADAPTER_TASK_INPUT):fixture?{keywords:['synthetic fixture'],post_urn:'urn:li:activity:fixture',public_id:'fixture-person',prospect_id:'fixture-prospect-1',lead_id:'fixture-lead-1',provider:'hubspot',idempotencyKey:'fixture-'+task}:{};
 if(typeof input.idempotencyKey!=='string'||!input.idempotencyKey)throw new Error('Supply an explicit stable idempotencyKey in LEADADAPTER_TASK_INPUT; preserve it for reconciliation.');
 if(definition.write&&!argv.includes(task==='reviewed-crm-handoff'?'--approve-promote':'--approve-crm'))throw new Error('Select exact IDs and explicitly approve this mutation.');
 const fixtureFetch=async(url,init)=>{const u=new URL(url);let result;if(u.pathname.includes('/jobs/'))result=contract.receipts.completed;else if(u.pathname.includes('/promotions'))result=contract.receipts.promoted;else if(u.pathname.includes('/crm-syncs'))result=contract.receipts.synced;else result=contract.receipts.queued;return new Response(JSON.stringify(result),{status:result.job_id?202:200,headers:{'content-type':'application/json'}});};
 const client=new LeadAdapterClient({apiKey:fixture?'synthetic-fixture-key':process.env.LEADADAPTER_API_KEY,...(fixture?{fetch:fixtureFetch}:{})});let receipt;
 if(task==='people-research')receipt=await client.people.search({keywords:input.keywords,profile_id:input.profile_id},{idempotencyKey:input.idempotencyKey});
 if(task==='post-engagers')receipt=await client.posts.engagers({post_urn:input.post_urn,profile_id:input.profile_id},{idempotencyKey:input.idempotencyKey});
 if(task==='profile-enrichment')receipt=await client.profiles.enrich({public_id:input.public_id,linkedin_urn:input.linkedin_urn,lead_id:input.lead_id,include_email:false,profile_id:input.profile_id},{idempotencyKey:input.idempotencyKey});
 if(task==='reviewed-crm-handoff')receipt=await client.prospects.promote(input.prospect_id,{profile_id:input.profile_id},{approved:true,idempotencyKey:input.idempotencyKey});
 if(task==='existing-crm-sync')receipt=await client.crm.syncLead(input.lead_id,{provider:input.provider,profile_id:input.profile_id},{approved:true,idempotencyKey:input.idempotencyKey});
 if(!definition.write&&receipt.job_id)receipt=await client.jobs.wait(receipt.job_id);
 console.log(JSON.stringify({task,mode:fixture?'fixture':'live',receipt,providerExecution:fixture?'not-run':'inspect-receipt',note:definition.write?'Inspect the exact returned receipt; no automatic retry.':'Review source identities before any promotion or external sync.'},null,2));
}
