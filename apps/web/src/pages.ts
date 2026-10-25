import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool, tx } from '../../../packages/db/index.ts';
import { isSameOrigin } from '../../../packages/shared/http-security.ts';
import { config } from '../../../packages/shared/config.ts';
import { digest, randomToken } from '../../../packages/integrations/crypto.ts';
import { DomainError, setOptIn } from '../../../packages/shared/domain.ts';

type Member={id:string;organization_id:string;display_name:string;branch_id:string};
type Principal=(req:any,required?:boolean)=>Promise<Member|undefined>;
export const escapeHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const label=(v:string)=>escapeHtml(v.replaceAll('_',' ').toLowerCase());
const date=(v:unknown)=>v?escapeHtml(new Date(String(v)).toLocaleString('en-GB',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'}))+' WAT':'Not yet recorded';
export function renderPage(title:string,body:string,member?:Member) {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · CTDMP Connect</title><style>
:root{color-scheme:dark;--navy:#101b2e;--panel:#19283e;--cream:#fff5e2;--muted:#c2cbd9;--gold:#f2cf83}*{box-sizing:border-box}body{margin:0;background:var(--navy);color:var(--cream);font:17px/1.6 system-ui,sans-serif}a{color:var(--gold);text-underline-offset:4px}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid white;outline-offset:4px}.skip{position:absolute;top:-80px}.skip:focus{top:0;background:black;padding:12px;z-index:9}.banner{padding:8px 20px;text-align:center;background:#423618;color:#ffe6ae;font-size:13px;font-weight:700;letter-spacing:.04em}header,main,footer{max-width:1120px;margin:auto;padding:24px}header{display:flex;gap:24px;align-items:center;justify-content:space-between;border-bottom:1px solid #3b4657}.brand{font-size:21px;font-weight:750;color:var(--cream);text-decoration:none}nav{display:flex;gap:18px;flex-wrap:wrap}nav a{min-height:44px;display:inline-flex;align-items:center}main{padding-top:40px;min-height:65vh}h1{font-size:clamp(2rem,5vw,3.7rem);line-height:1.12;margin:12px 0 24px;max-width:800px}h2{line-height:1.3;font-size:24px}.eyebrow{color:var(--gold);text-transform:uppercase;letter-spacing:.12em;font-size:13px;font-weight:700}.muted,small{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}.card{background:var(--panel);padding:28px;border:1px solid #344159;border-radius:16px;margin-bottom:20px}.hero{padding:clamp(24px,5vw,56px);background:linear-gradient(130deg,#24354c,#142138)}.pill{display:inline-block;border:1px solid #8e7849;border-radius:100px;padding:4px 12px;color:var(--gold);font-size:14px}.button,button{display:inline-block;border:0;border-radius:9px;padding:13px 22px;min-height:48px;background:var(--gold);color:#101b2e;font:700 16px system-ui;text-decoration:none;cursor:pointer}.secondary{background:transparent;border:1px solid #77849a;color:var(--cream)}input[type=text],input[type=password]{display:block;width:100%;max-width:560px;margin:8px 0 20px;padding:14px;background:#101b2e;color:white;border:1px solid #8794aa;border-radius:8px;font:inherit}label{display:block}input[type=checkbox]{width:22px;height:22px;vertical-align:middle;margin:12px}table{width:100%;border-collapse:collapse;text-align:left;font-size:15px}td,th{padding:12px 8px;border-bottom:1px solid #3b4657;vertical-align:top}th{color:var(--muted)}.scroll{overflow-x:auto}.notice{border-left:4px solid var(--gold);padding:12px 18px;background:#28364b}dl{display:grid;grid-template-columns:minmax(100px,1fr) 2fr;gap:12px}dd{margin:0;overflow-wrap:anywhere}footer{border-top:1px solid #3b4657;color:var(--muted);font-size:14px}form{margin:20px 0}code{overflow-wrap:anywhere}@media(max-width:600px){header{align-items:flex-start;flex-direction:column;gap:4px;padding:20px}main{padding:24px 16px}.card{padding:22px}nav{gap:16px}h1{font-size:36px}dl{grid-template-columns:1fr}dd{margin-bottom:8px}}
</style></head><body><a class=skip href=#main>Skip to content</a><div class=banner>PRIVATE DEVELOPMENT · FICTIONAL MEMBERS · MOCK PROVIDERS · NO REAL MESSAGES</div><header><a class=brand href=/>CTDMP Connect <span aria-hidden=true>✦</span></a><nav aria-label="Main navigation"><a href=/live>Home</a><a href=/account>My account</a>${member?'<a href=/account/history>My link history</a>':'<a href=/demo/sign-in>Development sign-in</a>'}</nav></header><main id=main>${body}</main><footer>A Digital Family Built in Love.<br>Working product identity. Official affiliation has not been verified.<br>Link-opening records do not prove viewing duration or attendance.</footer></body></html>`;
}
const field=(csrf:string)=>`<input type="hidden" name="csrf" value="${csrf}">`;
export async function registerPages(a:FastifyInstance,principal:Principal) {
 const csrfFor=(browser:string,session:string,scope:string)=>createHmac('sha256',config.FIXTURE_SECRET).update(JSON.stringify([browser,session,scope])).digest('hex');
 const csrf=(req:any,reply:any,scope:string)=>{
  const browser=req.cookies.web_browser??randomToken();
  if(!req.cookies.web_browser)reply.setCookie('web_browser',browser,{path:'/',httpOnly:true,sameSite:'strict',maxAge:3600});
  return csrfFor(browser,req.cookies.fixture_session??'',scope);
 };
 const protect=(req:any,scope:string)=>{
  if(!isSameOrigin(req))throw new DomainError('INVALID_ORIGIN',403);
  const input=z.object({csrf:z.string().length(64)}).passthrough().parse(req.body);
  const expected=csrfFor(req.cookies.web_browser??'',req.cookies.fixture_session??'',scope);
  if(!req.cookies.web_browser||!timingSafeEqual(Buffer.from(input.csrf),Buffer.from(expected)))throw new DomainError('INVALID_ACTION',403);
 };
 const html=(reply:any,title:string,body:string,m?:Member)=>reply.type('text/html').send(renderPage(title,body,m));
 const current=async()=> (await pool.query('SELECT p.*,s.video_id,s.observed_at FROM programs p LEFT JOIN stream_versions s ON s.program_id=p.id AND s.sequence=p.current_sequence ORDER BY p.local_date DESC,p.id DESC LIMIT 1')).rows[0];
 const home=async(req:any,reply:any)=>{
  const m=await principal(req,false);const p=await current();
  const live=p?.state==='LIVE_CONFIRMED';const uncertain=['SUSPECTED_INTERRUPTION','RECOVERY_SEARCH','AWAITING_ADMIN'].includes(p?.state);
  const heading=live?'Your simulated livestream is ready.':uncertain?'We’re checking the livestream link.':'A place to stay connected.';
  const action=live?`<form method=post action=/live/confirm>${field(csrf(req,reply,'join'))}<button>Join simulated live</button></form>`:'';
  return html(reply,'Home',`<section class="card hero"><span class=eyebrow>A Digital Family Built in Love</span><h1>${heading}</h1><p>${p?escapeHtml(p.title):'No program has been configured.'}</p><span class=pill>${p?label(p.state):'No confirmed schedule'}</span>${action}<p class=muted>${live?'This fixture opens a mock YouTube video ID. It is not a real CTDMP broadcast.':uncertain?'No guessed replacement will be opened. Please return shortly.':'The next real program time has not been confirmed.'}</p></section><div class=grid><section class=card><h2>Your private link history</h2><p>See deliberate link openings, with clear identity assurance. These records never measure faith or viewing duration.</p><a href=/account/history>Open my history</a></section><section class=card><h2>Updates on your terms</h2><p>Choose whether this fictional account receives simulated start alerts. You can stop them at any time.</p><a href=/account/preferences>Manage preferences</a></section><section class=card><h2>More ways to connect</h2><p>Replays, verified church discovery, community submissions and real human referrals are planned. They are not available in this development slice.</p></section></div>`,m);
 };
 a.get('/',home);a.get('/live',home);
 a.post('/live/confirm',async(req,reply)=>{
  protect(req,'join');const m=await principal(req,false);
  const result=await tx(async c=>{
   const p=(await c.query('SELECT * FROM programs ORDER BY local_date DESC,id DESC LIMIT 1 FOR SHARE')).rows[0];
   if(!p||p.state!=='LIVE_CONFIRMED')throw new DomainError('STREAM_REVIEW_REQUIRED',503);
   const s=(await c.query('SELECT s.* FROM stream_versions s JOIN official_channels o ON o.id=s.channel_id WHERE s.program_id=$1 AND s.sequence=$2 AND o.approved AND o.program_id=s.program_id AND o.organization_id=$3',[p.id,p.current_sequence,p.organization_id])).rows[0];
   if(!s)throw new DomainError('SOURCE_REVIEW_REQUIRED',503);
   if(m) {
    const active=(await c.query('SELECT 1 FROM members WHERE id=$1 AND organization_id=$2 AND active FOR SHARE',[m.id,p.organization_id])).rowCount;
    if(!active)throw new DomainError('PERMISSION_DENIED',403);
    await c.query(`INSERT INTO checkin_events(organization_id,member_id,program_id,action,assurance,stream_sequence,last_stream_sequence) VALUES($1,$2,$3,'LIVE_LINK_OPENED','AUTHENTICATED_MEMBER',$4,$4) ON CONFLICT(organization_id,member_id,program_id,action) DO UPDATE SET last_opened_at=now(),last_stream_sequence=excluded.last_stream_sequence,assurance='AUTHENTICATED_MEMBER'`,[p.organization_id,m.id,p.id,p.current_sequence]);
   }
   return 'https://www.youtube.com/watch?v='+s.video_id;
  });
  return reply.code(303).header('Location',result).send();
 });
 a.get('/demo/sign-in',async(req,reply)=>html(reply,'Development sign-in',`<section class=card><span class=eyebrow>Private development only</span><h1>Open a fictional account</h1><p>This is a temporary fixture session, not production authentication. An operator must issue a short-lived access code on the VPS. No real member account is available.</p><form method=post action=/demo/sign-in>${field(csrf(req,reply,'login'))}<label for=access>Development access code</label><input id=access name=access type=password required maxlength=200 autocomplete=off><button>Open demo account</button></form><p class=muted>Production startup is blocked while fixture authentication is enabled.</p></section>`));
 a.post('/demo/sign-in',async(req,reply)=>{
  protect(req,'login');if(config.FIXTURE_AUTH_ENABLED!=='true')throw new DomainError('NOT_FOUND',404);
  const {access}=z.object({access:z.string().min(32).max(200)}).passthrough().parse(req.body);
  const s=(await pool.query('SELECT 1 FROM fixture_sessions s JOIN members m ON m.id=s.member_id WHERE s.digest=$1 AND NOT s.revoked AND s.expires_at>now() AND m.active',[digest(access)])).rowCount;
  if(!s)throw new DomainError('AUTHENTICATION_REQUIRED',401);
  reply.setCookie('fixture_session',access,{path:'/',httpOnly:true,sameSite:'strict',maxAge:3600});
  return reply.code(303).header('Location','/account').send();
 });
 a.get('/account',async(req,reply)=>{
  const m=(await principal(req))!;
  const grants=(await pool.query('SELECT permission FROM grants WHERE member_id=$1',[m.id])).rows;
  return html(reply,'My account',`<span class=eyebrow>Your fictional account</span><h1>Hello, ${escapeHtml(m.display_name)}.</h1><div class=grid><section class=card><h2>My link history</h2><p>Only your deliberate opening actions appear here.</p><a href=/account/history>View my history</a></section><section class=card><h2>Notification preferences</h2><p>You decide whether to receive simulated start alerts.</p><a href=/account/preferences>Manage preferences</a></section>${grants.some(g=>g.permission==='program.read')?'<section class=card><h2>Control room</h2><p>Program evidence and records permitted by your current grants.</p><a href=/admin>Open control room</a></section>':''}</div><form method=post action=/account/sign-out>${field(csrf(req,reply,'logout'))}<button class=secondary>Sign out this browser</button></form>`,m);
 });
 a.post('/account/sign-out',async(req,reply)=>{protect(req,'logout');await principal(req);await pool.query('UPDATE fixture_sessions SET revoked=true WHERE digest=$1',[digest(req.cookies.fixture_session??'')]);reply.clearCookie('fixture_session',{path:'/'});reply.clearCookie('web_browser',{path:'/'});return reply.code(303).header('Location','/').send();});
 a.get('/account/history',async(req,reply)=>{
  const m=(await principal(req))!;
  const rows=(await pool.query('SELECT c.*,p.title FROM checkin_events c JOIN programs p ON p.id=c.program_id WHERE c.member_id=$1 AND c.organization_id=$2 ORDER BY first_opened_at DESC LIMIT 50',[m.id,m.organization_id])).rows;
  return html(reply,'My link history',`<span class=eyebrow>Private to your account</span><h1>My link history</h1><p class=notice>These records show CTDMP Connect link actions only. They do not prove attendance, watching, or viewing duration.</p>${rows.length?rows.map(c=>`<article class=card><h2>${escapeHtml(c.title)}</h2><dl><dt>Action</dt><dd>Live link opened</dd><dt>First opened</dt><dd>${date(c.first_opened_at)}</dd><dt>Last opened</dt><dd>${date(c.last_opened_at)}</dd><dt>Identity</dt><dd>${c.assurance==='AUTHENTICATED_MEMBER'?'Matching signed-in fictional account':'Recipient link activated; person not confirmed'}</dd><dt>Destination</dt><dd>Stream revision ${escapeHtml(c.last_stream_sequence)}</dd></dl></article>`).join(''):'<section class=card><h2>No link openings yet</h2><p>Opening a landing page or receiving an alert does not create a record. Use the deliberate Join action when a verified simulated stream is available.</p><a href=/live>View program information</a></section>'}`,m);
 });
 a.get('/account/preferences',async(req,reply)=>{
  const m=(await principal(req))!;const p=(await pool.query('SELECT live_start FROM preferences WHERE member_id=$1',[m.id])).rows[0];
  return html(reply,'Preferences',`<span class=eyebrow>Your choice</span><h1>Notification preferences</h1>${(req.query as any).saved==='1'?'<p role=status class=notice>Preferences saved. Undispatched jobs will use your current choice.</p>':''}<section class=card><h2>Simulated WhatsApp alerts</h2><p>This environment sends no real messages and creates no real charges. This choice applies only to fictional live-start alerts.</p><form method=post action=/account/preferences>${field(csrf(req,reply,'preferences'))}<label><input type=checkbox name=liveStart value=true ${p?.live_start?'checked':''}>Prepare a simulated alert when CTDMP starts</label><p class=muted>You can withdraw this choice here at any time. Account creation does not require notification consent.</p><button>Save preferences</button></form><p>Reminders, corrections, replay alerts, push notifications and branch updates are not enabled in this slice.</p></section>`,m);
 });
 a.post('/account/preferences',async(req,reply)=>{protect(req,'preferences');const m=(await principal(req))!;const b=z.object({liveStart:z.literal('true').optional(),csrf:z.string()}).strict().parse(req.body);await setOptIn(m.id,b.liveStart==='true');return reply.code(303).header('Location','/account/preferences?saved=1').send();});
 a.get('/admin',async(req,reply)=>{
  const m=(await principal(req))!;
  const grants=(await pool.query('SELECT * FROM grants WHERE member_id=$1',[m.id])).rows;
  if(!grants.some(g=>g.permission==='program.read'))throw new DomainError('PERMISSION_DENIED',403);
  const programs=(await pool.query('SELECT * FROM programs WHERE organization_id=$1 ORDER BY local_date DESC LIMIT 20',[m.organization_id])).rows;
  const heartbeat=(await pool.query('SELECT max(seen_at) AS seen FROM worker_heartbeats')).rows[0].seen;
  const grant=grants.find(g=>g.permission==='engagement.read');
  let body=`<span class=eyebrow>Scoped administration</span><h1>Program control room</h1><p class=notice>MOCK YouTube · DRY-RUN WhatsApp · No real delivery or cost claims</p><section class=card><h2>Worker health</h2><p>Last heartbeat: ${date(heartbeat)}</p><p>${heartbeat&&Date.now()-new Date(heartbeat).getTime()<30000?'Worker heartbeat is recent.':'Worker heartbeat is stale or unavailable. Check the worker service.'}</p></section>`;
  for(const p of programs) {
   const streams=(await pool.query('SELECT sequence,video_id,reason,observed_at FROM stream_versions WHERE program_id=$1 ORDER BY sequence DESC',[p.id])).rows;
   const observations=(await pool.query('SELECT video_id,outcome,observed_at FROM mock_observations WHERE program_id=$1 ORDER BY id DESC LIMIT 5',[p.id])).rows;
   body+=`<section class=card><h2>${escapeHtml(p.title)}</h2><span class=pill>${label(p.state)}</span><p>Program revision ${p.revision} · Current stream revision ${p.current_sequence??'none'}</p><h3>Source decision history</h3>${streams.length?`<ul>${streams.map(s=>`<li>Revision ${s.sequence}: <code>${escapeHtml(s.video_id)}</code> — ${escapeHtml(s.reason)} · ${date(s.observed_at)}</li>`).join('')}</ul>`:'<p>No verified destination selected.</p>'}<h3>Recent watcher evidence</h3>${observations.length?`<ul>${observations.map(o=>`<li>${escapeHtml(o.video_id)} · ${label(o.outcome??'PENDING')} · ${date(o.observed_at)}</li>`).join('')}</ul>`:'<p>No observations received.</p>'}`;
   if(grant) {
    const rows=(await pool.query('SELECT c.member_id,c.assurance,c.first_opened_at FROM checkin_events c JOIN members m ON m.id=c.member_id WHERE c.organization_id=$1 AND c.program_id=$2 AND m.branch_id=$3 ORDER BY c.first_opened_at DESC LIMIT 50',[m.organization_id,p.id,grant.branch_id])).rows;
    body+=`<h3>Permitted branch link openings</h3><p>Fixed fictional branch membership only. Historical transfers are not implemented.</p>${rows.length?`<div class=scroll><table><caption>Live link openings — never verified attendance</caption><thead><tr><th scope=col>Fictional member</th><th scope=col>Identity evidence</th><th scope=col>First opened</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${escapeHtml(c.member_id)}</td><td>${label(c.assurance)}</td><td>${date(c.first_opened_at)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No link openings in your permitted branch.</p>'}`;
   }
   body+='</section>';
  }
  if(grants.some(g=>g.permission==='messaging.read'&&!g.branch_id)) {
   const budget=(await pool.query('SELECT * FROM budgets WHERE organization_id=$1',[m.organization_id])).rows[0];
   const states=(await pool.query('SELECT state,reason,count(*)::int AS total FROM notifications WHERE organization_id=$1 GROUP BY state,reason ORDER BY state',[m.organization_id])).rows;
   body+=`<section class=card><h2>Simulated delivery and budget</h2><p>${budget?`${escapeHtml(budget.reserved_units)} of ${escapeHtml(budget.cap_units)} TEST units reserved`:'No budget configured'}. These are fictional accounting units, not provider charges.</p>${states.length?`<ul>${states.map(s=>`<li>${s.total} · ${label(s.state)} · ${label(s.reason??'PENDING')}</li>`).join('')}</ul>`:'<p>No notifications prepared.</p>'}</section>`;
  }
  await pool.query("INSERT INTO audit_logs(actor,action,resource_id) VALUES($1,'control_room.read',$2)",[m.id,m.organization_id]);
  return html(reply,'Control room',body,m);
 });
}
