(function(){
  const $ = (id) => document.getElementById(id);

  function showPage(pageId){
    document.querySelectorAll('.portalPage').forEach(page => page.classList.add('hidden'));
    const target = $(pageId);
    if(target) target.classList.remove('hidden');
    document.querySelectorAll('.navBtn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
    if(pageId === 'recordsPage' && $('refreshBtn')) setTimeout(() => $('refreshBtn').click(), 50);
    if(pageId === 'employeesPage' && $('employeeRefreshBtn')) setTimeout(() => $('employeeRefreshBtn').click(), 50);
  }

  function refreshDashboard(){
    const cards = Array.from(document.querySelectorAll('#list .linkBtn'));
    const total = cards.length;
    const expired = cards.filter(btn => btn.textContent.includes('Expired')).length;
    const active = Math.max(total - expired, 0);
    const who = $('whoText')?.textContent || '';
    const role = who.includes('•') ? who.split('•')[0].trim() : '—';
    const name = who.includes('•') ? who.split('•').slice(1).join('•').trim() : '—';
    if($('statWriteups')) $('statWriteups').textContent = String(total);
    if($('statActiveWriteups')) $('statActiveWriteups').textContent = String(active);
    if($('statExpiredWriteups')) $('statExpiredWriteups').textContent = String(expired);
    if($('statRole')) $('statRole').textContent = role || '—';
    if($('accountName')) $('accountName').textContent = name || '—';
    if($('accountId')) $('accountId').textContent = $('empId')?.value || 'Stored session';
    if($('accountRole')) $('accountRole').textContent = role || '—';
    if($('accountEmail')) $('accountEmail').textContent = 'Stored in employee record';
  }

  function watchPortal(){
    const signedIn = $('whoText') && $('whoText').textContent !== 'Not signed in';
    if($('publicHero')) $('publicHero').classList.toggle('hidden', signedIn);
    if($('authShell')) $('authShell').classList.toggle('hidden', signedIn);
    if($('portalShell')) $('portalShell').classList.toggle('hidden', !signedIn);
    if($('logoutBtn2')) $('logoutBtn2').classList.toggle('hidden', !signedIn);
    const isCeo = ($('whoText')?.textContent || '').startsWith('CEO');
    document.querySelectorAll('.ceoOnly').forEach(el => el.classList.toggle('hidden', !isCeo));
    refreshDashboard();
  }

  function injectEmployeeModalStyles(){
    if(document.getElementById('employeeModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeModalStyles';
    style.textContent = `
      .employeeTopBar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .employeeTopBar h3{margin:0;font-size:16px;letter-spacing:-.2px}
      .employeeTopBar p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      .employee-admin-grid.modalized{display:block!important}
      .employee-admin-grid.modalized > div{min-width:0}
      #employeeModal .modalCard{width:min(760px,100%)}
      #employeeModal .modalTitleRow{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px}
      #employeeModal .modalTitleRow h2{font-size:24px;letter-spacing:-.5px;margin:2px 0 0}
      #employeeModal .modalSubtext{margin:0 0 10px;color:var(--muted);font-size:12px;line-height:1.5}
      #employeeModal .employeeModalForm{border:1px solid rgba(15,23,42,.08);border-radius:18px;padding:14px;background:#fff;box-shadow:var(--shadow2)}
    `;
    document.head.appendChild(style);
  }

  function openEmployeeModal(mode){
    const modal = $('employeeModal');
    if(!modal) return;
    const title = $('employeeModalTitle');
    const sub = $('employeeModalSubtext');
    if(title) title.textContent = mode === 'edit' ? 'Edit employee' : 'Add employee';
    if(sub) sub.textContent = mode === 'edit'
      ? 'Update the selected employee record, role, or account status.'
      : 'Create a new employee record. The first-login password will be RFN2026.';
    modal.classList.remove('hidden');
    setTimeout(() => $('adminEmpId')?.focus(), 40);
  }

  function closeEmployeeModal(){
    const modal = $('employeeModal');
    if(modal) modal.classList.add('hidden');
  }

  function setupEmployeeModal(){
    const card = $('employeeAdminCard');
    const grid = card?.querySelector('.employee-admin-grid');
    if(!card || !grid || $('employeeModal')) return;

    injectEmployeeModalStyles();

    const formPane = grid.children[0];
    const listPane = grid.children[1];
    if(!formPane || !listPane) return;

    const topBar = document.createElement('div');
    topBar.className = 'employeeTopBar';
    topBar.innerHTML = `
      <div>
        <h3>Employee Directory</h3>
        <p>Select an employee to edit their profile, or create a new employee for first-time access.</p>
      </div>
      <button id="openEmployeeModalBtn" type="button">Add employee</button>
    `;

    grid.classList.add('modalized');
    grid.innerHTML = '';
    grid.appendChild(listPane);
    card.querySelector('.card-bd')?.insertBefore(topBar, grid);

    const modal = document.createElement('div');
    modal.className = 'modalOverlay hidden';
    modal.id = 'employeeModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modalCard wideModal">
        <div class="modalTitleRow">
          <div>
            <p class="eyebrow">CEO Control</p>
            <h2 id="employeeModalTitle">Add employee</h2>
          </div>
          <button class="ghost" id="closeEmployeeModalBtn" type="button">Close</button>
        </div>
        <p class="modalSubtext" id="employeeModalSubtext">Create a new employee record. The first-login password will be RFN2026.</p>
        <div class="employeeModalForm"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.employeeModalForm').appendChild(formPane);

    document.getElementById('openEmployeeModalBtn')?.addEventListener('click', () => {
      $('adminClearBtn')?.click();
      openEmployeeModal('create');
    });
    document.getElementById('closeEmployeeModalBtn')?.addEventListener('click', closeEmployeeModal);
    modal.addEventListener('click', (e) => {
      if(e.target === modal) closeEmployeeModal();
    });
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

  document.addEventListener('click', (e) => {
    const employee = e.target.closest('.employeeItem');
    if(!employee) return;
    setTimeout(() => openEmployeeModal('edit'), 0);
  });

  document.addEventListener('click', (e) => {
    if(e.target?.id !== 'adminSaveBtn') return;
    setTimeout(() => {
      const msg = $('adminMsg')?.textContent || '';
      if(msg.startsWith('Employee added')){
        $('adminClearBtn')?.click();
        closeEmployeeModal();
      }
    }, 900);
  });

  const obs = new MutationObserver(watchPortal);
  window.addEventListener('DOMContentLoaded', () => {
    const who = $('whoText');
    if(who) obs.observe(who, { childList:true, characterData:true, subtree:true });
    setupEmployeeModal();
    showPage('dashboardPage');
    watchPortal();
    setInterval(() => {
      setupEmployeeModal();
      watchPortal();
    }, 1200);
  });
})();
