/* Vurqelio — consimțământ cookies (GDPR) + Google Consent Mode v2 */
(() => {
  const KEY = 'vq_consent';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const g = v => (v ? 'granted' : 'denied');
  const apply = c => gtag('consent', 'update', { ad_storage: g(c.ads), ad_user_data: g(c.ads), ad_personalization: g(c.ads && c.personal), analytics_storage: g(c.analytics) });
  const saved = read();
  if (saved) apply(saved);
  window.vqConsent = () => read() || { ads: false, personal: false, analytics: false };

  let box = null;
  function save(c) {
    localStorage.setItem(KEY, JSON.stringify({ ...c, date: new Date().toISOString(), v: 1 }));
    apply(c);
    box?.remove();
    box = null;
  }

  function show() {
    if (box) return;
    const c = window.vqConsent();
    box = document.createElement('div');
    box.className = 'cookie-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Setări cookies');
    box.dataset.testid = 'cookie-banner';
    box.innerHTML = `
      <strong>Cookies & confidențialitate</strong>
      <p>Folosim cookies necesare pentru cont. Cu acordul tău, partenerii noștri (ex. Google) pot folosi cookies pentru reclame și statistici. Poți schimba oricând alegerea din „Setări cookies”. <a href="privacy.html">Detalii</a></p>
      <div class="cookie-opts hidden">
        <label><input type="checkbox" checked disabled> Necesare (mereu active)</label>
        <label><input type="checkbox" id="ckAds" ${c.ads ? 'checked' : ''} data-testid="cookie-ads"> Reclame (stocare și măsurare)</label>
        <label><input type="checkbox" id="ckPersonal" ${c.personal ? 'checked' : ''} data-testid="cookie-personal"> Reclame personalizate</label>
        <label><input type="checkbox" id="ckAnalytics" ${c.analytics ? 'checked' : ''} data-testid="cookie-analytics"> Statistici</label>
      </div>
      <div class="cookie-btns">
        <button class="btn btn-line sm" id="ckReject" data-testid="cookie-reject-btn">Doar necesare</button>
        <button class="btn btn-line sm" id="ckCustom" data-testid="cookie-custom-btn">Personalizează</button>
        <button class="btn btn-lime sm" id="ckAccept" data-testid="cookie-accept-btn">Accept toate</button>
      </div>`;
    document.body.appendChild(box);
    const q = s => box.querySelector(s);
    q('#ckAccept').onclick = () => save({ ads: true, personal: true, analytics: true });
    q('#ckReject').onclick = () => save({ ads: false, personal: false, analytics: false });
    q('#ckCustom').onclick = () => {
      const opts = q('.cookie-opts');
      if (opts.classList.contains('hidden')) { opts.classList.remove('hidden'); q('#ckCustom').textContent = 'Salvează alegerea'; return; }
      save({ ads: q('#ckAds').checked, personal: q('#ckPersonal').checked, analytics: q('#ckAnalytics').checked });
    };
  }

  window.openCookieSettings = show;
  if (!saved) show();
})();
