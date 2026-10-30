import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshRunner} from '../src/refresh.ts';

test('focus and timer bursts never overlap or queue requests',async()=>{
 let calls=0,release!:()=>void,now=0;
 const runner=createRefreshRunner(async()=>{calls++;await new Promise<void>(resolve=>{release=resolve})},{visible:()=>true,now:()=>now});
 const first=runner.run();now=5000;
 await Promise.all([runner.run(),runner.run(),runner.run()]);
 assert.equal(calls,1);release();await first;
 const second=runner.run();assert.equal(calls,2);release();await second;
});
test('hidden tabs pause refresh, focus bursts cool down, and stopped views stay stopped',async()=>{
 let calls=0,visible=false,now=0;
 const runner=createRefreshRunner(async()=>{calls++},{visible:()=>visible,now:()=>now});
 await runner.run();assert.equal(calls,0);
 visible=true;await runner.run();await runner.run();assert.equal(calls,1);
 now=1000;await runner.run();assert.equal(calls,2);
 runner.stop();now=5000;await runner.run();assert.equal(calls,2);
});
test('a failed refresh releases the request gate so connectivity can recover',async()=>{
 let calls=0,now=0;
 const runner=createRefreshRunner(async()=>{if(++calls===1)throw Error('offline')},{visible:()=>true,now:()=>now});
 await assert.rejects(runner.run(),/offline/);now=1000;await runner.run();assert.equal(calls,2);
});
