(function(){
  const $ = (id) => document.getElementById(id);
  function showPage(pageId){
    document.querySelectorAll('.portalPage').forEach(page => page.classList.add('hidden'));
    const target = $(pageId);
    if(target) target.classList.remove('hidden');
    document.querySelectorAll('.navBtn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
  }
  function refreshDashboard(){
    const cards = Array.from(document.querySelectorAll('#list .linkBtn'));
    const total = cards.length;
    const expired = cards.filter(btn => btn.textContent.includes('Expired')).length;
    const active = Math.max(total - expired, 0);
    const who = $('whoText')?.textContent || '';
    const role = who.includes('•') ? who.split('•')[0].trim() : '—';
    if($('statWriteups')) $('statWriteups').textContent = String(total);
    if($('statActiveWriteups')) $('statActiveWriteups').textContent = String(active);
    if($('statExpiredWriteups')) $('statExpiredWriteups').textContent = String(expired);
    if($('statRole')) $('statRole').textContent = role || '—';
    if($('accountName')) $('accountName').textContent = who.includes('•') ? who.split('•').slice(1).join('•').trim() : '—';
    if($('accountId')) $('accountId').textContent = $('empId')?.value || '—';
    if($('accountRole')) $('accountRole').textContent = role || '—';
    if($('accountEmail')) $('accountEmail').textContent = 'Stored in employee record';
  }
  function watchPortal(){
    const signedIn = $('whoText') && $('whoText').textContent !== 'Not signed in';
    if($('publicHero')) $('publicHero').classList.toggle('hidden', signedIn);
    if($('authShell')) $('authShell').classList.toggle('hidden', signedIn);
    if($('portalShell')) $('portalShell').classList.toggle('hidden', !signedIn);
    document.querySelectorAll('.ceoOnly').forEach(el => {
      const isCeo = ($('whoText')?.textContent || '').startsWith('CEO');
      el.classList.toggle('hidden', !isCeo);
    });
    refreshDashboard();
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.navBtn[data-page]');
    if(!btn) return;
    showPage(btn.dataset.page);
    refreshDashboard();
  });
  document.addEventListener('click', (e) => {
    if(e.target && e.target.id === 'refreshDashboardBtn') refreshDashboard();
  });
  const obs = new MutationObserver(watchPortal);
  window.addEventListener('DOMContentLoaded', () => {
    const who = $('whoText');
    if(who) obs.observe(who, { childList:true, characterData:true, subtree:true });
    showPage('dashboardPage');
    watchPortal();
    setInterval(watchPortal, 1200);
  });
})();
