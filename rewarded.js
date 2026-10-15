/* Vurqelio — reclame cu recompensă (Google Ad Manager) + offerwall */
let gptLoaded = false, rewardedSlot = null, adBusy = false;

function loadGPT() {
  window.googletag = window.googletag || { cmd: [] };
  if (gptLoaded) return;
  gptLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  s.async = true;
  document.head.appendChild(s);
  googletag.cmd.push(() => {
    const pubads = googletag.pubads();
    const c = window.vqConsent ? vqConsent() : {};
    pubads.setPrivacySettings({ nonPersonalizedAds: !(c.ads && c.personal), limitedAds: !c.ads });
    pubads.addEventListener('rewardedSlotReady', e => e.makeRewardedVisible());
    pubads.addEventListener('rewardedSlotGranted', async () => {
      try {
        const pts = await rpc('claim_ad_reward');
        toast(`+${pts} VP pentru reclamă!`);
        window.onAdReward?.();
      } catch (err) { toast(err.message); }
    });
    pubads.addEventListener('rewardedSlotClosed', endAd);
    pubads.addEventListener('slotRenderEnded', e => {
      if (e.slot === rewardedSlot && e.isEmpty) { toast('Nu e nicio reclamă disponibilă acum. Încearcă mai târziu.'); endAd(); }
    });
    googletag.enableServices();
  });
}

function endAd() {
  if (rewardedSlot) googletag.destroySlots([rewardedSlot]);
  rewardedSlot = null;
  adBusy = false;
}

function showRewardedAd() {
  if (!AD_MANAGER_REWARDED_UNIT) return toast('Reclamele cu recompensă vor fi activate în curând.');
  if (adBusy) return;
  adBusy = true;
  loadGPT();
  googletag.cmd.push(() => {
    rewardedSlot = googletag.defineOutOfPageSlot(AD_MANAGER_REWARDED_UNIT, googletag.enums.OutOfPageFormat.REWARDED);
    if (!rewardedSlot) { adBusy = false; return toast('Reclamele cu recompensă nu sunt suportate pe acest dispozitiv.'); }
    rewardedSlot.addService(googletag.pubads());
    googletag.display(rewardedSlot);
  });
}

