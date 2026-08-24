import{createClient}from"npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async req=>{
 if(req.method!=="POST") return new Response("POST only",{status:405});
 const secret=Deno.env.get("TASKVN_PROVIDER_WEBHOOK_SECRET")||"";
 if(secret && req.headers.get("x-taskvn-webhook-secret")!==secret) return new Response("unauthorized",{status:401});
 const p=await req.json(), id=String(p.claim_id||"");
 if(!id) return new Response("missing claim_id",{status:400});
 const{data:c,error}=await db.from("task_claims").select("id,task_id,status,risk_score").eq("id",id).single();
 if(error||!c) return new Response("not found",{status:404});
 if(c.status==="paid") return Response.json({ok:true,status:"paid",ignored:true});
 if(!["completed","verified"].includes(String(p.status||"").toLowerCase())){
   await db.from("task_claims").update({status:"manual_review",verification_payload:p}).eq("id",id);
   return Response.json({ok:true,status:"manual_review"});
 }
 const{data:t}=await db.from("tasks").select("reward").eq("id",c.task_id).single();
 const reward=Number(t?.reward||0);
 await db.from("task_claims").update({
   status:"verified",verified_at:new Date().toISOString(),payout_at:new Date().toISOString(),
   reward,verification_payload:p
 }).eq("id",id);
 const{data:paid,error:payErr}=await db.rpc("pay_verified_claim_now",{p_claim_id:id});
 if(payErr) return Response.json({ok:false,error:payErr.message},{status:500});
 return Response.json({ok:true,status:paid?"paid":"manual_review",paid_immediately:!!paid,reward});
});