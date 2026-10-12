/* Vurqelio — panoul utilizatorului */
const state = { user: null, profile: null, ledger: [], activities: [], badges: [], myBadges: [], rewards: [], redemptions: [], challenges: [], referral: {}, loaded: false, period: 'week' };
const avatar = (name, frame, cls = '') => `<span class="av ${cls} ${frame ? 'frame-' + escapeHtml(frame) : ''}">${escapeHtml((name || 'V').trim().charAt(0).toUpperCase())}</span>`;
const dayStr = offset => new Date(Date.now() + offset * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
const fmt = n => Number(n || 0).toLocaleString('ro-RO');
const date = d => new Date(d).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const empty = (icon, title, sub) => `<div class="empty"><span>${icon}</span><strong>${title}</strong><small>${sub}</small></div>`;
const levelOf = earned => Math.floor(Math.sqrt(earned / 100)) + 1;
const levelFloor = lvl => 100 * (lvl - 1) ** 2;

function ytId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
    return m ? m[2] : null;
  } catch { return null; }
}

async function rpc(name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

/* ===== ÎNCĂRCARE DATE ===== */
async function load() {
  const uid = state.user.id;
  if (!state.loaded) await client.rpc('finalize_seasons');
  const [p, l, a, b, ub, r, rd, ch, rf] = await Promise.all([
    client.from('profiles').select('display_name, is_admin, current_streak, longest_streak, last_checkin, avatar_frame').eq('id', uid).maybeSingle(),
    client.from('point_ledger').select('id, amount, reason, activity_id, provider_event_id, created_at').eq('user_id', uid).order('created_at', { ascending: false }),
    client.from('activities').select('*').order('created_at', { ascending: false }),
    client.from('badges').select('*').order('sort'),
    client.from('user_badges').select('badge_code, earned_at').eq('user_id', uid),
    client.from('rewards').select('*').order('cost'),
    client.from('redemptions').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    client.rpc('get_challenges'),
    client.rpc('get_referral_stats')
  ]);
  const failed = [p, l, a, b, ub, r, rd, ch].find(x => x.error);
  if (failed) {
    console.error(failed.error);
    toast('Unele date nu s-au încărcat. Ai rulat schema.sql actualizată?');
  }
  const had = new Set(state.myBadges.map(x => x.badge_code));
  const fresh = (ub.data || []).filter(x => !had.has(x.badge_code));
  Object.assign(state, {
    profile: p.data || {}, ledger: l.data || [], activities: a.data || [], badges: b.data || [],
    myBadges: ub.data || [], rewards: r.data || [], redemptions: rd.data || [], challenges: ch.data || [], referral: rf.data || {}
  });
  render();
  if (state.loaded && fresh.length) {
    const names = fresh.map(f => state.badges.find(b => b.code === f.badge_code)?.name).filter(Boolean);
    confetti();
    setTimeout(() => toast(`Insignă nouă: ${names.join(', ')} ✦`), 1800);
  }
  state.loaded = true;
}

/* ===== RANDARE ===== */
function render() {
  const { user, profile, ledger, activities } = state;
  const balance = ledger.reduce((s, x) => s + x.amount, 0);
  const earned = ledger.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const lvl = levelOf(earned);
  const lo = levelFloor(lvl), hi = levelFloor(lvl + 1);
  const today = dayStr(0);
  const claimed = profile.last_checkin === today;
  const continues = profile.last_checkin === dayStr(-1);
  const name = profile.display_name || user.email.split('@')[0];

  $('userName').textContent = name;
  $('myAvatar').outerHTML = avatar(name, profile.avatar_frame, 'xl').replace('<span', '<span id="myAvatar" data-testid="my-avatar"');
  $('userEmail').textContent = user.email;
  $('levelTag').textContent = `NIVEL ${lvl}${profile.is_admin ? ' · ADMIN' : ''}`;
  $('balance').textContent = fmt(balance);
  $('navBalance').textContent = `${fmt(balance)} VP`;
  $('level').textContent = lvl;
  $('levelBar').style.width = `${((earned - lo) / (hi - lo)) * 100}%`;
  $('levelText').textContent = `${fmt(earned)} / ${fmt(hi)} VP până la nivelul ${lvl + 1}`;
  $('streakCount').textContent = profile.current_streak || 0;
  $('dailyBtn').disabled = claimed;
  $('dailyBtn').textContent = claimed ? 'Revino mâine ✓' : `Bonus zilnic +${10 + Math.min(continues ? profile.current_streak : 0, 6) * 5}`;
  renderBanner(profile, claimed, continues);
  $('doneCount').textContent = ledger.filter(x => x.provider_event_id?.startsWith('activity:')).length;
  $('badgeCount').textContent = state.myBadges.length;
  $('badgeTotal').textContent = `din ${state.badges.length}`;
  $('adminTab').classList.toggle('hidden', !profile.is_admin);

  renderActivities(activities.filter(a => a.status === 'active'));
  renderShop(balance);
  renderBadges();
  renderHistory();
  renderChallenges();
  renderProfile(name);
  if (profile.is_admin) renderAdmin();
  $('loading').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
}

function renderBanner(profile, claimed, continues) {
  const el = $('streakBanner');
  const streak = profile.current_streak || 0;
  let html = '';
  if (!claimed && continues && streak > 0) {
    const h = 23 - Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Bucharest' }));
    html = `<span class="b-fire">🔥</span><div><strong>Streak-ul tău de ${streak} ${streak === 1 ? 'zi' : 'zile'} e în pericol!</strong><small>Mai ai ${h > 0 ? `aproximativ ${h} ${h === 1 ? 'oră' : 'ore'}` : 'sub o oră'} până la miezul nopții ca să-l păstrezi.</small></div>`;
  } else if (!claimed && streak > 0 && profile.last_checkin) {
    html = `<span class="b-fire">◌</span><div><strong>Ai pierdut streak-ul de ${streak} ${streak === 1 ? 'zi' : 'zile'}.</strong><small>Nicio problemă — revendică bonusul de azi și începe unul nou.</small></div>`;
  } else if (!claimed && !profile.last_checkin) {
    html = `<span class="b-fire">✦</span><div><strong>Începe primul tău streak!</strong><small>Revendică bonusul zilnic și revino mâine pentru mai multe puncte.</small></div>`;
  }
  el.classList.toggle('hidden', !html);
  el.classList.toggle('warn', continues && !claimed);
  if (html) el.innerHTML = `${html}<button class="btn btn-ink" data-daily data-testid="banner-claim-btn">Revendică acum</button>`;
}

function renderChallenges() {
  const list = state.challenges;
  if (list[0]) {
    const days = Math.ceil((new Date(list[0].week_end) - Date.now()) / 864e5);
    $('weekEnd').textContent = `Provocările se resetează în ${days} ${days === 1 ? 'zi' : 'zile'} (luni).`;
  }
  $('challenges').innerHTML = list.length ? list.map(c => {
    const pct = Math.min(100, (Number(c.progress) / c.target) * 100);
    const ready = Number(c.progress) >= c.target;
    return `<article class="card challenge ${c.claimed ? 'done' : ''}" data-testid="challenge-${c.id}">
      <div class="r-top"><span class="tag">PROVOCARE</span><span class="pill lime">+${c.reward} VP</span></div>
      <h3>${escapeHtml(c.title)}</h3><p class="muted">${escapeHtml(c.description)}</p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="r-foot"><span class="mono">${fmt(Math.min(c.progress, c.target))} / ${fmt(c.target)}</span>
      ${c.claimed ? '<button class="btn btn-line" disabled>Revendicată ✓</button>'
        : `<button class="btn ${ready ? 'btn-lime' : 'btn-line'} challenge-btn" data-id="${c.id}" ${ready ? '' : 'disabled'} data-testid="challenge-claim-${c.id}">${ready ? 'Revendică' : 'În progres'}</button>`}</div>
    </article>`;
  }).join('') : empty('◎', 'Nicio provocare activă.', 'Revino săptămâna viitoare.');
}

function renderProfile(name) {
  const rf = state.referral;
  if (rf.code) $('refLink').value = new URL(`index.html?ref=${rf.code}`, location.href).href;
  $('refInvited').textContent = rf.invited || 0;
  $('refRewarded').textContent = rf.rewarded || 0;
  if (document.activeElement !== $('nameInput')) $('nameInput').value = state.profile.display_name || '';
  const owned = new Set(state.redemptions.filter(r => r.status !== 'rejected').map(r => r.reward_id));
  const frames = state.rewards.filter(r => r.kind === 'frame');
  const cur = state.profile.avatar_frame;
  $('frames').innerHTML = `<div class="frame-opt ${!cur ? 'sel' : ''}">${avatar(name, null, 'lg')}<small>Fără ramă</small>
      <button class="btn btn-line sm frame-btn" data-frame="" ${!cur ? 'disabled' : ''} data-testid="frame-none">${!cur ? 'Folosită' : 'Folosește'}</button></div>` +
    frames.map(f => {
      const has = owned.has(f.id);
      const on = cur === f.meta;
      return `<div class="frame-opt ${on ? 'sel' : ''} ${has ? '' : 'locked'}">${avatar(name, f.meta, 'lg')}<small>${escapeHtml(f.title)}</small>
        ${has ? `<button class="btn ${on ? 'btn-line' : 'btn-lime'} sm frame-btn" data-frame="${escapeHtml(f.meta)}" ${on ? 'disabled' : ''} data-testid="frame-${escapeHtml(f.meta)}">${on ? 'Folosită' : 'Folosește'}</button>`
          : `<button class="btn btn-line sm" data-goto="shop">🔒 ${fmt(f.cost)} VP</button>`}</div>`;
    }).join('');
}

function renderActivities(list) {
  const done = new Set(state.ledger.filter(x => x.activity_id && x.provider_event_id?.startsWith('activity:')).map(x => x.activity_id));
  $('activities').innerHTML = list.length ? list.map(a => {
    const id = ytId(a.video_url);
    const isDone = done.has(a.id);
    const mins = Math.max(1, Math.round((a.duration_seconds || 0) / 60));
    return `<article class="card act ${isDone ? 'done' : ''}" data-testid="activity-card-${a.id}">
      <div class="thumb" id="player-${a.id}">${id ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy">` : ''}<span class="play">▶</span></div>
      <div class="act-body">
        <div class="meta"><span class="pill lime">+${a.points} VP</span><span class="muted">${mins} min · ${escapeHtml(a.provider || 'Vurqelio')}</span></div>
        <h3>${escapeHtml(a.title)}</h3><p class="muted">${escapeHtml(a.description)}</p>
        ${isDone ? '<button class="btn btn-line full" disabled>Finalizată ✓</button>'
          : id ? `<button class="btn btn-lime full act-btn" data-id="${a.id}" data-yt="${id}" data-testid="activity-start-${a.id}">Începe</button>`
          : '<button class="btn btn-line full" disabled>Link video invalid</button>'}
      </div></article>`;
  }).join('') : empty('◌', 'Nu sunt activități active.', 'Revino curând — apar aici imediat ce sunt publicate.');
}

function renderShop(balance) {
  $('shop').innerHTML = state.rewards.filter(r => r.active).length ? state.rewards.filter(r => r.active).map(r => {
    const out = r.stock !== null && r.stock <= 0;
    const owned = r.kind === 'frame' && state.redemptions.some(d => d.reward_id === r.id && d.status !== 'rejected');
    const can = balance >= r.cost && !out && !owned;
    return `<article class="card reward">
      <div class="r-top"><span class="tag">RECOMPENSĂ</span>${r.stock !== null ? `<span class="muted">stoc ${r.stock}</span>` : ''}</div>
      <h3>${escapeHtml(r.title)}</h3><p class="muted">${escapeHtml(r.description)}</p>
      <div class="r-foot"><strong>${fmt(r.cost)} <span>VP</span></strong>
      <button class="btn ${can ? 'btn-lime' : 'btn-line'} redeem-btn" data-id="${r.id}" ${can ? '' : 'disabled'} data-testid="redeem-${r.id}">${owned ? 'Deținută ✓' : out ? 'Epuizat' : can ? 'Revendică' : `Îți lipsesc ${fmt(r.cost - balance)}`}</button></div>
    </article>`;
  }).join('') : empty('★', 'Magazinul e gol.', 'Recompensele vor apărea aici.');

  const label = { pending: 'În așteptare', fulfilled: 'Livrată', rejected: 'Respinsă (rambursată)' };
  $('myRedemptions').innerHTML = state.redemptions.length ? state.redemptions.map(r =>
    `<div class="item"><div><strong>${escapeHtml(r.reward_title)}</strong><small>${date(r.created_at)}</small></div><span class="status ${r.status}">${label[r.status]}</span></div>`
  ).join('') : empty('◌', 'Nicio cerere încă.', 'Revendică o recompensă din magazin.');
}

function renderBadges() {
  const mine = new Map(state.myBadges.map(b => [b.badge_code, b.earned_at]));
  $('badges').innerHTML = state.badges.map(b => `<div class="badge ${mine.has(b.code) ? 'got' : ''}" data-testid="badge-${b.code}">
    <span class="b-ic">${b.icon}</span><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.description)}</small>
    <em>${mine.has(b.code) ? 'Obținută ' + new Date(mine.get(b.code)).toLocaleDateString('ro-RO') : 'Blocată'}</em></div>`).join('');
}

function renderHistory() {
  $('history').innerHTML = state.ledger.length ? state.ledger.slice(0, 50).map(x =>
    `<div class="item"><div><strong>${escapeHtml(x.reason)}</strong><small>${date(x.created_at)}</small></div><b class="${x.amount >= 0 ? 'pos' : 'neg'}">${x.amount >= 0 ? '+' : ''}${fmt(x.amount)} VP</b></div>`
  ).join('') : empty('✦', 'Nicio tranzacție încă.', 'Revendică bonusul zilnic ca să începi.');
}

async function renderBoard() {
  $('board').innerHTML = '<li class="muted">Se încarcă…</li>';
  const now = new Date();
  const left = Math.ceil((new Date(now.getFullYear(), now.getMonth() + 1, 1) - now) / 864e5);
  $('seasonInfo').textContent = state.period === 'month'
    ? `Sezonul ${now.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })} se încheie în ${left} ${left === 1 ? 'zi' : 'zile'}. Top 3 primesc 500 / 300 / 150 VP + insignă.`
    : '';
  renderSeasons();
  try {
    const rows = await rpc('get_leaderboard', { p_period: state.period });
    $('board').innerHTML = rows.length ? rows.map(r => `<li class="${r.is_me ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}">
      <b>${String(r.rank).padStart(2, '0')}</b><span class="lb-name">${avatar(r.display_name, r.avatar_frame, 'sm')}${escapeHtml(r.display_name)}${r.is_me ? ' (tu)' : ''}</span><strong>${fmt(r.points)} VP</strong></li>`).join('')
      : empty('#', 'Clasamentul e gol.', 'Fii primul care câștigă puncte.');
  } catch (e) { $('board').innerHTML = empty('!', 'Clasamentul nu a putut fi încărcat.', escapeHtml(e.message)); }
}

async function renderSeasons() {
  try {
    const rows = await rpc('get_season_winners');
    const by = rows.reduce((m, r) => ((m[r.season] ||= []).push(r), m), {});
    const medal = ['', '♛', '♜', '♞'];
    $('seasons').innerHTML = Object.keys(by).length ? Object.entries(by).map(([season, list]) => `<div class="card season">
      <span class="tag">${new Date(season).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
      ${list.map(r => `<div class="podium p${r.rank} ${r.is_me ? 'me' : ''}"><b>${medal[r.rank]}</b>${avatar(r.display_name, r.avatar_frame, 'sm')}<span>${escapeHtml(r.display_name)}</span><small>${fmt(r.points)} VP</small></div>`).join('')}
    </div>`).join('') : empty('♛', 'Încă niciun sezon încheiat.', 'Primii campioni vor fi anunțați la începutul lunii viitoare.');
  } catch (e) { $('seasons').innerHTML = ''; }
}

/* ===== CONFETTI ===== */
function confetti() {
  const c = $('confetti'), ctx = c.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#c8f031', '#ff6b4a', '#f1eee4', '#f2c14e'];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4,
    s: Math.random() * 6 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[Math.random() * 4 | 0]
  }));
  const end = performance.now() + 2200;
  (function tick(t) {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    });
    if (t < end) requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height);
  })(performance.now());
}

/* ===== ADMIN ===== */
async function renderAdmin() {
  const { data: chs } = await client.from('challenges').select('*').order('sort');
  state.adminChallenges = chs || [];
  const metric = { activities: 'activități', daily: 'zile bonus', earned: 'VP câștigați' };
  $('adminChallenges').innerHTML = state.adminChallenges.length ? state.adminChallenges.map(c => `<div class="item">
    <div><strong>${escapeHtml(c.title)}</strong><small>${c.target} ${metric[c.metric]} → +${c.reward} VP · ${c.active ? 'activă' : 'ascunsă'}</small></div>
    <div class="row"><button class="btn btn-line sm" data-act="edit-challenge" data-id="${c.id}">Editează</button>
    <button class="btn btn-line sm" data-act="toggle-challenge" data-id="${c.id}" data-active="${c.active}">${c.active ? 'Ascunde' : 'Activează'}</button>
    <button class="btn btn-line sm danger" data-act="del-challenge" data-id="${c.id}">Șterge</button></div></div>`).join('') : empty('◎', 'Nicio provocare.', 'Adaug-o din formular.');

  $('adminActivities').innerHTML = state.activities.length ? state.activities.map(a => `<div class="item">
    <div><strong>${escapeHtml(a.title)}</strong><small>${a.points} VP · ${a.duration_seconds}s · ${a.status}</small></div>
    <div class="row"><button class="btn btn-line sm" data-act="toggle" data-id="${a.id}" data-status="${a.status}">${a.status === 'active' ? 'Pauză' : 'Activează'}</button>
    <button class="btn btn-line sm danger" data-act="del-activity" data-id="${a.id}">Șterge</button></div></div>`).join('') : empty('◌', 'Nicio activitate.', 'Adaug-o din formular.');

  $('adminRewards').innerHTML = state.rewards.length ? state.rewards.map(r => `<div class="item">
    <div><strong>${escapeHtml(r.title)}</strong><small>${r.cost} VP · stoc ${r.stock ?? '∞'} · ${r.active ? 'activă' : 'ascunsă'}</small></div>
    <div class="row"><button class="btn btn-line sm" data-act="toggle-reward" data-id="${r.id}" data-active="${r.active}">${r.active ? 'Ascunde' : 'Afișează'}</button>
    <button class="btn btn-line sm danger" data-act="del-reward" data-id="${r.id}">Șterge</button></div></div>`).join('') : empty('★', 'Nicio recompensă.', '');

  try {
    const reds = await rpc('admin_list_redemptions');
    $('adminRedemptions').innerHTML = reds.length ? reds.map(r => `<div class="item">
      <div><strong>${escapeHtml(r.display_name)} → ${escapeHtml(r.reward_title)}</strong><small>${r.cost} VP · ${date(r.created_at)}</small></div>
      ${r.status === 'pending' ? `<div class="row"><button class="btn btn-lime sm" data-act="fulfil" data-id="${r.id}">Livrează</button><button class="btn btn-line sm danger" data-act="reject" data-id="${r.id}">Respinge</button></div>` : `<span class="status ${r.status}">${r.status}</span>`}</div>`).join('') : empty('◌', 'Nicio cerere.', '');
  } catch (e) { console.error(e); }
}

async function adminAction(btn) {
  const { act, id } = btn.dataset;
  if (act === 'edit-challenge') return editChallenge(id);
  if (act.startsWith('del') && !confirm('Sigur ștergi?')) return;
  btn.disabled = true;
  try {
    const q = {
      'toggle': () => client.from('activities').update({ status: btn.dataset.status === 'active' ? 'paused' : 'active' }).eq('id', id),
      'del-activity': () => client.from('activities').delete().eq('id', id),
      'toggle-reward': () => client.from('rewards').update({ active: btn.dataset.active !== 'true' }).eq('id', id),
      'del-reward': () => client.from('rewards').delete().eq('id', id),
      'toggle-challenge': () => client.from('challenges').update({ active: btn.dataset.active !== 'true' }).eq('id', id),
      'del-challenge': () => client.from('challenges').delete().eq('id', id),
      'fulfil': () => client.rpc('admin_update_redemption', { p_id: id, p_status: 'fulfilled' }),
      'reject': () => client.rpc('admin_update_redemption', { p_id: id, p_status: 'rejected' })
    }[act];
    const { error } = await q();
    if (error) throw error;
    toast('Salvat.');
    await load();
  } catch (e) { toast(e.message); btn.disabled = false; }
}

function editChallenge(id) {
  const c = state.adminChallenges.find(x => x.id === id);
  const f = $('challengeForm');
  ['id', 'title', 'description', 'metric', 'target', 'reward', 'sort'].forEach(k => f.elements[k].value = c[k] ?? '');
  $('challengeFormTitle').textContent = 'Editează provocarea';
  $('cancelChallenge').classList.remove('hidden');
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetChallengeForm() {
  $('challengeForm').reset();
  $('challengeForm').elements.id.value = '';
  $('challengeFormTitle').textContent = 'Provocare nouă';
  $('cancelChallenge').classList.add('hidden');
}

$('cancelChallenge').addEventListener('click', resetChallengeForm);
$('challengeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { id, ...d } = formData(e.target);
  const q = client.from('challenges');
  const { error } = id ? await q.update(d).eq('id', id) : await q.insert(d);
  if (error) return toast(error.message);
  toast(id ? 'Provocare actualizată.' : 'Provocare adăugată.');
  resetChallengeForm();
  load();
});

$('copyRef').addEventListener('click', async () => {
  const link = $('refLink').value;
  try { await navigator.clipboard.writeText(link); } catch { $('refLink').select(); document.execCommand('copy'); }
  toast('Link copiat! Trimite-l prietenilor.');
  if (navigator.share) navigator.share({ title: 'Vurqelio', text: 'Hai pe Vurqelio — primim amândoi +100 VP!', url: link }).catch(() => {});
});

function formData(form) {
  const d = Object.fromEntries(new FormData(form));
  ['points', 'duration_seconds', 'cost', 'target', 'reward', 'sort'].forEach(k => k in d && (d[k] = Number(d[k])));
  if ('stock' in d) d.stock = d.stock === '' ? null : Number(d.stock);
  return d;
}

/* ===== ACTIVITATE: YOUTUBE + VALIDARE SERVER ===== */
let ytReady = null;
function loadYT() {
  return ytReady ||= new Promise(res => {
    if (window.YT?.Player) return res();
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
}

async function startActivity(btn) {
  const { id, yt } = btn.dataset;
  btn.disabled = true;
  btn.textContent = 'Se pornește…';
  try {
    const sessionId = await rpc('start_activity', { p_activity_id: id });
    await loadYT();
    const box = $(`player-${id}`);
    box.innerHTML = `<div id="yt-${id}"></div>`;
    box.classList.add('playing');
    btn.textContent = 'Urmărește până la final…';
    new YT.Player(`yt-${id}`, {
      videoId: yt,
      playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onStateChange: e => {
          if (e.data !== YT.PlayerState.ENDED) return;
          btn.disabled = false;
          btn.textContent = 'Revendică punctele';
          btn.classList.add('claim');
          btn.dataset.session = sessionId;
        }
      }
    });
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = 'Începe';
  }
}

async function claimActivity(btn) {
  btn.disabled = true;
  btn.textContent = 'Se verifică…';
  try {
    const pts = await rpc('complete_activity', { p_session_id: btn.dataset.session });
    toast(`+${pts} VP adăugate!`);
    await load();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = 'Revendică punctele';
  }
}

/* ===== EVENIMENTE ===== */
document.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.goto) return document.querySelector(`[data-tab="${t.dataset.goto}"]`).click();
  if ('daily' in t.dataset) return $('dailyBtn').click();
  if (t.classList.contains('challenge-btn')) {
    t.disabled = true;
    try { const pts = await rpc('claim_challenge', { p_id: t.dataset.id }); confetti(); toast(`Provocare finalizată! +${pts} VP`); await load(); }
    catch (err) { toast(err.message); t.disabled = false; }
    return;
  }
  if (t.classList.contains('frame-btn')) {
    t.disabled = true;
    try { await rpc('set_avatar_frame', { p_frame: t.dataset.frame || null }); toast('Ramă actualizată.'); await load(); }
    catch (err) { toast(err.message); t.disabled = false; }
    return;
  }
  if (t.dataset.tab) {
    document.querySelectorAll('#dtabs button').forEach(b => b.classList.toggle('active', b === t));
    document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab));
    if (t.dataset.tab === 'leaderboard') renderBoard();
  } else if (t.dataset.period) {
    state.period = t.dataset.period;
    document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b === t));
    renderBoard();
  } else if (t.classList.contains('act-btn')) {
    t.dataset.session ? claimActivity(t) : startActivity(t);
  } else if (t.classList.contains('redeem-btn')) {
    if (!confirm('Confirmi schimbul de puncte?')) return;
    t.disabled = true;
    try { await rpc('redeem_reward', { p_reward_id: t.dataset.id }); toast('Recompensă revendicată!'); await load(); }
    catch (err) { toast(err.message); t.disabled = false; }
  } else if (t.dataset.act) {
    adminAction(t);
  }
});

$('dailyBtn').addEventListener('click', async () => {
  $('dailyBtn').disabled = true;
  try {
    const r = await rpc('claim_daily');
    toast(`+${r.points} VP · streak ${r.streak} ${r.streak === 1 ? 'zi' : 'zile'} 🔥`);
    await load();
  } catch (e) { toast(e.message); $('dailyBtn').disabled = false; }
});

['activityForm', 'rewardForm'].forEach(fid => $(fid).addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const d = formData(form);
  if (fid === 'activityForm' && !ytId(d.video_url)) return toast('Link YouTube invalid.');
  const { error } = await client.from(fid === 'activityForm' ? 'activities' : 'rewards').insert(d);
  if (error) return toast(error.message);
  form.reset();
  toast('Adăugat!');
  load();
}));

$('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const display_name = $('nameInput').value.trim();
  if (display_name.length < 2) return toast('Numele trebuie să aibă cel puțin 2 caractere.');
  const { error } = await client.from('profiles').update({ display_name }).eq('id', state.user.id);
  if (error) return toast(error.message);
  toast('Nume salvat.');
  load();
});

$('logoutButton').addEventListener('click', async () => {
  await client.auth.signOut();
  location.href = 'index.html';
});

(async () => {
  if (!client) return toast('Supabase nu s-a încărcat.');
  const { data } = await client.auth.getSession();
  if (!data.session) return location.replace('index.html?login');
  state.user = data.session.user;
  load();
})();
