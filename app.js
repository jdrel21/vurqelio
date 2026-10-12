/* Vurqelio — Supabase dashboard */
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function openModal(nextMode = 'signup') {
  setMode(nextMode);
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  message.textContent = '';
}

function setMode(nextMode) {
  mode = nextMode;

  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });

  nameLabel.style.display = mode === 'signup' ? 'block' : 'none';
  nameInput.required = mode === 'signup';

  title.textContent = mode === 'signup'
    ? 'Bine ai venit.'
    : 'Bine ai revenit.';

  subtitle.textContent = mode === 'signup'
    ? 'Creează-ți contul pentru a testa panoul.'
    : 'Conectează-te la contul tău.';

  submit.innerHTML = mode === 'signup'
    ? 'Creează cont <span>→</span>'
    : 'Conectare <span>→</span>';

  document.getElementById('password').autocomplete =
    mode === 'signup' ? 'new-password' : 'current-password';

  message.textContent = '';
}

['openLogin'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => openModal('login'));
});

['openSignup', 'heroSignup', 'rewardsSignup', 'bottomSignup'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => openModal('signup'));
});

document.getElementById('closeModal').addEventListener('click', closeModal);

backdrop.addEventListener('click', e => {
  if (e.target === backdrop) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

tabs.forEach(t => {
  t.addEventListener('click', () => setMode(t.dataset.mode));
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.querySelector('.nav').classList.toggle('mobile-open');
});


/* =========================
   REAL USER DASHBOARD
========================= */

async function loadDashboard() {
  if (!client) return;

  const {
    data: { session },
    error: sessionError
  } = await client.auth.getSession();

  if (sessionError || !session?.user) return;

  const user = session.user;

  const profileResult = await client
    .from('profiles')
    .select('display_name, created_at')
    .eq('id', user.id)
    .maybeSingle();

  const ledgerResult = await client
    .from('point_ledger')
    .select('id, amount, reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const activitiesResult = await client
    .from('activities')
    .select('id, title, description, points, provider, video_url, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (profileResult.error) {
    console.error('Profile error:', profileResult.error);
  }

  if (ledgerResult.error) {
    console.error('Ledger error:', ledgerResult.error);
  }

  if (activitiesResult.error) {
    console.error('Activities error:', activitiesResult.error);
  }

  const profile = profileResult.data;
  const ledger = ledgerResult.data || [];
  const activities = activitiesResult.data || [];

  const balance = ledger.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  renderDashboard({
    user,
    profile,
    balance,
    ledger,
    activities
  });
}

function renderDashboard({ user, profile, balance, ledger, activities }) {
  let dashboard = document.getElementById('realDashboard');

  if (!dashboard) {
    dashboard = document.createElement('section');
    dashboard.id = 'realDashboard';
    dashboard.className = 'real-dashboard-section wrap';

    const topbar = document.querySelector('.topbar');
    topbar.insertAdjacentElement('afterend', dashboard);
  }

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.email?.split('@')[0] ||
    'Utilizator';

  const historyHtml = ledger.length
    ? ledger.slice(0, 10).map(item => {
        const amount = Number(item.amount || 0);
        const sign = amount >= 0 ? '+' : '';

        return `
          <div class="ledger-item">
            <div>
              <strong>${escapeHtml(item.reason)}</strong>
              <small>${new Date(item.created_at).toLocaleString('ro-RO')}</small>
            </div>
            <b class="${amount >= 0 ? 'positive' : 'negative'}">
              ${sign}${amount} VP
            </b>
          </div>
        `;
      }).join('')
    : `
      <div class="empty-state">
        <span>✦</span>
        <strong>Nu există încă activități.</strong>
        <small>Istoricul punctelor va apărea aici.</small>
      </div>
    `;

  const activitiesHtml = activities.length
  ? activities.map(activity => `
      <article class="real-activity-card">
        <div class="real-activity-icon">▶</div>

        <div class="real-activity-content">
          <h4>${escapeHtml(activity.title)}</h4>

          <p>${escapeHtml(activity.description)}</p>

          <small>
            ${activity.points} VP · ${escapeHtml(activity.provider || 'Vurqelio')}
          </small>

          ${
  activity.video_url
    ? `
      <div class="activity-video">
        <iframe
          src="${activity.video_url.replace('youtu.be/', 'www.youtube.com/embed/').split('?')[0]}"
          title="${escapeHtml(activity.title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>

      <button
        class="btn btn-primary complete-activity-btn"
        data-activity-id="${activity.id}">
        Am urmărit videoclipul — primește ${activity.points} VP
      </button>
    `
    : ''
          }
        </div>
      </article>
    `).join('')
  : `
      <div class="empty-state">
        <span>◌</span>
        <strong>Nu sunt activități active momentan.</strong>
        <small>Activitățile vor apărea aici când vor fi active.</small>
      </div>
    `;
  dashboard.innerHTML = `
    <div class="real-dashboard-header">
      <div>
        <span class="eyebrow">PANOU PERSONAL</span>
        <h2>Bine ai venit, <span class="gradient-text">${escapeHtml(displayName)}</span>.</h2>
        <p>${escapeHtml(user.email || '')}</p>
      </div>

      <button class="btn btn-outline" id="logoutButton">
        Deconectare
      </button>
    </div>

    <div class="real-dashboard-grid">

      <div class="real-balance-card">
        <div class="real-card-label">SOLD DE PUNCTE</div>

        <div class="real-balance">
          ${balance.toLocaleString('ro-RO')}
          <span>VP</span>
        </div>

        <p>Punctele sunt înregistrate în contul tău.</p>
      </div>

      <div class="real-stat-card">
        <span>ACTIVITĂȚI</span>
        <strong>${activities.length}</strong>
        <small>active acum</small>
      </div>

      <div class="real-stat-card">
        <span>TRANZACȚII</span>
        <strong>${ledger.length}</strong>
        <small>în istoricul tău</small>
      </div>

    </div>

    <div class="real-dashboard-columns">

      <div class="real-panel">
        <div class="real-panel-header">
          <div>
            <span class="eyebrow">ACTIVITĂȚI</span>
            <h3>Descoperă activități</h3>
          </div>
        </div>

        <div class="real-activities-list">
          ${activitiesHtml}
        </div>
      </div>

      <div class="real-panel">
        <div class="real-panel-header">
          <div>
            <span class="eyebrow">ISTORIC</span>
            <h3>Ultimele puncte</h3>
          </div>
        </div>

        <div class="ledger-list">
          ${historyHtml}
        </div>
      </div>

    </div>

    <div class="real-dashboard-note">
      <strong>Vurqelio Points</strong>
      <span>
        În versiunea actuală, VP sunt puncte demonstrative și nu pot fi retrase.
      </span>
    </div>
  `;

  dashboard.classList.add('visible');

  document.getElementById('logoutButton').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();

    if (error) {
      toast('Nu am putut realiza deconectarea.');
      return;
    }

    dashboard.remove();
    toast('Te-ai deconectat.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  dashboard.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
/* =========================
   COMPLETE ACTIVITY
========================= */

document.addEventListener('click', async (e) => {
  const button = e.target.closest('.complete-activity-btn');

  if (!button) return;

  const activityId = button.dataset.activityId;

  if (!activityId) {
    toast('Activitatea nu este validă.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Se acordă punctele…';

  try {
    const { data, error } = await client.rpc('complete_activity', {
      p_activity_id: activityId
    });

    if (error) {
      console.error('Complete activity error:', error);
      throw error;
    }

    toast(`Ai primit ${data} VP!`);

    await loadDashboard();

  } catch (err) {
    console.error(err);

    button.disabled = false;
    button.textContent = 'Am urmărit videoclipul';

    toast(
      err.message || 'Nu s-au putut acorda punctele.'
    );
  }
});

/* =========================
   AUTH
========================= */

form.addEventListener('submit', async e => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const displayName = nameInput.value.trim();

  submit.disabled = true;
  message.textContent = 'Se procesează…';

  try {
    if (!client) {
      throw new Error('Supabase nu este configurat.');
    }

    if (mode === 'signup') {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        message.textContent = 'Cont creat cu succes.';
        closeModal();
        await loadDashboard();
      } else {
        message.textContent =
          'Contul a fost creat. Verifică emailul pentru confirmare.';
      }

    } else {

      const { error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      message.textContent = 'Conectare reușită.';
      closeModal();

      await loadDashboard();
    }

  } catch (err) {
    console.error(err);
    message.textContent =
      err.message || 'A apărut o eroare. Încearcă din nou.';
  } finally {
    submit.disabled = false;
  }
});


/* =========================
   AUTO LOGIN
========================= */

if (client) {
  client.auth.onAuthStateChange((event, session) => {
    if (session?.user && event === 'SIGNED_IN') {
      setTimeout(() => loadDashboard(), 0);
    }
  });

  loadDashboard();
}
