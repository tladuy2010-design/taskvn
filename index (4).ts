import{createClient}from"npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async req=>{const secret=Deno.env.get("TASKVN_PROVIDER_WEBHOOK_SECRET")||"";if(secret&&req.headers.get("x-taskvn-webhook-secret")!==secret)return new Response("unauthorized",{status:401});
const p=await req.json(),id=String(p.claim_id||"");if(!id||p.verified!==true)return Response.json({ok:false,status:"not_verified"},{status:400});
const{data:c,error}=await db.from("task_claims").select("id,status,risk_score").eq("id",id).single();if(error||!c)return Response.json({ok:false,status:"not_found"},{status:404});
if(c.status==="paid")return Response.json({ok:true,status:"paid"});
if(c.risk_score>=70){await db.from("task_claims").update({status:"manual_review",verification_payload:p}).eq("id",id);return Response.json({ok:true,status:"manual_review"});}
await db.from("task_claims").update({status:"verified",verified_at:new Date().toISOString(),verification_payload:p,payout_at:new Date().toISOString()}).eq("id",id);
const{data:paid,error:e}=await db.rpc("pay_verified_claim_now",{p_claim_id:id});if(e)return Response.json({ok:false,error:e.message},{status:500});return Response.json({ok:true,status:paid?"paid":"manual_review"});});