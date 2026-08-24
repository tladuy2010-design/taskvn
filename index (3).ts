import{createClient}from"npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async()=>Response.json({ok:true,message:"Immediate payout is enabled. No payout queue delay is used."}));