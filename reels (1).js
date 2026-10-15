/* Vurqelio — feed de reels (YouTube Shorts + TikTok) */
let reelUser = null, reelBalance = 0, reelDone = new Set(), likes = new Map();
const feed = $('feed');
const live = new Map();

const setBal = () => ($('navBalance').textContent = `${reelBalance.toLocaleString('ro-RO')} VP`);
window.onAdReward = () => { reelBalance += 5; setBal(); };

function embedUrl({ p, id }) {
  return p === 'tiktok'
    ? `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0&description=0&music_info=0`
    : `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1`;
}

function reelHtml(r) {
  const m = mediaOf(r.video_url);
  return `<section class="reel" data-id="${r.id}" data-p="${m.p}" data-vid="${m.id}" data-dur="${r.duration_seconds}" data-pts="${r.points}" data-testid="reel-${r.id}">
    <div class="reel-media"></div>
    <div class="reel-info">
      ${r.campaign_id ? '<span class="tag spons">SPONSORIZAT</span>' : `<span class="tag">${m.p === 'tiktok' ? 'TIKTOK' : 'YOUTUBE SHORTS'}</span>`}
      <h2>${escapeHtml(r.title)}</h2>
      <p>${escapeHtml(r.description)}</p>
    </div>
    <div class="reel-action">
      <button class="like ${likes.get(r.id)?.liked ? 'on' : ''}" data-like="${r.id}" aria-label="Apreciază" data-testid="reel-like-${r.id}">♥<span>${likes.get(r.id)?.likes || 0}</span></button>
      <button class="like" data-comments="${r.id}" aria-label="Comentarii" data-testid="reel-comments-${r.id}">💬<span>${likes.get(r.id)?.comments || 0}</span></button>
      <div class="ring" style="--p:0"><span>+${r.points}</span></div>
      <button class="btn btn-lime reel-claim" disabled data-testid="reel-claim-${r.id}">Pregătire…</button>
    </div>
  </section>`;
}

function adHtml() {
  if (AD_MANAGER_REWARDED_UNIT) return `<section class="reel ad-slide"><div class="ad-card"><span class="tag">BONUS</span><h2>Vezi o reclamă scurtă</h2><p class="muted">+5 VP · maxim 10 pe zi</p><button class="btn btn-lime btn-xl" onclick="showRewardedAd()" data-testid="reel-ad-btn">Vezi reclama</button></div></section>`;
  if (OFFERWALLS.length) return `<section class="reel ad-slide"><div class="ad-card"><span class="tag">BONUS</span><h2>Vrei mai mulți VP?</h2><p class="muted">Completează oferte și sondaje.</p><a class="btn btn-lime btn-xl" href="dashboard.html#earn">Vezi ofertele</a></div></section>`;
  return '';
}

async function activate(el) {
  const st = { el, claimed: false };
  live.set(el, st);
  const media = { p: el.dataset.p, id: el.dataset.vid };
  el.querySelector('.reel-media').innerHTML = `<iframe src="${embedUrl(media)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Reel"></iframe>`;
  const btn = el.querySelector('.reel-claim');
  if (reelDone.has(el.dataset.id)) { btn.textContent = 'Deja revendicat ✓'; el.querySelector('.ring').style.setProperty('--p', 100); return; }
  try {
    st.session = await rpc('start_activity', { p_activity_id: el.dataset.id });
  } catch (e) { btn.textContent = e.message; return; }
  if (live.get(el) !== st) return;
  const dur = Number(el.dataset.dur), t0 = Date.now();
  st.timer = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    el.querySelector('.ring').style.setProperty('--p', Math.min(100, (s / dur) * 100));
    if (s < dur) { btn.textContent = `Urmărește încă ${Math.ceil(dur - s)}s`; return; }
    clearInterval(st.timer);
    btn.disabled = false;
    btn.textContent = `Revendică +${el.dataset.pts} VP`;
    btn.classList.add('claim');
  }, 250);
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const pts = await rpc('complete_activity', { p_session_id: st.session });
      reelDone.add(el.dataset.id);
      reelBalance += pts; setBal();
      btn.textContent = 'Revendicat ✓';
      btn.classList.remove('claim');
      toast(`+${pts} VP!`);
    } catch (e) { toast(e.message); btn.disabled = false; }
  };
}

function deactivate(el) {
  const st = live.get(el);
  if (!st) return;
  clearInterval(st.timer);
  live.delete(el);
  el.querySelector('.reel-media').innerHTML = '';
  const btn = el.querySelector('.reel-claim');
  btn.onclick = null;
  btn.disabled = true;
  btn.classList.remove('claim');
  if (!reelDone.has(el.dataset.id)) { btn.textContent = 'Pregătire…'; el.querySelector('.ring').style.setProperty('--p', 0); }
}

/* ===== COMENTARII ===== */
let openReel = null;
const ago = d => {
  const s = (Date.now() - new Date(d)) / 1000;
  return s < 60 ? 'acum' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} z`;
};
const initial = n => escapeHtml((n || 'V').trim().charAt(0).toUpperCase());

async function loadComments() {
  const list = $('commentList');
  list.innerHTML = '<p class="muted small">Se încarcă…</p>';
  const { data, error } = await client.rpc('get_comments', { p_activity_id: openReel });
  if (error) { list.innerHTML = `<p class="muted small">${escapeHtml(error.message)}</p>`; return; }
  $('sheetTitle').textContent = `Comentarii · ${data.length}`;
  list.innerHTML = data.length ? data.map(c => `<div class="comment">
    <span class="av sm ${c.avatar_frame ? 'frame-' + escapeHtml(c.avatar_frame) : ''}">${initial(c.display_name)}</span>
    <div><strong>${escapeHtml(c.display_name)} <small>${ago(c.created_at)}</small></strong><p>${escapeHtml(c.body)}</p></div>
    ${c.is_mine ? `<button class="link" data-del="${c.id}" aria-label="Șterge">Șterge</button>` : ''}</div>`).join('')
    : '<div class="empty"><span>💬</span><strong>Niciun comentariu încă.</strong><small>Fii primul!</small></div>';
}

function setCommentCount(delta) {
  const cur = likes.get(openReel) || { likes: 0, liked: false, comments: 0 };
  cur.comments = Math.max(0, cur.comments + delta);
  likes.set(openReel, cur);
  const b = feed.querySelector(`[data-comments="${openReel}"] span`);
  if (b) b.textContent = cur.comments;
}

function closeSheet() { $('sheet').classList.remove('open'); $('sheet').setAttribute('aria-hidden', 'true'); openReel = null; }
$('sheetClose').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', async e => {
  if (e.target === $('sheet')) return closeSheet();
  const del = e.target.closest('[data-del]');
  if (!del || !confirm('Ștergi comentariul?')) return;
  const { error } = await client.rpc('delete_comment', { p_id: del.dataset.del });
  if (error) return toast(error.message);
  setCommentCount(-1);
  loadComments();
});
$('commentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('commentInput');
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  const { error } = await client.rpc('add_comment', { p_activity_id: openReel, p_body: input.value });
  btn.disabled = false;
  if (error) return toast(error.message);
  input.value = '';
  setCommentCount(1);
  loadComments();
});

feed.addEventListener('click', async e => {
  const cb = e.target.closest('[data-comments]');
  if (cb) {
    openReel = cb.dataset.comments;
    $('sheet').classList.add('open');
    $('sheet').setAttribute('aria-hidden', 'false');
    return loadComments();
  }
  const b = e.target.closest('[data-like]');
  if (!b || b.disabled) return;
  const id = b.dataset.like;
  const cur = likes.get(id) || { likes: 0, liked: false, comments: 0 };
  const next = { ...cur, likes: cur.likes + (cur.liked ? -1 : 1), liked: !cur.liked };
  likes.set(id, next);
  b.classList.toggle('on', next.liked);
  b.querySelector('span').textContent = next.likes;
  b.disabled = true;
  const q = client.from('reel_likes');
  const { error } = cur.liked ? await q.delete().eq('user_id', reelUser.id).eq('activity_id', id) : await q.insert({ user_id: reelUser.id, activity_id: id });
  b.disabled = false;
  if (error) {
    likes.set(id, cur);
    b.classList.toggle('on', cur.liked);
    b.querySelector('span').textContent = cur.likes;
    toast('Nu am putut salva aprecierea.');
  }
});

const reelError = msg => (feed.innerHTML = `<section class="reel"><div class="ad-card"><span class="tag">EROARE</span><h2>Reels nu s-au încărcat.</h2><p class="muted">${escapeHtml(msg)}</p><button class="btn btn-lime" onclick="location.reload()">Reîncearcă</button><a class="btn btn-line" href="dashboard.html">Înapoi la panou</a></div></section>`);

(async () => {
  if (!client) return reelError('Biblioteca Supabase este blocată sau nu s-a încărcat. Dezactivează blocarea (ex. Brave Shields) pentru acest site.');
  const { data } = await client.auth.getSession();
  if (!data.session) return location.replace('index.html?login');
  reelUser = data.session.user;
  const [a, l, lk] = await Promise.all([
    client.from('activities').select('id, title, description, points, video_url, duration_seconds, campaign_id').eq('status', 'active').eq('kind', 'reel').order('created_at', { ascending: false }),
    client.from('point_ledger').select('amount, activity_id, provider_event_id').eq('user_id', reelUser.id),
    client.rpc('get_reel_likes')
  ]);
  (lk.data || []).forEach(x => likes.set(x.activity_id, { likes: Number(x.likes), liked: x.liked, comments: Number(x.comments) }));
  if (a.error) return reelError(`Eroare bază de date: ${a.error.message}. Ai rulat ultima versiune a schema.sql?`);
  const ledger = l.data || [];
  reelBalance = ledger.reduce((s, x) => s + x.amount, 0); setBal();
  reelDone = new Set(ledger.filter(x => x.activity_id && x.provider_event_id?.startsWith('activity:')).map(x => x.activity_id));
  const reels = (a.data || []).filter(r => mediaOf(r.video_url))
    .sort((x, y) => reelDone.has(x.id) - reelDone.has(y.id) || !!y.campaign_id - !!x.campaign_id
      || (likes.get(y.id)?.likes || 0) - (likes.get(x.id)?.likes || 0));

  if (!reels.length) {
    feed.innerHTML = `<section class="reel"><div class="ad-card"><span class="tag">REELS</span><h2>Niciun reel încă.</h2><p class="muted">Revino curând.</p><a class="btn btn-lime" href="dashboard.html">Înapoi la panou</a></div></section>`;
    return;
  }
  feed.innerHTML = reels.map((r, i) => reelHtml(r) + ((i + 1) % 5 === 0 ? adHtml() : '')).join('');
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? activate(e.target) : deactivate(e.target)), { threshold: 0.6 });
  feed.querySelectorAll('.reel[data-id]').forEach(el => io.observe(el));
})().catch(e => { console.error(e); reelError(e.message || 'Eroare necunoscută.'); });
