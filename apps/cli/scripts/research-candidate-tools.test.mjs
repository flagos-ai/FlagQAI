import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchTools } from '../lib/types/dsh-adapter/workbench-tools.js';
const binding = { port:4188, client:'client-1', session:'session-1' };
const response = (value, status=200) => new Response(JSON.stringify(value), {status});
function fixture(handler) {
  const calls=[];
  const tools=createWorkbenchTools(()=>binding,'/workspace',async (url,init)=>{
    if (url.endsWith('/api/agent')) return response({cwd:'/workspace'});
    calls.push(JSON.parse(init.body)); return handler(calls.at(-1));
  });
  const run=(name,input)=>tools.find(t=>t.name===name).execute(input,{signal:new AbortController().signal});
  return {calls,run,tools};
}
test('research source inspection returns the bound read-only snapshot', async()=>{
 const f=fixture(body=>response({parent:body.parent||'baseline',source_sha256:'a'.repeat(64),project_revision:3,source_excerpt:'X q0',excerpt_truncated:true}));
 const tool=f.tools.find(t=>t.name==='workbench_inspect_research');
 const result=await tool.execute({}, {signal:new AbortController().signal});
 assert.equal(result.project_revision,3); assert.equal(f.calls[0].operation,'research.candidate.inspect');
 assert.deepEqual(f.calls[0].parent,undefined);
});
test('proposal tool binds exact inspected version and never verifies', async()=>{
 const f=fixture(body=>response({research_run:{id:'invsqrt-'+'c'.repeat(32)}}));
 const input={parent:'invsqrt-'+'a'.repeat(32),expected_project_revision:3,parent_sha256:'a'.repeat(64),before:'X q0',after:'Z q0',reason:'Compare one gate',request_id:'propose-once'};
 const result=await f.run('workbench_propose_research_candidate',input);
 assert.equal(result.research_run.id,'invsqrt-'+'c'.repeat(32));
 assert.equal(f.calls[0].operation,'research.propose'); assert.equal(f.calls[0].parent,input.parent);
 assert.equal(f.tools.some(t=>t.name==='workbench_verify_research_candidate'),false);
});
test('research proposal propagates a server rejection without retrying', async()=>{
 const f=fixture(()=>response({error:'bad request'},409));
 await assert.rejects(f.run('workbench_propose_research_candidate',{parent:'../path',expected_project_revision:0,parent_sha256:'bad',before:'x',after:'y',reason:'z',request_id:'r'}),/invalid|requires|error/i);
 assert.equal(f.calls.length,1); assert.equal(f.calls[0].operation,'research.propose');
});
