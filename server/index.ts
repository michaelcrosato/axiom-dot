import {handleCoop,type CoopEnv} from './coop-api.ts';
import {serveAsset} from './asset-server.ts';
/** Cloudflare-compatible ESM Worker. Sites dispatch owns sign-in and audience policy. */
export default {
  async fetch(request:Request,env:{AXIOM_PREVIEW_DB?:CoopEnv['DB']}):Promise<Response>{
    const api=await handleCoop(request,env.AXIOM_PREVIEW_DB?{DB:env.AXIOM_PREVIEW_DB}:{});if(api)return api;
    return serveAsset(request);
  },
};
