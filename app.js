const C=window.TASKVN_CONFIG;const sb=C&&!C.SUPABASE_URL.includes("YOUR-")?supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY):null;const $=s=>document.querySelector(s),modal=$("#modal");function pop(x){modal.innerHTML="<div>"+x+"</div>";modal.classList.add("show")}function close(){modal.classList.remove("show")}modal.onclick=e=>{if(e.target===modal)close()}
async function login(){pop('<h2>Đăng nhập</h2><input class="field" id="e" placeholder="Email"><input class="field" id="p" type="password" placeholder="Mật khẩu"><button class="primary" id="go">Đăng nhập</button>');$("#go").onclick=async()=>{if(!sb)return alert("Cấu hình Supabase trong config.js trước.");let{error}=await sb.auth.signInWithPassword({email:$("#e").value,password:$("#p").value});if(error)alert(error.message);else{close();load()}}}
$("#auth").onclick=login;$("#deposit").onclick=depositModal;
async function depositModal(){
 if(!sb)return pop("<h2>Nạp COIN</h2><p>Cấu hình Supabase trước.</p>");
 let{data:{user}}=await sb.auth.getUser(); if(!user)return login();
 let{data:settings}=await sb.from("app_settings").select("key,value").in("key",["topup_bank","topup_account","topup_owner","topup_note"]);
 let cfg={};(settings||[]).forEach(x=>cfg[x.key]=typeof x.value==="string"?x.value:(x.value?.value||x.value));
 pop(`<h2>💳 Nạp COIN</h2><p>Chuyển khoản đúng nội dung để Admin/ hệ thống đối soát.</p><div class="card"><b>Ngân hàng:</b> ${esc(cfg.topup_bank||"CHƯA CẤU HÌNH")}<br><b>Số tài khoản:</b> ${esc(cfg.topup_account||"CHƯA CẤU HÌNH")}<br><b>Chủ tài khoản:</b> ${esc(cfg.topup_owner||"CHƯA CẤU HÌNH")}<br><b>Nội dung:</b> <span id="transferCode">Đang tạo...</span></div><input class="field" id="topupAmount" type="number" min="10000" placeholder="Số tiền (VNĐ)"><button class="primary" id="createTopup">Tạo yêu cầu nạp</button><p id="topupMsg"></p>`);
 $("#createTopup").onclick=async()=>{const amount=Number($("#topupAmount").value);if(!Number.isInteger(amount)||amount<10000)return alert("Số tiền tối thiểu 10.000đ.");const{data,error}=await sb.rpc("create_topup",{p_amount:amount});if(error)return alert(error.message);$("#transferCode").textContent=data.transfer_code;$("#topupMsg").innerHTML=`Đã tạo yêu cầu <b>${data.id}</b>. Chuyển đúng ${amount.toLocaleString("vi-VN")}đ với nội dung <b>${data.transfer_code}</b>, sau đó chờ hệ thống đối soát.`;};
}
$("#withdraw").onclick=withdrawModal;
async function withdrawModal(){
 if(!sb)return pop("<h2>💸 Rút COIN</h2><p>Cấu hình Supabase trước.</p>");
 const {data:{user}}=await sb.auth.getUser(); if(!user)return login();
 const {data:p}=await sb.from("profiles").select("balance").eq("id",user.id).single();
 pop(`<h2>💸 Rút COIN</h2><p>Số dư: <b>${Number(p?.balance||0).toLocaleString("vi-VN")} coin</b>. Tối thiểu 70.000.</p>
 <select class="field" id="wdMethod"><option>MoMo</option><option>Ngân hàng</option><option>Thẻ cào</option></select>
 <input class="field" id="wdAmount" type="number" min="70000" placeholder="Số coin">
 <input class="field" id="wdReceiver" placeholder="SĐT / STK nhận tiền">
 <button class="primary" id="wdSend">Gửi yêu cầu rút</button><p id="wdMsg"></p>`);
 $("#wdSend").onclick=async()=>{
  const amount=Number($("#wdAmount").value), receiver=$("#wdReceiver").value.trim();
  if(!Number.isInteger(amount)||amount<70000)return alert("Tối thiểu 70.000 coin.");
  if(!receiver)return alert("Nhập thông tin nhận tiền.");
  const {data,error}=await sb.functions.invoke("create-withdrawal",{body:{amount,method:$("#wdMethod").value,receiver}});
  if(error)return $("#wdMsg").textContent=error.message;
  $("#wdMsg").textContent=data?.message||"Đã gửi yêu cầu. Server sẽ kiểm tra risk trước payout.";
 };
}
async function load(){if(!sb){demo();return}let{data:{user}}=await sb.auth.getUser();if(!user){demo();return}$("#auth").textContent="Đăng xuất";$("#auth").onclick=async()=>{await sb.auth.signOut();location.reload()};let{data:p}=await sb.from("profiles").select("*").eq("id",user.id).single();if(p){$("#name").textContent=p.display_name||user.email;$("#balance").textContent=Number(p.balance).toLocaleString("vi-VN");$("#level").textContent=`Cấp độ ${p.level||1} · EXP ${p.exp||0}`};let{data:t}=await sb.from("tasks").select("*").eq("status","active").order("created_at",{ascending:false});render(t||[])}
function demo(){render([{id:"demo",title:"Nhiệm vụ mẫu",description:"Cấu hình provider callback để xác minh tự động.",reward:500,url:"#"}])}
function render(ts){$("#tasks").innerHTML=ts.map(t=>`<article class="card task"><div class="icon">🎯</div><div class="info"><b>${esc(t.title)}</b><p>${esc(t.description||"")}</p></div><div class="reward">+${Number(t.reward).toLocaleString("vi-VN")}</div><button class="do" onclick="claim('${t.id}')">Làm</button></article>`).join("")}
async function claim(id){
 if(!sb)return alert("Cấu hình Supabase trước.");
 let{data:{user}}=await sb.auth.getUser(); if(!user)return login();
 let{data:t,error:te}=await sb.from("tasks").select("url,task_type,reward").eq("id",id).single();
 if(te)return alert(te.message);
 let{data:c,error}=await sb.from("task_claims").insert({task_id:id,user_id:user.id,status:"started"}).select().single();
 if(error)return alert(error.message);
 if(t.task_type==="code"){
   pop('<h2>Nhập mã nhiệm vụ</h2><p>Nhập mã bạn nhận được để xác nhận.</p><input class="field" id="taskCode" placeholder="Mã xác nhận"><button class="primary" id="verifyBtn">Xác nhận</button>');
   $("#verifyBtn").onclick=()=>verifyCode(c.id);
 }else{
   if(t.url&&t.url!=="#")open(t.url,"_blank");
   alert("Đã tạo lượt Review. Sau khi hoàn thành, hãy gửi ảnh bằng chứng cho Admin.");
 }
}
async function verifyCode(claimId){
 const code=$("#taskCode").value.trim(); if(!code)return alert("Nhập mã.");
 const{data,error}=await sb.functions.invoke("verify-code",{body:{claim_id:claimId,code}});
 if(error)return alert(error.message);
 alert(data?.status==="paid"?"Xác nhận thành công — COIN đã được cộng ngay.":data?.status==="manual_review"?"Lượt này có dấu hiệu bất thường và đã chuyển Admin kiểm tra.":"Mã không hợp lệ.");
 close(); load();
}
async function openReviewUpload(){
 pop('<h2>Gửi ảnh Review Map</h2><p>Chỉ gửi ảnh bằng chứng thật.</p><input class="field" id="claimId" placeholder="Claim ID"><input class="field" id="proofFile" type="file" accept="image/*"><button class="primary" id="sendProof">Gửi Admin</button>');
 $("#sendProof").onclick=sendProof;
}
async function sendProof(){
 if(!sb)return alert("Cấu hình Supabase trước.");
 let{data:{user}}=await sb.auth.getUser(); if(!user)return login();
 const id=$("#claimId").value.trim(),file=$("#proofFile").files[0];
 if(!id||!file)return alert("Nhập Claim ID và chọn ảnh.");
 if(file.size>5*1024*1024)return alert("Ảnh tối đa 5MB.");
 const ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`${user.id}/${id}.${ext}`;
 const up=await sb.storage.from("task-proofs").upload(path,file,{upsert:false});
 if(up.error)return alert(up.error.message);
 const r=await sb.from("task_proofs").insert({claim_id:id,user_id:user.id,storage_path:path,status:"pending"});
 if(r.error)return alert(r.error.message);
 close();alert("Đã gửi ảnh cho Admin.");
}

function toggleAI(){document.querySelector("#aiPanel").classList.toggle("open");if(document.querySelector("#aiPanel").classList.contains("open"))document.querySelector("#aiInput").focus()}
function aiSend(e){e.preventDefault();const input=document.querySelector("#aiInput"),body=document.querySelector("#aiBody"),t=input.value.trim();if(!t)return;const me=document.createElement("div");me.className="aiBubble me";me.textContent=t;body.appendChild(me);input.value="";setTimeout(()=>{let r=/số dư|coin/i.test(t)?"Bạn có thể xem số dư ở Ví COIN.":/nhiệm vụ|task/i.test(t)?"Vượt link dùng mã xác nhận; Review Map cần ảnh và Admin duyệt.":/rút/i.test(t)?"Vào Rút COIN, nhập phương thức và thông tin nhận. Yêu cầu sẽ qua Risk Engine trước payout.":"Mình hỗ trợ về nhiệm vụ, coin, nạp/rút và trạng thái xét duyệt.";const b=document.createElement("div");b.className="aiBubble";b.textContent=r;body.appendChild(b);body.scrollTop=body.scrollHeight},300)}


/* TASKVN AUTH UI — Supabase Auth */
(function(){
  const $=id=>document.getElementById(id);
  const modal=$("taskvn-auth");
  if(!modal) return;
  let mode="login";

  function openAuth(next="login"){
    mode=next;
    $("taskvn-auth-title").textContent=mode==="login"?"Đăng nhập TASKVN":"Tạo tài khoản TASKVN";
    $("taskvn-auth-subtitle").textContent=mode==="login"?"Đăng nhập để quản lý nhiệm vụ và số dư.":"Tạo tài khoản bằng email và mật khẩu.";
    $("taskvn-auth-submit").textContent=mode==="login"?"Đăng nhập":"Đăng ký";
    $("taskvn-auth-switch").textContent=mode==="login"?"Chưa có tài khoản? Đăng ký":"Đã có tài khoản? Đăng nhập";
    $("taskvn-auth-confirm-wrap").hidden=mode==="login";
    $("taskvn-auth-reset").hidden=mode!=="login";
    $("taskvn-auth-status").textContent="";
    modal.classList.add("open"); modal.setAttribute("aria-hidden","false");
  }
  function closeAuth(){modal.classList.remove("open");modal.setAttribute("aria-hidden","true")}
  window.TASKVN_OPEN_AUTH=openAuth;

  $("taskvn-auth-close").onclick=closeAuth;
  $("taskvn-auth-switch").onclick=()=>openAuth(mode==="login"?"register":"login");
  $("taskvn-auth-reset").onclick=async()=>{
    const email=$("taskvn-email").value.trim();
    if(!email){$("taskvn-auth-status").textContent="Nhập email trước.";return}
    const sb=window.supabase;
    if(!sb?.auth){$("taskvn-auth-status").textContent="Auth chưa được cấu hình.";return}
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
    $("taskvn-auth-status").textContent=error?error.message:"Đã gửi email đặt lại mật khẩu.";
  };

  $("taskvn-auth-form").onsubmit=async e=>{
    e.preventDefault();
    const email=$("taskvn-email").value.trim();
    const password=$("taskvn-password").value;
    const status=$("taskvn-auth-status");
    const sb=window.supabase;
    if(!sb?.auth){status.textContent="Chưa tìm thấy Supabase Auth. Hãy cấu hình Supabase client.";return}
    status.textContent="Đang xử lý…";
    try{
      if(mode==="register"){
        const confirm=$("taskvn-password-confirm").value;
        if(password!==confirm){status.textContent="Mật khẩu nhập lại không khớp.";return}
        const {data,error}=await sb.auth.signUp({
          email,password,
          options:{emailRedirectTo:location.origin}
        });
        if(error) throw error;
        if(data.session){
          status.textContent="Đăng ký thành công.";
          setTimeout(closeAuth,600);
        }else{
          status.textContent="Đăng ký thành công. Kiểm tra email để xác nhận tài khoản.";
        }
      }else{
        const {error}=await sb.auth.signInWithPassword({email,password});
        if(error) throw error;
        status.textContent="Đăng nhập thành công.";
        setTimeout(closeAuth,400);
      }
    }catch(err){status.textContent=err?.message||"Có lỗi xảy ra."}
  };

  // If the existing page has no auth buttons, expose global helpers.
  document.addEventListener("click",e=>{
    const t=e.target.closest("[data-taskvn-login]");
    if(t){e.preventDefault();openAuth("login")}
    const r=e.target.closest("[data-taskvn-register]");
    if(r){e.preventDefault();openAuth("register")}
  });
})();


/* Hidden Admin Gate: two taps/clicks on the hidden trigger opens the code gate. */
(function(){
  const GATE_CODE="2805"; // UI gate only; real Admin authorization remains server-side.
  const gate=document.getElementById("taskvn-admin-gate");
  if(!gate)return;
  const code=document.getElementById("taskvn-admin-gate-code");
  const status=document.getElementById("taskvn-admin-gate-status");
  const close=()=>{gate.classList.remove("open");gate.setAttribute("aria-hidden","true");code.value="";status.textContent=""};
  window.TASKVN_OPEN_ADMIN_GATE=()=>{gate.classList.add("open");gate.setAttribute("aria-hidden","false");setTimeout(()=>code.focus(),100)};
  document.getElementById("taskvn-admin-gate-close").onclick=close;

  document.getElementById("taskvn-admin-gate-submit").onclick=()=>{
    if(code.value===GATE_CODE){
      status.textContent="Đúng mã. Đang mở đăng nhập Admin…";
      sessionStorage.setItem("taskvn_admin_gate_ok","1");
      setTimeout(()=>{
        close();
        // Use an existing Admin page if present.
        if(window.location.pathname.includes("/admin/")) return;
        location.href="/admin/";
      },350);
    }else{
      status.textContent="Mã không đúng.";
      code.value="";
      code.focus();
    }
  };

  code.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("taskvn-admin-gate-submit").click()});

  // Secret two-tap trigger: tap the logo twice within 700ms.
  let taps=0,timer;
  document.addEventListener("click",e=>{
    const trigger=e.target.closest(".logo,.logo-mark,[data-taskvn-admin-trigger]");
    if(!trigger)return;
    taps++;
    clearTimeout(timer);
    timer=setTimeout(()=>taps=0,700);
    if(taps===2){taps=0;window.TASKVN_OPEN_ADMIN_GATE()}
  });
})();


(function(){
  const welcome=document.getElementById("taskvn-welcome");
  if(!welcome)return;
  const open=(mode)=>{
    welcome.style.display="none";
    if(window.TASKVN_OPEN_AUTH) window.TASKVN_OPEN_AUTH(mode);
    else welcome.style.display="";
  };
  document.getElementById("tw-register").onclick=()=>open("register");
  document.getElementById("tw-login").onclick=()=>open("login");
  document.getElementById("tw-login-top").onclick=()=>open("login");
})();


/* TASKVN PAYOUT + SHOP TOPUP */
(function(){
  const $=id=>document.getElementById(id);
  const api=async body=>{
    const r=await fetch("/api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.ok===false) throw new Error(d.error||"REQUEST_FAILED");
    return d;
  };
  const method=$("tw-payout-method");
  if(!method)return;
  method.onchange=()=>{$("tw-payout-bank").hidden=method.value!=="bank"};
  $("tw-payout-submit").onclick=async()=>{
    const amount=Number($("tw-payout-amount").value), status=$("tw-payout-status");
    if(amount<50000){status.textContent="Rút tối thiểu 50.000đ.";return}
    status.textContent="Đang gửi yêu cầu…";
    try{
      await api({action:"create_payout",method:method.value,amount,
        name:$("tw-payout-name").value.trim(),target:$("tw-payout-target").value.trim(),
        bank:$("tw-payout-bank").value.trim()});
      status.textContent="Đã gửi. Chờ Admin duyệt.";
      loadPayouts();
    }catch(e){status.textContent=e.message}
  };
  $("tw-topup-submit").onclick=async()=>{
    const amount=Number($("tw-topup-amount").value), shop=$("tw-shop-account").value.trim(), status=$("tw-topup-status");
    if(amount<10000){status.textContent="Nạp tối thiểu 10.000đ.";return}
    if(!shop){status.textContent="Nhập tên tài khoản Shop.";return}
    status.textContent="Đang tạo yêu cầu…";
    try{await api({action:"create_shop_topup",shop_account:shop,amount});status.textContent="Đã tạo yêu cầu nạp Shop."}
    catch(e){status.textContent=e.message}
  };
  async function loadPayouts(){
    const box=$("tw-payout-list"); if(!box)return;
    try{
      const d=await api({action:"my_payouts"}), rows=d.items||[];
      box.innerHTML=rows.length?rows.map(x=>`<div class="tw-payout-item"><div><b>${Number(x.amount||0).toLocaleString("vi-VN")}đ</b><small>${x.method==="momo"?"MoMo":"Ngân hàng"} • ${x.created_at||""}</small></div><span class="tw-status">${x.status||"pending"}</span></div>`).join(""):'<div class="tw-empty">Chưa có yêu cầu rút.</div>';
    }catch(e){box.innerHTML='<div class="tw-empty">Đăng nhập để xem yêu cầu rút.</div>'}
  }
  $("tw-refresh-payouts").onclick=loadPayouts;
  window.TASKVN_LOAD_PAYOUTS=loadPayouts;
  loadPayouts();
})();
