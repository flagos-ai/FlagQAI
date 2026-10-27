/** Every jobs subscription must be released even when external cleanup throws. */
import assert from 'node:assert/strict'
import {realpathSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=realpathSync(process.argv[2] ?? fileURLToPath(new URL('../',import.meta.url)))
const base=join(root,process.argv[2]===undefined?'src':'lib/types')
const [{createJobProjection},{createChannelOwner}]=await Promise.all([
 import(pathToFileURL(join(base,'dsh-adapter/channel/job-projection.js')).href),
 import(pathToFileURL(join(base,'dsh-adapter/channel/owner.js')).href),
])
for(const serviceDetach of [false,true])for(const failed of [[],['bus'],['changed'],['bus','done']]) {
 const owner=createChannelOwner(),attempted=[],callbacks=[]
 let detachService,reads=0,emits=0
 const errors=new Map(failed.map(name=>[name,new Error(`synthetic ${name} cleanup failure`)]))
 const state={backgroundJobs:[],rows:[],emit(){emits++}}
 const projection=createJobProjection(()=>state,{owner,notify(){},rowIds:{value:1},agent:()=>({id:'fixture'}),steer(){}})
 const subscribe=name=>callback=>{callbacks.push(callback);return()=>{attempted.push(name);if(errors.has(name))throw errors.get(name)}}
 projection.attach({list:()=>{reads++;return[]},kill(){},events:{subscribe:(_filter,callback)=>subscribe('bus')(callback)},onJobsChanged:subscribe('changed'),onJobDone:subscribe('done')},detach=>{detachService=detach})
 const detach=serviceDetach?()=>detachService():()=>owner.dispose()
 if(failed.length===0)detach()
 else if(failed.length===1)assert.throws(detach,error=>error===errors.get(failed[0]))
 else assert.throws(detach,error=>error instanceof AggregateError&&error.errors.length===failed.length&&failed.every(name=>error.errors.includes(errors.get(name))))
 assert.deepEqual(attempted,['bus','changed','done'])
 assert.equal(owner.cleanupCount,0,'service detach must also release owner cleanup entry')
 const beforeReads=reads,beforeEmits=emits
 for(const callback of callbacks)callback({type:'registered',id:'fixture'})
 assert.equal(reads,beforeReads,'retained callbacks may not read detached service')
 assert.equal(emits,beforeEmits,'retained callbacks may not emit after detach')
 detachService();owner.dispose();assert.equal(attempted.length,3,'cleanup is idempotent')
}
console.log('PASS jobs detach cleanup: owner/service detach, single/multiple failures, all subscriptions attempted, error preservation, stale callbacks and idempotence')
