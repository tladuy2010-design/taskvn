/**
 * TASKVN Cloudflare Worker
 * Server-authoritative task/claim/rate-limit API.
 *
 * Required bindings:
 *   DB = D1 database
 *   AUTH_JWKS_URL = optional external auth JWKS endpoint
 *
 * Important: never put service-role/private keys in public frontend files.
 */
const json = (data,status=200,extra={}) => ({
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    ...extra
  },
  body:JSON.stringify(data)
});

const cors = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"content-type,authorization"
};

function now(){ return Math.floor(Date.now()/1000); }
function randomCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a=new Uint32Array(8); crypto.getRandomValues(a);
  return Array.from(a,x=>chars[x%chars.length]).join("");
}
function randomId(prefix="id"){
  const a=new Uint32Array(4); crypto.getRandomValues(a);
  return prefix+"_"+Array.from(a,x=>x.toString(36)).join("");
}

/*
  AUTH NOTE:
  The production deployment should validate Firebase/Supabase JWTs here.
  The client must never be trusted for UID, reward, limit or admin role.
*/
async function getUser(request){
  const h=request.headers.get("authorization")||"";
  if(!h.startsWith("Bearer ")) return null;
  // Hook your Firebase/Supabase JWT verification here.
  // Return {uid,role} only after cryptographic verification.
  return null;
}

export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});

    const url=new URL(request.url);
    const headers={...cors};

    try{
      if(url.pathname==="/" || url.pathname==="/api/health")
        return new Response(JSON.stringify({ok:true,service:"TASKVN"}),{status:200,headers:{"content-type":"application/json",...headers}});

      if(!url.pathname.startsWith("/api/"))
        return fetch(request);

      // Basic edge rate-limit placeholder. For strong protection,
      // enable Cloudflare WAF/Rate Limiting/Bot Fight Mode in dashboard.
      const ip=request.headers.get("CF-Connecting-IP")||"unknown";
      const key=`rl:${ip}:${Math.floor(Date.now()/60000)}`;
      const count=await env.RATE_LIMIT?.get(key);
      if(env.RATE_LIMIT){
        const n=Number(count||0)+1;
        if(n>120) return new Response(JSON.stringify({ok:false,error:"RATE_LIMIT"}),{status:429,headers:{"content-type":"application/json",...headers}});
        await env.RATE_LIMIT.put(key,String(n),{expirationTtl:90});
      }

      const body=request.body ? await request.json() : {};
      const action=body.action;

      if(action==="start_task"){
        const user=await getUser(request);
        if(!user) return new Response(JSON.stringify({ok:false,error:"AUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json",...headers}});

        const taskId=String(body.task_id||"");
        if(!taskId) return new Response(JSON.stringify({ok:false,error:"TASK_REQUIRED"}),{status:400,headers:{"content-type":"application/json",...headers}});

        /*
          D1 schema expected:
          tasks(id, enabled, title, short_url, reward, daily_limit, claim_ttl_seconds)
          task_claims(id, task_id, uid, code_hash, status, created_at, expires_at)
          task_completions(id, task_id, uid, claim_id, reward, created_at)
          ledger(id, uid, type, amount, ref_id, created_at)
        */
        const task=await env.DB.prepare(
          "SELECT id,title,short_url,reward,daily_limit,claim_ttl_seconds FROM tasks WHERE id=? AND enabled=1"
        ).bind(taskId).first();

        if(!task) return new Response(JSON.stringify({ok:false,error:"TASK_NOT_FOUND"}),{status:404,headers:{"content-type":"application/json",...headers}});

        const since=now()-86400;
        const used=await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM task_completions WHERE task_id=? AND uid=? AND created_at>=?"
        ).bind(taskId,user.uid,since).first();

        if(Number(used?.n||0)>=Number(task.daily_limit||1))
          return new Response(JSON.stringify({ok:false,error:"TASK_COOLDOWN",retry_after:86400}),{status:429,headers:{"content-type":"application/json",...headers}});

        const claimId=randomId("claim");
        const rawCode=randomCode();
        const expires=now()+Math.min(Number(task.claim_ttl_seconds||1800),3600);

        // Store a hash, never the raw claim code.
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(rawCode));
        const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");

        await env.DB.prepare(
          "INSERT INTO task_claims(id,task_id,uid,code_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?)"
        ).bind(claimId,task.id,user.uid,hash,"pending",now(),expires).run();

        return new Response(JSON.stringify({
          ok:true,claim_id:claimId,code:rawCode,
          redirect_url:task.short_url,
          reward:Number(task.reward),
          daily_limit:Number(task.daily_limit||1),
          expires_at:expires
        }),{status:200,headers:{"content-type":"application/json",...headers}});
      }

      if(action==="close_destination"){
        const user=await getUser(request);
        if(!user) return new Response(JSON.stringify({ok:false,error:"AUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json",...headers}});
        const claimId=String(body.claim_id||"");
        if(!claimId) return new Response(JSON.stringify({ok:false,error:"INVALID_CLAIM"}),{status:400,headers:{"content-type":"application/json",...headers}});
        const claim=await env.DB.prepare("SELECT id,status,uid FROM task_claims WHERE id=? AND uid=?").bind(claimId,user.uid).first();
        if(!claim) return new Response(JSON.stringify({ok:false,error:"CLAIM_NOT_FOUND"}),{status:404,headers:{"content-type":"application/json",...headers}});
        if(claim.status==="used"||claim.status==="closed")
          return new Response(JSON.stringify({ok:true,status:"closed"}),{status:200,headers:{"content-type":"application/json",...headers}});
        await env.DB.prepare("UPDATE task_claims SET status='closed',used_at=? WHERE id=? AND uid=? AND status='pending'").bind(now(),claimId,user.uid).run();
        return new Response(JSON.stringify({ok:true,status:"closed"}),{status:200,headers:{"content-type":"application/json",...headers}});
      }

      if(action==="verify_task_code"){
        const user=await getUser(request);
        if(!user) return new Response(JSON.stringify({ok:false,error:"AUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json",...headers}});

        const claimId=String(body.claim_id||"");
        const code=String(body.code||"").trim();
        if(!claimId||!code) return new Response(JSON.stringify({ok:false,error:"INVALID_CLAIM"}),{status:400,headers:{"content-type":"application/json",...headers}});

        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code));
        const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");

        const claim=await env.DB.prepare(
          `SELECT c.id,c.task_id,c.uid,c.status,c.expires_at,t.reward,t.daily_limit
           FROM task_claims c JOIN tasks t ON t.id=c.task_id
           WHERE c.id=? AND c.uid=? AND c.code_hash=?`
        ).bind(claimId,user.uid,hash).first();

        if(!claim) return new Response(JSON.stringify({ok:false,error:"INVALID_CODE"}),{status:400,headers:{"content-type":"application/json",...headers}});
        if(claim.status!=="pending") return new Response(JSON.stringify({ok:false,error:"CLAIM_ALREADY_USED"}),{status:409,headers:{"content-type":"application/json",...headers}});
        if(Number(claim.expires_at)<now()) return new Response(JSON.stringify({ok:false,error:"CLAIM_EXPIRED"}),{status:410,headers:{"content-type":"application/json",...headers}});

        const since=now()-86400;
        const used=await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM task_completions WHERE task_id=? AND uid=? AND created_at>=?"
        ).bind(claim.task_id,user.uid,since).first();

        if(Number(used?.n||0)>=Number(claim.daily_limit||1))
          return new Response(JSON.stringify({ok:false,error:"TASK_COOLDOWN"}),{status:429,headers:{"content-type":"application/json",...headers}});

        /*
          Atomicity/idempotency is critical:
          The database transaction must mark claim used + insert completion +
          ledger credit together. If any step fails, no money is credited.
          Implement with D1 batch/transaction according to your schema.
        */
        const txId=randomId("tx");
        const t=now();
        await env.DB.batch([
          env.DB.prepare("UPDATE task_claims SET status='used',used_at=? WHERE id=? AND status='pending'").bind(t,claim.id),
          env.DB.prepare("INSERT INTO task_completions(id,task_id,uid,claim_id,reward,created_at) VALUES(?,?,?,?,?,?)").bind(randomId("cmp"),claim.task_id,user.uid,claim.id,Number(claim.reward),t),
          env.DB.prepare("INSERT INTO ledger(id,uid,type,amount,ref_id,created_at) VALUES(?,?,?,?,?,?)").bind(txId,user.uid,"task_reward",Number(claim.reward),claim.id,t)
        ]);

        return new Response(JSON.stringify({ok:true,transaction_id:txId,reward:Number(claim.reward),claim_status:"used",destination_expired:true}),{status:200,headers:{"content-type":"application/json",...headers}});
      }

      if(action==="review_submit"){
        const user=await getUser(request);
        if(!user) return new Response(JSON.stringify({ok:false,error:"AUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json",...headers}});
        // Create moderation item. Review rewards are NEVER credited here.
        return new Response(JSON.stringify({ok:true,status:"pending_admin_review"}),{status:202,headers:{"content-type":"application/json",...headers}});
      }

      if(action==="create_withdrawal"){
        const user=await getUser(request);
        if(!user) return new Response(JSON.stringify({ok:false,error:"AUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json",...headers}});
        const amount=Number(body.amount);
        if(!Number.isFinite(amount)||amount<70000) return new Response(JSON.stringify({ok:false,error:"MIN_WITHDRAW"}),{status:400,headers:{"content-type":"application/json",...headers}});
        // Risk checks + atomic balance lock + payout queue belong here.
        return new Response(JSON.stringify({ok:true,status:"pending_risk_check"}),{status:202,headers:{"content-type":"application/json",...headers}});
      }

      return new Response(JSON.stringify({ok:false,error:"NOT_FOUND"}),{status:404,headers:{"content-type":"application/json",...headers}});
    }catch(e){
      return new Response(JSON.stringify({ok:false,error:"SERVER_ERROR"}),{status:500,headers:{"content-type":"application/json",...headers}});
    }
  }
};
