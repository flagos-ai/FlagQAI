/** Output cursors and pre-registration commands share the job/session lifetime. */
import assert from 'node:assert/strict'
import {realpathSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=realpathSync(process.argv[2] ?? fileURLToPath(new URL('../',import.meta.url)))
const base=join(root,process.argv[2]===undefined?'src':'lib/types')
const {BackgroundJobStore,JOBS_MAX_TRACKED}=await import(pathToFileURL(join(base,'dsh-adapter/jobs.js')).href)
const snapshot=(id,status='completed')=>({id,kind:'fixture',label:'fixture',status,startedAt:1,output:{total:0,earliest:0}})
let notifications=0
const store=new BackgroundJobStore({onChanged:()=>notifications++})
for(let index=0;index<200;index++) {
 store.replace([snapshot(`job-${index}`)])
 store.onKernelOutput(`job-${index}`,{chunks:[{at:0,text:'synthetic partial line'}],next:22})
}
assert.equal(store.snapshot().length,JOBS_MAX_TRACKED)
for(let index=0;index<200-JOBS_MAX_TRACKED;index++) {
 assert.equal(store.get(`job-${index}`),undefined)
 assert.equal(store.kernelCursorOf(`job-${index}`),undefined,'evicted job must release its output cursor and partial text')
}
assert.equal(store.kernelCursorOf('job-199'),22,'retained job keeps its cursor')
store.onStarted('pending','old-session command')
store.reset();assert.equal(store.snapshot().length,0);assert.equal(store.kernelCursorOf('job-199'),undefined)
store.replace([snapshot('pending','running')]);assert.equal(store.get('pending').command,undefined)
store.reset()
const before=notifications
store.onStarted('reused','stale command before registry registration')
store.reset();assert.equal(notifications,before,'empty reset does not emit a spurious visible change')
store.replace([snapshot('reused','running')]);assert.equal(store.get('reused').command,undefined,'empty reset must clear pre-registration commands')
store.reset();store.onStarted('fresh','current command');store.replace([snapshot('fresh','running')]);assert.equal(store.get('fresh').command,'current command','normal registration race still retains current command')
store.reset()
store.replace(Array.from({length:JOBS_MAX_TRACKED+5},(_,index)=>snapshot(`live-${index}`,'running')))
assert.equal(store.runningCount(),JOBS_MAX_TRACKED+5,'live jobs must survive terminal-history trimming')
assert.equal(store.kernelCursorOf('live-0'),0)
store.reset()
console.log('PASS jobs cache lifetime: 200 terminal jobs, cursor eviction, populated/empty reset, stale command isolation, normal registration and live-job preservation')
