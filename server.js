require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const multer = require('multer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const uploadDir = path.join(ROOT, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(ROOT, 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, image TEXT, price_cents INTEGER NOT NULL DEFAULT 100, difficulty INTEGER NOT NULL DEFAULT 3, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, card_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', provider_ref TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, paid_at TEXT, scratched_at TEXT, result TEXT, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(card_id) REFERENCES cards(id));
`);
const defaults = {
  site_name: process.env.SITE_NAME || 'MEGA RASPADINHA',
  logo: '',
  support_phone: process.env.SUPPORT_PHONE || '',
  payment_url: process.env.PAYMENT_URL || '',
  payment_instructions: 'Escaneie o QR Code ou abra o link de pagamento. A liberação só acontece após confirmação real pelo provedor.',
  admin_message: 'Bem-vindo! Boa sorte e jogue com responsabilidade.',
  theme_primary: '#6d28d9'
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
Object.entries(defaults).forEach(([k,v]) => insertSetting.run(k, String(v)));
if (db.prepare('SELECT COUNT(*) n FROM cards').get().n === 0) {
  db.prepare('INSERT INTO cards(title,image,price_cents,difficulty,enabled) VALUES(?,?,?,?,1)').run('Raspadinha da Sorte', '', 100, 3);
}
const getSettings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x => [x.key,x.value]));
const setSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-secret-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }
}));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(ROOT,'public')));
const storage = multer.diskStorage({
  destination: (_req,_file,cb)=>cb(null,uploadDir),
  filename: (_req,file,cb)=>cb(null, Date.now()+'-'+crypto.randomBytes(4).toString('hex')+path.extname(file.originalname).toLowerCase())
});
const upload = multer({storage, limits:{fileSize:5*1024*1024}, fileFilter:(_req,file,cb)=>{
  const ok=/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype);
  cb(ok?null:new Error('Envie uma imagem PNG, JPG, WEBP ou GIF.'),ok);
}});
function admin(req,res,next){ if(req.session && req.session.admin) return next(); return res.status(401).json({error:'Acesso administrativo necessário.'}); }
function phoneClean(v){ return String(v||'').replace(/\D/g,'').slice(0,20); }
function cents(v){ const n=Number(v); if(!Number.isFinite(n)||n<0.5||n>10000) throw new Error('O valor deve estar entre R$ 0,50 e R$ 10.000,00.'); return Math.round(n*100); }
app.get('/api/public',(_req,res)=>{
 const s=getSettings();
 res.json({settings:{site_name:s.site_name,logo:s.logo,support_phone:s.support_phone,payment_url:s.payment_url,payment_instructions:s.payment_instructions,admin_message:s.admin_message,theme_primary:s.theme_primary},
 cards:db.prepare('SELECT id,title,image,price_cents,difficulty FROM cards WHERE enabled=1 ORDER BY id DESC').all()});
});
app.post('/api/register',(req,res)=>{
 const name=String(req.body.name||'').trim().slice(0,80), phone=phoneClean(req.body.phone);
 if(name.length<2||phone.length<8) return res.status(400).json({error:'Informe seu nome e um telefone válido.'});
 try{
   const info=db.prepare('INSERT INTO users(name,phone) VALUES(?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name').run(name,phone);
   const user=db.prepare('SELECT id,name,phone FROM users WHERE phone=?').get(phone);
   req.session.userId=user.id;
   res.json({user:{id:user.id,name:user.name,phone:user.phone}});
 }catch(e){res.status(500).json({error:'Não foi possível concluir o cadastro.'});}
});
app.get('/api/me',(req,res)=>{
 if(!req.session.userId) return res.json({user:null});
 const user=db.prepare('SELECT id,name,phone FROM users WHERE id=?').get(req.session.userId);
 res.json({user:user||null});
});
app.post('/api/orders',(req,res)=>{
 if(!req.session.userId) return res.status(401).json({error:'Faça seu cadastro antes de continuar.'});
 const card=db.prepare('SELECT * FROM cards WHERE id=? AND enabled=1').get(Number(req.body.cardId));
 if(!card) return res.status(404).json({error:'Raspadinha indisponível.'});
 const id='MR-'+crypto.randomBytes(8).toString('hex').toUpperCase();
 db.prepare('INSERT INTO orders(id,user_id,card_id,amount_cents,status) VALUES(?,?,?,?,?)').run(id,req.session.userId,card.id,card.price_cents,'pending');
 const s=getSettings();
 const url=s.payment_url || '';
 QRCode.toDataURL(url || `${req.protocol}://${req.get('host')}/`,{width:240,margin:1}).then(qr=>{
   res.json({orderId:id,amountCents:card.price_cents,status:'pending',paymentUrl:url,qrCode:qr,
     message:url?'Abra o link ou escaneie o QR Code. O pedido só será liberado após confirmação do pagamento.':'O administrador ainda não configurou o link de pagamento.'});
 }).catch(()=>res.status(500).json({error:'Erro ao gerar QR Code.'}));
});
app.get('/api/orders/:id',(req,res)=>{
 if(!req.session.userId) return res.status(401).json({error:'Faça seu cadastro.'});
 const order=db.prepare(`SELECT o.id,o.amount_cents,o.status,o.result,o.scratched_at,c.title,c.image,c.difficulty
 FROM orders o JOIN cards c ON c.id=o.card_id WHERE o.id=? AND o.user_id=?`).get(req.params.id,req.session.userId);
 if(!order) return res.status(404).json({error:'Pedido não encontrado.'});
 res.json({order});
});
app.post('/api/orders/:id/scratch',(req,res)=>{
 if(!req.session.userId) return res.status(401).json({error:'Faça seu cadastro.'});
 const order=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id,req.session.userId);
 if(!order) return res.status(404).json({error:'Pedido não encontrado.'});
 if(order.status!=='paid') return res.status(403).json({error:'A raspadinha será liberada somente após a confirmação real do pagamento.'});
 if(order.scratched_at) return res.json({result:order.result,alreadyScratched:true});
 // DEMO: resultado ilustrativo. Configure regras, auditoria e autorização legal antes de usar prêmios reais.
 const results=['Tente novamente','Boa sorte na próxima','Prêmio demonstrativo'];
 const result=results[crypto.randomInt(0,results.length)];
 db.prepare('UPDATE orders SET scratched_at=CURRENT_TIMESTAMP,result=? WHERE id=?').run(result,order.id);
 res.json({result});
});
app.post('/api/admin/login',(req,res)=>{
 const supplied=String(req.body.password||'');
 if(!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD==='troque-esta-senha') return res.status(503).json({error:'Configure ADMIN_PASSWORD no arquivo .env antes de usar o painel.'});
 if(!crypto.timingSafeEqual(Buffer.from(supplied.padEnd(128,' ')).subarray(0,128),Buffer.from(process.env.ADMIN_PASSWORD.padEnd(128,' ')).subarray(0,128))) return res.status(401).json({error:'Senha incorreta.'});
 req.session.admin=true; res.json({ok:true});
});
app.post('/api/admin/logout',admin,(req,res)=>{req.session.destroy(()=>res.json({ok:true}));});
app.get('/api/admin/data',admin,(req,res)=>{
 res.json({settings:getSettings(),cards:db.prepare('SELECT * FROM cards ORDER BY id DESC').all(),
 orders:db.prepare(`SELECT o.*,u.name user_name,u.phone,c.title card_title FROM orders o JOIN users u ON u.id=o.user_id JOIN cards c ON c.id=o.card_id ORDER BY o.created_at DESC LIMIT 200`).all()});
});
app.post('/api/admin/settings',admin,(req,res)=>{
 const allowed=['site_name','logo','support_phone','payment_url','payment_instructions','admin_message','theme_primary'];
 for(const k of allowed) if(req.body[k]!==undefined) setSetting.run(k,String(req.body[k]).slice(0,2000));
 res.json({ok:true});
});
app.post('/api/admin/upload',admin,(req,res)=>{
 upload.single('image')(req,res,err=>{
   if(err) return res.status(400).json({error:err.message});
   if(!req.file) return res.status(400).json({error:'Selecione uma imagem.'});
   res.json({url:'/uploads/'+req.file.filename});
 });
});
app.post('/api/admin/cards',admin,(req,res)=>{
 try{
  const title=String(req.body.title||'').trim().slice(0,100);
  if(!title) return res.status(400).json({error:'Informe o nome da raspadinha.'});
  const price=cents(req.body.price);
  const difficulty=Math.max(1,Math.min(5,Number(req.body.difficulty)||3));
  const image=String(req.body.image||'').slice(0,500);
  const info=db.prepare('INSERT INTO cards(title,image,price_cents,difficulty,enabled) VALUES(?,?,?,?,1)').run(title,image,price,difficulty);
  res.json({ok:true,id:info.lastInsertRowid});
 }catch(e){res.status(400).json({error:e.message});}
});
app.patch('/api/admin/cards/:id',admin,(req,res)=>{
 const card=db.prepare('SELECT * FROM cards WHERE id=?').get(Number(req.params.id));
 if(!card) return res.status(404).json({error:'Raspadinha não encontrada.'});
 const enabled=req.body.enabled===undefined?card.enabled:(req.body.enabled?1:0);
 db.prepare('UPDATE cards SET enabled=? WHERE id=?').run(enabled,card.id);
 res.json({ok:true});
});
app.delete('/api/admin/cards/:id',admin,(req,res)=>{
 db.prepare('UPDATE cards SET enabled=0 WHERE id=?').run(Number(req.params.id)); res.json({ok:true});
});
// WEBHOOK: não marque pagamentos como pagos com base apenas no corpo recebido.
// Implemente assinatura + consulta à API oficial do provedor antes de liberar.
app.post('/api/webhooks/payment',(req,res)=>{
 res.status(501).json({error:'Webhook ainda não conectado. Configure validação de assinatura e consulta à API oficial do provedor.'});
});
app.post('/api/admin/orders/:id/mark-paid-demo',admin,(req,res)=>{
 if(process.env.NODE_ENV==='production') return res.status(403).json({error:'A confirmação manual de demonstração está desativada em produção.'});
 const order=db.prepare('SELECT id FROM orders WHERE id=?').get(req.params.id);
 if(!order) return res.status(404).json({error:'Pedido não encontrado.'});
 db.prepare("UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
 res.json({ok:true,warning:'Confirmação de demonstração. Não representa pagamento real.'});
});
app.get('/api/admin/session',(req,res)=>res.json({admin:!!req.session.admin}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Erro interno do servidor.'});});
app.listen(PORT,()=>console.log(`Mega Raspadinha rodando em http://localhost:${PORT}`));
