import{createClient}from"npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function caller(req:Request){const token=(req.headers.get("authorization")||"").replace("Bearer ","");const u=await db.auth.getUser(token);return u.data.user}
Deno.serve(async req=>{
 const u=await caller(req);if(!u)return new Response("unauthorized",{status:401});
 const{data:me}=await db.from("profiles").select("role,is_owner").eq("id",u.id).single();
 if(!me?.is_owner)return new Response("forbidden: owner only",{status:403});
 const b=await req.json();
 if(b.action==="list"){
   const{data,error}=await db.from("profiles").select("id,email,display_name,role,is_owner").in("role",["admin","moderator"]).order("email");
   return Response.json({admins:data||[],error:error?.message});
 }
 if(b.action==="create"){
   const email=String(b.email||"").trim().toLowerCase();
   if(!email)return Response.json({message:"Email bắt buộc"},{status:400});
   const{data:user,error}=await db.auth.admin.listUsers({page:1,perPage:1000});
   if(error)return Response.json({message:error.message},{status:500});
   const found=user.users.find(x=>x.email?.toLowerCase()===email);
   if(!found)return Response.json({message:"Tài khoản chưa tồn tại. Hãy cho người đó đăng ký tài khoản trước, rồi Owner cấp quyền Admin."},{status:400});
   const{error:e}=await db.from("profiles").update({role:"admin",display_name:b.display_name||null}).eq("id",found.id);
   if(e)return Response.json({message:e.message},{status:500});
   return Response.json({ok:true,message:"Đã cấp quyền Admin cho tài khoản."});
 }
 if(b.action==="revoke"){
   const id=String(b.user_id||"");
   if(id===u.id)return Response.json({message:"Không thể tự thu hồi Owner."},{status:400});
   const{error}=await db.from("profiles").update({role:"user",is_owner:false}).eq("id",id).neq("id",u.id);
   if(error)return Response.json({message:error.message},{status:500});
   return Response.json({ok:true,message:"Đã thu hồi quyền Admin."});
 }
 return Response.json({message:"action không hợp lệ"},{status:400});
});