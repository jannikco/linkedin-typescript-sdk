#!/usr/bin/env node
/** Explicit research workflow and extensible agent installation CLI. Stdout is receipt JSON. */
import {pathToFileURL}from'node:url';
import {createHash}from'node:crypto';
import {LeadAdapterClient}from'./index.js';
import {writeWorkflowReports}from'./reports.mjs';
import {researchToCrmPlan,runResearchToCrm,createWorkflowFixtureClient}from'./workflows.mjs';
export async function main(argv=process.argv.slice(2),{env=process.env,stdout=process.stdout,stderr=process.stderr,client}={}){
 try{
  if(argv[0]==='agents'&&argv[1]==='install'){const installer=await import('./agentkit/install.mjs');return await installer.main(argv.slice(2));}
  if(argv[0]!=='workflows'||argv[1]!=='research-to-crm'){
   if(argv.length&&!(argv.length===1&&['--help','help'].includes(argv[0])))throw new Error('Use workflows research-to-crm or agents install.');
   stdout.write('LeadAdapter: workflows research-to-crm [--keywords value] [--profile-id id] [--fixture | --live --checkpoint private.json] [--prospect-id id | --prospect-urn full-urn] [--approve-promote] [--provider name --approve-crm]\nAgent setup: agents install --client codex|claude|grok --scope project --project /path\n');return 0;
  }
  const options={keywords:[],prospectIds:[],prospectUrns:[]};const args=argv.slice(2);let live=false,fixture=false;
  const values={'--keywords':'keywords','--profile-id':'profileId','--prospect-id':'prospectIds','--prospect-urn':'prospectUrns','--provider':'provider','--checkpoint':'checkpoint','--output':'output'};
  while(args.length){const arg=args.shift();if(arg==='--live')live=true;else if(arg==='--fixture')fixture=true;else if(arg==='--approve-promote')options.approvePromote=true;else if(arg==='--approve-crm')options.approveCrm=true;else if(values[arg]){const value=args.shift();if(!value||value.startsWith('--'))throw new Error('Provide a value for '+arg);const key=values[arg];if(Array.isArray(options[key]))options[key].push(value);else options[key]=value;}else throw new Error('Unknown workflow argument.');}
  if(live&&fixture)throw new Error('Choose fixture or live execution.');
  if(!live&&!fixture){const plan=researchToCrmPlan(options);if(options.output)plan.exports=await writeWorkflowReports(plan,options.output);stdout.write(JSON.stringify(plan,null,2)+'\n');return 0;}
  if(fixture){options.fixture=true;if(!options.keywords.length)options.keywords=['synthetic fixture'];client??=createWorkflowFixtureClient();options.accountFingerprint='fixture';}
  else{if(!env.LEADADAPTER_API_KEY)throw new Error('Set LEADADAPTER_API_KEY for live reads.');client??=new LeadAdapterClient({apiKey:env.LEADADAPTER_API_KEY});options.accountFingerprint=createHash('sha256').update(env.LEADADAPTER_API_KEY).digest('hex');}
  const result=await runResearchToCrm({client,...options});if(options.output)result.exports=await writeWorkflowReports(result,options.output,{secrets:[env.LEADADAPTER_API_KEY].filter(Boolean)});stdout.write(JSON.stringify(result,null,2)+'\n');return 0;
 }catch(error){stderr.write(JSON.stringify({ok:false,code:error?.code??'workflow_error',message:error?.message??'Workflow failed; inspect the checkpoint and request receipts.'})+'\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
