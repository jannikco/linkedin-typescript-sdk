/** Source-bound, reviewable research→prospect→native CRM workflow. No name matching or implicit writes. */
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {LeadAdapterClient,LeadAdapterError} from './index.js';
import contract from './workflow-contract.json' with {type:'json'};
const identityFields=contract.identity;
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const error=(code,message)=>new LeadAdapterError(message,{code});
function identities(row){const data=row?.data&&typeof row.data==='object'?row.data:row;return new Set([...identityFields.urnFields.map(k=>typeof data?.[k]==='string'?'urn:'+data[k]:null),...identityFields.publicIdFields.map(k=>typeof data?.[k]==='string'?'public:'+data[k]:null)].filter(Boolean));}
function rows(result){if(Array.isArray(result))return result;for(const name of identityFields.resultContainers)if(Array.isArray(result?.[name]))return result[name];return [];}
export function matchResearchProspects(result,prospects){
 const observed=new Set(rows(result).flatMap(row=>[...identities(row)]));
 return prospects.filter(p=>p?.kind==='person'&&safeId(p.id)&&[...identities(p)].some(identity=>observed.has(identity)));
}
export function researchToCrmPlan({keywords=[],profileId,provider}={}){
 return {workflow:'research-to-crm',mode:'plan',networkRequests:0,destination:provider?{type:'external-crm',provider,requiresSeparateApproval:true}:{type:'leadadapter-native-crm'},research:{operation:contract.operations.research,body:{keywords,...(profileId?{profile_id:profileId}:{})},requiresWorkspaceKey:true},steps:['Request people research with a stable idempotency key','Wait for a terminal successful job receipt','Match exact source URN/public ID against stored person prospects','Review exact prospect IDs before approved native CRM promotion',...(provider?['Separately approve sync of returned exact lead IDs to the named external provider']:[])],writes:'Disabled until exact prospect selection and explicit approvals',evidence:'Source-bound plan; no provider execution'};
}
export function createWorkflowFixtureClient(){
 const r=contract.receipts;
 return new LeadAdapterClient({apiKey:'synthetic-fixture-key',fetch:async(raw,init)=>{
  const u=new URL(raw);let result;
  if(u.pathname.endsWith('/linkedin/searches/people'))result=r.queued;
  else if(u.pathname.includes('/jobs/'))result=r.completed;
  else if(u.pathname.endsWith('/prospects'))result=u.searchParams.has('id')?r.prospect:r.prospects;
  else if(u.pathname.includes('/promotions'))result=r.promoted;
  else if(u.pathname.includes('/crm-syncs')){result=structuredClone(r.synced);result.data.provider=JSON.parse(init.body).provider;}
  else throw error('fixture_route_unknown','Unexpected fixture workflow operation.');
  return new Response(JSON.stringify(result),{status:result===r.queued?202:200,headers:{'Content-Type':'application/json'}});
 }});
}
export async function runResearchToCrm({client,keywords,profileId,prospectIds=[],prospectUrns=[],provider,approvePromote=false,approveCrm=false,checkpoint,accountFingerprint,fixture=false,pollOptions={},maxProspectPages=10}={}){
 if(!client)throw new TypeError('A LeadAdapter client is required.');
 if(!Array.isArray(keywords)||!keywords.length||keywords.some(k=>typeof k!=='string'||!k.trim()))throw new TypeError('Provide explicit nonempty research keywords.');
 if(!prospectIds.every(safeId)||!prospectUrns.every(v=>typeof v==='string'&&v.startsWith('urn:li:')&&v.length<=500))throw new TypeError('Select exact prospect IDs or complete LinkedIn URNs.');
 if(provider&&!/^[A-Za-z0-9_-]{1,80}$/.test(provider))throw new TypeError('Provide an explicit external CRM provider identifier.');
 if(!Number.isInteger(maxProspectPages)||maxProspectPages<1||maxProspectPages>50)throw new TypeError('maxProspectPages must be1–50.');
 if(!fixture&&(!checkpoint||!accountFingerprint))throw new TypeError('Live workflows require a private checkpoint path and account fingerprint.');
 const input={keywords,...(profileId?{profile_id:profileId}:{})},signature=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 let state,lock;
 const save=async()=>{state.updatedAt=new Date().toISOString();if(!checkpoint)return;const temp=checkpoint+'.tmp-'+randomUUID();try{await writeFile(temp,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,checkpoint);}finally{await unlink(temp).catch(()=>{});}};
 if(checkpoint){await mkdir(dirname(checkpoint),{recursive:true,mode:0o700});try{lock=await open(checkpoint+'.lock','wx',0o600);}catch{throw error('checkpoint_locked','Another workflow owns this checkpoint; inspect it before continuing.');}}
 try{
  if(checkpoint)try{state=JSON.parse(await readFile(checkpoint,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  state??={schemaVersion:1,workflow:'research-to-crm',mode:fixture?'fixture':'live',signature,accountFingerprint:accountFingerprint??'fixture',research:{input,idempotencyKey:randomUUID(),status:'new'},promotions:{},syncs:{}};
  if(state.workflow!=='research-to-crm'||state.signature!==signature||state.mode!==(fixture?'fixture':'live')||state.accountFingerprint!==(accountFingerprint??'fixture'))throw error('checkpoint_mismatch','Checkpoint research inputs, mode or account do not match. Use the original inputs or a new checkpoint.');
  if(['pending','uncertain'].includes(state.research.status))throw error('execution_uncertain','Research submission outcome is uncertain. Inspect the original receipt/provider before continuing; it will not be silently resubmitted.');
  if(state.research.status==='new'){
   state.research.status='pending';await save();
   try{state.research.receipt=await client.people.search(input,{idempotencyKey:state.research.idempotencyKey});state.research.status='submitted';await save();}
   catch(e){state.research.status='uncertain';await save();throw error('execution_uncertain','Research submission failed or is uncertain; inspect the saved intent and account before reconciling.');}
  }
  if(state.research.status!=='complete'){
   const receipt=state.research.receipt,jobId=receipt.job_id??receipt.data?.job_id;
   const completed=jobId?await client.jobs.wait(jobId,{...pollOptions,...(profileId?{profile_id:profileId}:{})}):receipt;
   if((jobId&&(completed.data?.status!=='done'||completed.data?.error))||(!jobId&&(completed.data?.job_status!=='done'||completed.data?.error)))throw error('research_not_successful','Research job did not finish successfully; no prospects will be promoted.');
   if(jobId&&completed.data?.job_id!==jobId)throw error('job_identity_mismatch','Completed research receipt does not match the submitted job.');
   state.research.result=jobId?completed.data.result:(completed.data?.result??completed.data);state.research.terminalReceipt=completed;state.research.status='complete';await save();
  }
  const all=[];
  for(let page=1;page<=maxProspectPages;page++){
   const listed=await client.prospects.list({kind:'person',page,...(profileId?{profile_id:profileId}:{})});
   if(!Array.isArray(listed.data?.items))throw error('invalid_response','Prospect list did not contain data.items.');all.push(...listed.data.items);
   if(!listed.data.has_more)break;if(page===maxProspectPages)throw error('prospect_page_limit','Prospect pagination exceeded the explicit limit; no writes were made.');
  }
  // Explicit selected IDs are loaded exactly; matching still requires identity from this research.
  for(const id of prospectIds)if(!all.some(p=>p.id===id)){const detail=await client.prospects.get(id,profileId?{profile_id:profileId}:{});if(detail.data?.record?.id!==id)throw error('identity_mismatch','Prospect detail did not match the exact requested ID.');all.push(detail.data.record);}
  const matches=matchResearchProspects(state.research.result,all);const selected=matches.filter(p=>prospectIds.includes(p.id)||prospectUrns.some(urn=>identities(p).has('urn:'+urn)));
  if(prospectIds.some(id=>!selected.some(p=>p.id===id))||prospectUrns.some(urn=>!selected.some(p=>identities(p).has('urn:'+urn))))throw error('identity_mismatch','A selected prospect does not match this completed research by exact source identity.');
  if(prospectUrns.some(urn=>selected.filter(p=>identities(p).has('urn:'+urn)).length!==1))throw error('ambiguous_identity','A selected URN matched multiple stored prospects; select the exact prospect ID.');
  const review=matches.map(p=>({prospect_id:p.id,identities:[...identities(p)].map(v=>v.startsWith('urn:')?['urn',v.slice(4)]:['public_id',v.slice(7)]),lead_id:p.lead_id??null}));
  if(!approvePromote)return {workflow:'research-to-crm',mode:fixture?'fixture':'live',status:matches.length?'review-required':'pending-ingestion',stage:matches.length?(selected.length?'awaiting_promotion_approval':'awaiting_selection'):'pending_ingestion',destination:'leadadapter-native-crm',prospects:review,candidates:review,selected_ids:selected.map(p=>p.id),checkpoint:checkpoint??null,writes:0};
  if(!selected.length)throw error('selection_required','Approve only after selecting exact prospect IDs or URNs from the review.');
  async function writeStep(bucket,key,execute,validate){
   const previous=state[bucket][key];if(previous?.status==='complete')return previous.receipt;
   if(previous)throw error('execution_uncertain','A prior write intent is pending or uncertain; reconcile it before continuing.');
   const entry={status:'pending',idempotencyKey:randomUUID()};state[bucket][key]=entry;await save();
   try{entry.receipt=await execute(entry.idempotencyKey);if(!validate(entry.receipt))throw error('invalid_write_receipt','Write receipt identity or outcome is incomplete.');entry.status='complete';await save();return entry.receipt;}
   catch(e){entry.status='uncertain';await save();throw error('execution_uncertain','Write failed or its outcome is uncertain. Saved intent is held for explicit reconciliation; no automatic replay.');}
  }
  const promoted=[];
  for(const p of selected){
   const detail=await client.prospects.get(p.id,profileId?{profile_id:profileId}:{}),current=detail.data?.record;
   const original=identities(p),fresh=identities(current);
   if(current?.id!==p.id||!matchResearchProspects(state.research.result,[current]).length||![...original].some(v=>fresh.has(v))||prospectUrns.filter(urn=>original.has('urn:'+urn)).some(urn=>!fresh.has('urn:'+urn)))throw error('identity_mismatch','The selected prospect source identity changed before promotion; review it again.');
   const result=await writeStep('promotions',p.id,key=>client.prospects.promote(p.id,profileId?{profile_id:profileId}:{},{approved:true,idempotencyKey:key}),r=>r.ok===true&&r.data?.dry_run!==true&&r.data?.record?.id===p.id&&safeId(r.data.record.lead_id));
   const leadId=result.data.record.lead_id;const row={prospect_id:p.id,lead_id:leadId,promote_state:'complete',sync_state:provider?(approveCrm?'complete':'approval-required'):'not-requested',destination:'leadadapter-native-crm',promotionReceipt:result};
   if(provider&&approveCrm){const key=provider+':'+leadId;row.externalSyncReceipt=await writeStep('syncs',key,idempotencyKey=>client.crm.sync_lead(leadId,{provider,...(profileId?{profile_id:profileId}:{})},{approved:true,idempotencyKey}),r=>r.ok===true&&r.data?.lead_id===leadId&&r.data?.provider===provider&&['created','updated','already_exists','skipped'].includes(r.data.outcome));}
   promoted.push(row);
  }
  return {workflow:'research-to-crm',mode:fixture?'fixture':'live',status:provider&&!approveCrm?'external-approval-required':'complete',stage:provider&&!approveCrm?'awaiting_external_crm_approval':'complete',records:promoted,prospects:review,candidates:review,destination:provider&&approveCrm?provider:'leadadapter-native-crm',promoted,checkpoint:checkpoint??null,evidence:fixture?'Synthetic fixture execution; no provider calls':'Inspect operation receipts; job acceptance is not confirmed external delivery'};
 }finally{if(lock){await lock.close();await unlink(checkpoint+'.lock').catch(()=>{});}}
}
