// Share a single refresh across timer/focus events; never queue hidden-tab work.
export function createRefreshRunner(task:()=>Promise<void>,options:{visible:()=>boolean,now?:()=>number,cooldown?:number}){
 const now=options.now||Date.now;
 let running=false,stopped=false,last=-Infinity;
 return {
  async run(){
   if(stopped||running||!options.visible()||now()-last<(options.cooldown??1000))return;
   running=true;last=now();
   try{await task()}finally{running=false}
  },
  stop(){stopped=true},
 };
}
export function watchVisibleRefresh(task:()=>Promise<void>,interval:number){
 const runner=createRefreshRunner(task,{visible:()=>!document.hidden});
 const refresh=()=>{void runner.run().catch(()=>{});};
 const timer=window.setInterval(refresh,interval);
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',refresh);
 return()=>{runner.stop();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
}
