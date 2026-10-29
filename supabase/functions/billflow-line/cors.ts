const allowedOrigins=new Set(['https://billflow.airfriendservice.com','https://purongair-app.github.io']);
export function withCors(response:Response,origin:string|null){
 const headers=new Headers(response.headers);
 headers.delete('Access-Control-Allow-Origin');
 if(origin&&allowedOrigins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
 headers.set('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
 headers.set('Access-Control-Allow-Methods','POST,OPTIONS');
 const vary=headers.get('Vary');headers.set('Vary',vary?vary+', Origin':'Origin');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
