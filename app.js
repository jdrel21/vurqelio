/* Vurqelio — cod comun (landing + autentificare) */
const SUPABASE_URL = "https://dkljnpzclzeofwybqtnv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NEbiK4viL8ki_K-b-uv3vw_x9TPSV68";

const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function toast(text) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 3200);
}

function errText(err) {
  const m = err?.message || '';
  if (m.includes('Invalid login credentials')) return 'Email sau parolă greșită.';
  if (m.includes('User already registered')) return 'Există deja un cont cu acest email.';
  if (m.includes('Email not confirmed')) return 'Confirmă-ți emailul înainte de conectare.';
  return m || 'A apărut o eroare. Încearcă din nou.';
}

if ($('year')) $('year').textContent = new Date().getFullYear();

// Animații la scroll
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.15 })
  : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));

$('menuToggle')?.addEventListener('click', () => $('nav').classList.toggle('open'));

/* ===== MODAL AUTENTIFICARE (doar pe landing) ===== */
const backdrop = $('modalBackdrop');
if (backdrop) {
  const form = $('authForm');
  const message = $('formMessage');
  const submit = $('authSubmit');
  const nameInput = $('displayName');
  const tabs = [...document.querySelectorAll('[data-mode]')];
  let mode = 'signup';

  const setMode = next => {
    mode = next;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('nameLabel').style.display = mode === 'signup' ? '' : 'none';
    nameInput.required = mode === 'signup';
    $('authTitle').textContent = mode === 'signup' ? 'Bine ai venit.' : 'Bine ai revenit.';
    $('authSubtitle').textContent = mode === 'signup' ? 'Creează-ți contul.' : 'Conectează-te la contul tău.';
    submit.textContent = mode === 'signup' ? 'Creează cont →' : 'Conectare →';
    $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('forgotBtn').classList.toggle('hidden', mode !== 'login');
    message.textContent = '';
  };

  $('forgotBtn').addEventListener('click', async () => {
    const email = $('email').value.trim();
    if (!$('email').checkValidity() || !email) {
      message.className = 'form-msg err';
      message.textContent = 'Scrie emailul mai întâi, apoi apasă din nou.';
      return $('email').focus();
    }
    message.className = 'form-msg';
    message.textContent = 'Se trimite…';
    const redirectTo = new URL('reset.html', location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    message.className = error ? 'form-msg err' : 'form-msg ok';
    message.textContent = error ? errText(error) : 'Ți-am trimis un email cu linkul de resetare.';
  });
  const openModal = m => { setMode(m); backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false'); $('email').focus(); };
  const closeModal = () => { backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden', 'true'); };

  $('openLogin').addEventListener('click', () => openModal('login'));
  ['openSignup', 'heroSignup', 'rewardsSignup', 'bottomSignup'].forEach(id => $(id).addEventListener('click', () => openModal('signup')));
  $('closeModal').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => e.target === backdrop && closeModal());
  document.addEventListener('keydown', e => e.key === 'Escape' && closeModal());
  tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Za-z0-9]{8}$/.test(ref)) localStorage.setItem('vq_ref', ref.toUpperCase());
  if (location.search.includes('login')) openModal('login');
  else if (ref) {
    openModal('signup');
    $('authSubtitle').textContent = 'Ai fost invitat! Primești +100 VP după prima activitate.';
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    submit.disabled = true;
    message.className = 'form-msg';
    message.textContent = 'Se procesează…';
    try {
      if (!client) throw new Error('Supabase nu s-a încărcat. Verifică conexiunea.');
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email, password, options: { data: { display_name: nameInput.value.trim(), ref: localStorage.getItem('vq_ref') || '' } }
        });
        if (error) throw error;
        if (!data.session) {
          message.className = 'form-msg ok';
          message.textContent = 'Cont creat! Verifică emailul pentru confirmare.';
          return;
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      location.href = 'dashboard.html';
    } catch (err) {
      message.className = 'form-msg err';
      message.textContent = errText(err);
    } finally {
      submit.disabled = false;
    }
  });

  // Dacă ești deja conectat, arată linkul spre panou
  client?.auth.getSession().then(({ data }) => {
    if (!data.session) return;
    $('guestNav').classList.add('hidden');
    $('userNav').classList.remove('hidden');
  });
}
