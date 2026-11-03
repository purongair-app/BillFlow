import base64,gzip,json,mimetypes
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assets={}
for p in (root/'dist').rglob('*'):
 if p.is_file():
  path='/BillFlow/'+p.relative_to(root/'dist').as_posix()
  mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
  if p.suffix=='.js':mime='application/javascript'
  assets[path]=[mime,base64.b64encode(gzip.compress(p.read_bytes(),mtime=0)).decode()]
logo=assets.pop('/BillFlow/billflow-logo-green.png')
logo_code='export default {fetch(req){const bytes=Uint8Array.from(atob('+json.dumps(logo[1])+'),c=>c.charCodeAt(0));return new Response(req.method==="HEAD"?null:new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=31536000, immutable"}})}};'
Path('/tmp/billflow-logo.json').write_text(json.dumps({'code':logo_code}))
code='''const assets=ASSETS;
export default {async fetch(req,env){const url=new URL(req.url);if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});let path=url.pathname;if(path==='/'||path==='/BillFlow'||path==='/BillFlow/')path='/BillFlow/index.html';else if(!path.startsWith('/BillFlow/'))path='/BillFlow'+path;if(path==='/BillFlow/billflow-logo-green.png')return env.BRANDING.fetch(req);const item=assets[path];if(!item)return new Response('Not found',{status:404});const h={'Content-Type':item[0],'Cache-Control':path.endsWith('index.html')?'no-cache':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','X-PUROnG-Hosting':'Cloudflare','Referrer-Policy':'strict-origin-when-cross-origin'};if(req.method==='HEAD')return new Response(null,{headers:h});const bytes=Uint8Array.from(atob(item[1]),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),{headers:h});}};
'''.replace('ASSETS',json.dumps(assets,separators=(',',':')))
(root/'cloudflare/billflow-worker.mjs').write_text(code)
b='billflow_cloudflare_direct_20261103'
body='--'+b+'\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'+json.dumps({'main_module':'worker.mjs','compatibility_date':'2026-11-03','bindings':[{'type':'service','name':'BRANDING','service':'billflow-branding'}]})+'\r\n--'+b+'\r\nContent-Disposition: form-data; name="worker.mjs"; filename="worker.mjs"\r\nContent-Type: application/javascript+module\r\n\r\n'+code+'\r\n--'+b+'--\r\n'
Path('/tmp/billflow-deploy.json').write_text(json.dumps({'contentType':'multipart/form-data; boundary='+b,'body':body}))
print(json.dumps({'files':len(assets),'bytes':len(code)}))
