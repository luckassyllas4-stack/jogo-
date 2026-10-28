let state={settings:{},cards:[],user:null,currentOrder:null};
const $=s=>document.querySelector(s);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
async function api(url,options={}){const res=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||'Ocorreu um erro.');return data}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
function modal(id,show=true){$('#'+id).classList.toggle('hidden',!show)}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>modal(b.dataset.close,false)));
async function load(){
 try{
  const d=await api('/api/public');state.settings=d.settings;state.cards=d.cards;
  $('#brandName').textContent=d.settings.site_name;$('#footerName').textContent=d.settings.site_name;$('#year').textContent=new Date().getFullYear();
  $('#welcomeText').textContent=d.settings.admin_message||'Uma experiência colorida, simples e divertida.';
  if(d.settings.logo){$('.brand-mark').innerHTML=`<img src="${esc(d.settings.logo)}" style="width:42px;height:42px;object-fit:contain;border-radius:12px">`}
  const phone=(d.settings.support_phone||'').replace(/\D/g,'');
  $('#supportText').innerHTML=phone?`<a style="color:#d8b6ff" target="_blank" rel="noopener" href="https://wa.me/${phone}">Fale pelo WhatsApp</a>`:'Fale com o suporte';
  renderCards();const me=await api('/api/me');state.user=me.user;
 }catch(e){$('#cardsGrid').innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderCards(){
 const grid=$('#cardsGrid');
 if(!state.cards.length){grid.innerHTML='<div class="empty">Ainda não há raspadinhas disponíveis.</div>';return}
 grid.innerHTML=state.cards.map(c=>`<article class="game-card"><div class="card-image">${c.image?`<img src="${esc(c.image)}" alt="${esc(c.title)}">`:'<div class="fallback">🍀✨</div>'}</div><div class="card-content"><h3>${esc(c.title)}</h3><p>Uma experiência especial. Confira as regras antes de participar.</p><div class="card-meta"><span class="price">${money(c.price_cents)}</span><span class="difficulty">${'★'.repeat(c.difficulty)}${'☆'.repeat(5-c.difficulty)}<br>nível ${c.difficulty}/5</span></div><button class="primary full" data-play="${c.id}">Escolher raspadinha ↗</button></div></article>`).join('');
 grid.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click',()=>startOrder(Number(b.dataset.play))));
}
async function startOrder(cardId){
 if(!state.user){state.pendingCard=cardId;$('#registerError').textContent='';modal('registerModal');return}
 await createOrder(cardId);
}
$('#registerForm').addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.target);
 try{const d=await api('/api/register',{method:'POST',body:JSON.stringify({name:fd.get('name'),phone:fd.get('phone')})});state.user=d.user;modal('registerModal',false);if(state.pendingCard)await createOrder(state.pendingCard)}
 catch(err){$('#registerError').textContent=err.message}
});
async function createOrder(cardId){
 try{
  const d=await api('/api/orders',{method:'POST',body:JSON.stringify({cardId})});state.currentOrder=d.orderId;
  $('#paymentPrice').textContent=money(d.amountCents);$('#paymentMessage').textContent=d.message;$('#paymentError').textContent='';
  $('#paymentStatus').textContent='Status: aguardando confirmação';
  if(d.qrCode){$('#paymentQr').src=d.qrCode;$('#paymentQr').classList.remove('hidden')}
  if(d.paymentUrl){$('#paymentLink').href=d.paymentUrl;$('#paymentLink').classList.remove('hidden')}else $('#paymentLink').classList.add('hidden');
  modal('paymentModal');
 }catch(e){toast(e.message)}
}
$('#checkPayment').addEventListener('click',async()=>{
 if(!state.currentOrder)return;
 try{const d=await api('/api/orders/'+encodeURIComponent(state.currentOrder));const o=d.order;
 $('#paymentStatus').textContent='Status: '+(o.status==='paid'?'PAGAMENTO CONFIRMADO':o.status==='pending'?'aguardando confirmação':o.status);
 if(o.status==='paid'){modal('paymentModal',false);openScratch(o)}else $('#paymentError').textContent='Ainda não recebemos uma confirmação do provedor. Se você já pagou, aguarde alguns instantes e tente novamente.'}
 catch(e){$('#paymentError').textContent=e.message}
});
function openScratch(order){state.currentOrder=order.id;$('#scratchTitle').textContent=order.title;$('#scratchResult').textContent=order.result||'Boa sorte!';modal('scratchModal');setupCanvas()}
let scratching=false,ctx,canvas;
function setupCanvas(){
 canvas=$('#scratchCanvas');ctx=canvas.getContext('2d');ctx.globalCompositeOperation='source-over';
 const grad=ctx.createLinearGradient(0,0,640,300);grad.addColorStop(0,'#d9d9e3');grad.addColorStop(.5,'#f7f4fa');grad.addColorStop(1,'#aaa9b9');ctx.fillStyle=grad;ctx.fillRect(0,0,640,300);
 ctx.fillStyle='#5a4a70';ctx.font='bold 35px Manrope, sans-serif';ctx.textAlign='center';ctx.fillText('RASPE AQUI ✨',320,155);
 ctx.globalCompositeOperation='destination-out';
}
function scratchAt(e){const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*640,y=(e.clientY-r.top)/r.height*300;ctx.beginPath();ctx.arc(x,y,25,0,Math.PI*2);ctx.fill()}
$('#scratchCanvas').addEventListener('pointerdown',e=>{scratching=true;canvas.setPointerCapture(e.pointerId);scratchAt(e)});
$('#scratchCanvas').addEventListener('pointermove',e=>{if(scratching)scratchAt(e)});
$('#scratchCanvas').addEventListener('pointerup',()=>scratching=false);
$('#scratchCanvas').addEventListener('pointercancel',()=>scratching=false);
$('#revealScratch').addEventListener('click',async()=>{
 if(!state.currentOrder)return;
 try{const d=await api('/api/orders/'+encodeURIComponent(state.currentOrder)+'/scratch',{method:'POST',body:'{}'});$('#scratchResult').textContent=d.result;ctx.clearRect(0,0,640,300);toast('Resultado exibido. Este é um modelo demonstrativo.')}
 catch(e){toast(e.message)}
});
$('#shareBtn').addEventListener('click',async()=>{
 const data={title:state.settings.site_name||'Mega Raspadinha',text:'Confira esta experiência de raspadinha!',url:location.href};
 try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);toast('Link copiado para compartilhar!')}}catch{}
});
load();
