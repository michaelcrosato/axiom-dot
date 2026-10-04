import assets from './generated-assets.ts';
/** Explicit bundled assets: no assumed platform ASSETS binding, runtime filesystem or public proxy. */
export function serveAsset(request:Request):Response {
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const path=new URL(request.url).pathname,key=path==='/'?'/index.html':path;
 const asset=assets[key];if(!asset)return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}});
 const headers={'Content-Type':asset.type,'Content-Length':String(asset.size),'ETag':asset.etag,'Cache-Control':key.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===asset.etag)return new Response(null,{status:304,headers});
 if(request.method==='HEAD')return new Response(null,{headers});const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(bytes,{headers});
}
