const r=await fetch('http://127.0.0.1:3180/api/internal/mail-worker',{method:'POST',headers:{Authorization:`Bearer ${process.env.MAIL_WORKER_SECRET}`},signal:AbortSignal.timeout(40000)});
if(!r.ok)throw new Error(`Mail worker HTTP ${r.status}`);
console.log(await r.text());
