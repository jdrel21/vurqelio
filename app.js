/* Vurqelio prototype. Never put a Supabase service_role key in browser code. */
const SUPABASE_URL = "https://dkljnpzclzeofwybqtnv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NEbiK4viL8ki_K-b-uv3vw_x9TPSV68";
const client = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const backdrop = document.getElementById('modalBackdrop');
const form = document.getElementById('authForm');
const message = document.getElementById('formMessage');
const title = document.getElementById('authTitle');
const subtitle = document.getElementById('authSubtitle');
const submit = document.getElementById('authSubmit');
const nameLabel = document.getElementById('nameLabel');
const nameInput = document.getElementById('displayName');
const tabs = [...document.querySelectorAll('[data-mode]')];
let mode = 'signup';

document.getElementById('year').textContent = new Date().getFullYear();

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}
function openModal(nextMode='signup') {
  setMode(nextMode);
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden','false');
}
function closeModal() {
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden','true');
  message.textContent = '';
}
function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  nameLabel.style.display = mode === 'signup' ? 'block' : 'none';
  nameInput.required = mode === 'signup';
  title.textContent = mode === 'signup' ? 'Bine ai venit.' : 'Bine ai revenit.';
  subtitle.textContent = mode === 'signup' ? 'Creează-ți contul pentru a testa panoul.' : 'Conectează-te la contul tău.';
  submit.innerHTML = mode === 'signup' ? 'Creează cont <span>→</span>' : 'Conectare <span>→</span>';
  document.getElementById('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  message.textContent = '';
}
['openLogin'].forEach(id => document.getElementById(id).addEventListener('click', () => openModal('login')));
['openSignup','heroSignup','rewardsSignup','bottomSignup'].forEach(id => document.getElementById(id).addEventListener('click', () => openModal('signup')));
document.getElementById('closeModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
document.getElementById('menuToggle').addEventListener('click', () => document.querySelector('.nav').classList.toggle('mobile-open'));

form.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const displayName = nameInput.value.trim();
  submit.disabled = true;
  message.textContent = 'Se procesează…';
  try {
    if (client) {
      if (mode === 'signup') {
        const { error } = await client.auth.signUp({
          email, password, options: { data: { display_name: displayName } }
        });
        if (error) throw error;
        message.textContent = 'Contul a fost trimis spre creare. Verifică emailul pentru confirmare, dacă este activată.';
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        message.textContent = 'Conectare reușită. Panoul complet va fi următoarea etapă.';
      }
    } else {
      // Local-only demo; this does NOT create a secure account or store a password.
      if (mode === 'signup') {
        const demo = { email, displayName, createdAt: new Date().toISOString() };
        localStorage.setItem('vurqelio_demo_user', JSON.stringify(demo));
        message.textContent = 'Cont demonstrativ creat pe acest dispozitiv. Pentru conturi reale trebuie configurat Supabase.';
      } else {
        const saved = JSON.parse(localStorage.getItem('vurqelio_demo_user') || 'null');
        if (!saved || saved.email.toLowerCase() !== email.toLowerCase()) {
          message.textContent = 'Nu există un cont demo cu acest email pe acest dispozitiv. Încearcă înregistrarea.';
        } else {
          message.textContent = `Bine ai revenit${saved.displayName ? ', ' + saved.displayName : ''}! Ești în modul demo.`;
        }
      }
    }
  } catch (err) {
    message.textContent = err.message || 'A apărut o eroare. Încearcă din nou.';
  } finally {
    submit.disabled = false;
  }
});
