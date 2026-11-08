/** Private workflow exports. No overwrite, no credential fields, formula-safe CSV. */
import {writeFile,mkdir,lstat,unlink,realpath}from'node:fs/promises';import{resolve,dirname,parse}from'node:path';
const secretField=/authorization|api.?key|access.?token|refresh.?token|password|secret|cookie|signing.?key|connect.?url/i;
function redact(value,secrets){if(Array.isArray(value))return value.map(v=>redact(v,secrets));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secretField.test(k)?'[redacted]':redact(v,secrets)]));if(typeof value==='string')for(const secret of secrets)if(secret&&secret.length>=4)value=value.split(secret).join('[redacted]');return value;}
function cell(value){let text=String(value??'');if(/^[\s]*[=+@-]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
const safe=value=>String(value??'').replace(/[<>|`\r\n]/g,' ');
export async function writeWorkflowReports(receipt,output,{secrets=[]}={}){
 if(typeof output!=='string'||!output.toLowerCase().endsWith('.json'))throw new TypeError('--output must name a new .json report file.');
 const json=resolve(output),csv=json.replace(/\.json$/i,'.csv'),review=json.replace(/\.json$/i,'.review.md'),paths={json,csv,review};
 for(const path of Object.values(paths))try{await lstat(path);throw new Error('Report target already exists; choose a new output filename.');}catch(e){if(e.code!=='ENOENT')throw e;}
 // Refuse user-controlled symlink ancestors. macOS's fixed /var and /tmp aliases
 // are filesystem roots for os.tmpdir(), not caller-controlled redirect links.
 for(let ancestor=dirname(json);ancestor!==parse(ancestor).root;ancestor=dirname(ancestor))try{const info=await lstat(ancestor);if(info.isSymbolicLink()&&!(['/var','/tmp'].includes(ancestor)&&await realpath(ancestor)==='/private'+ancestor))throw new Error('Report path contains a symlink ancestor; use a direct private directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(dirname(json),{recursive:true,mode:0o700});const clean=redact(receipt,secrets);
 const shortlist=clean.prospects?.length?clean.prospects:clean.candidates??[];
 const indexed=new Map(shortlist.map(row=>[row.prospect_id,row]));
 const rows=clean.records?.length?clean.records.map(row=>({...indexed.get(row.prospect_id),...row})):shortlist;
 const headers=['prospect_id','lead_id','stage','promote_state','sync_state','source_urns','source_public_ids'];
 const csvText=[headers.map(cell).join(','),...rows.map(row=>[row.prospect_id,row.lead_id,clean.stage??clean.status,row.promote_state,row.sync_state,(row.identities??[]).filter(([kind])=>kind==='urn').map(([,v])=>v).join(' | '),(row.identities??[]).filter(([kind])=>kind==='public_id').map(([,v])=>v).join(' | ')].map(cell).join(','))].join('\n')+'\n';
 const md=`# Research to CRM review\n\nMode: **${safe(clean.mode)}** · Status: **${safe(clean.status??clean.stage)}** · Destination: **${safe(typeof clean.destination==='string'?clean.destination:clean.destination?.type)}**\n\n${clean.mode==='fixture'?'Synthetic fixture only; no provider operation was performed.':'Inspect the linked workflow/checkpoint receipts before approving a write. A queued request is not a completed provider result.'}\n\n| Prospect ID | Lead ID | Promotion | External sync |\n| --- | --- | --- | --- |\n${rows.map(r=>`| ${safe(r.prospect_id)} | ${safe(r.lead_id)} | ${safe(r.promote_state??'review required')} | ${safe(r.sync_state??'not requested')} |`).join('\n')}\n\nNative promotion and external CRM sync are separate decisions. Only exact source identities are eligible; names are not an identity match. These private exports contain the available result, not additional approval or proof of Live execution.\n`;
 const created=[];try{for(const [file,content]of[[json,JSON.stringify(clean,null,2)+'\n'],[csv,csvText],[review,md]]){await writeFile(file,content,{flag:'wx',mode:0o600});created.push(file);}}catch(error){await Promise.all(created.map(file=>unlink(file)));throw error;}return paths;
}
