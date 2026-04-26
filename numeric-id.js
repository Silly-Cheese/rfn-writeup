(function(){
  const numericIds = [
    'empId',
    'setupId',
    'targetEmpId',
    'searchEmpId',
    'adminEmpId',
    'eEmpId'
  ];

  const actionMap = {
    loginBtn: ['empId'],
    setupBtn: ['setupId'],
    createBtn: ['targetEmpId'],
    searchBtn: ['searchEmpId'],
    adminSaveBtn: ['adminEmpId'],
    saveEditBtn: ['eEmpId']
  };

  function $(id){ return document.getElementById(id); }

  function toast(title, message){
    const box = $('toast');
    if(!box){ alert(`${title}\n${message}`); return; }
    $('toastT').innerText = title;
    $('toastM').innerText = message;
    box.classList.add('show');
    clearTimeout(window.__numericIdToast);
    window.__numericIdToast = setTimeout(() => box.classList.remove('show'), 3300);
  }

  function cleanInput(el){
    if(!el) return;
    const cleaned = String(el.value || '').replace(/\D/g, '');
    if(el.value !== cleaned) el.value = cleaned;
  }

  function prepareInput(el){
    if(!el || el.dataset.numericIdPrepared === 'true') return;
    el.dataset.numericIdPrepared = 'true';
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('pattern', '[0-9]*');
    el.setAttribute('autocomplete', el.id === 'empId' ? 'username' : 'off');
    el.addEventListener('input', () => cleanInput(el));
    el.addEventListener('paste', () => setTimeout(() => cleanInput(el), 0));
  }

  function prepareAll(){
    numericIds.forEach(id => prepareInput($(id)));
  }

  function isRequired(id){
    return id !== 'searchEmpId';
  }

  function validate(ids){
    for(const id of ids){
      const el = $(id);
      if(!el) continue;
      cleanInput(el);
      const value = String(el.value || '').trim();
      if(!value && !isRequired(id)) continue;
      if(!value){
        toast('Employee ID required', 'Employee ID must be numbers only.');
        el.focus();
        return false;
      }
      if(!/^[0-9]+$/.test(value)){
        toast('Invalid Employee ID', 'Employee ID must contain numbers only.');
        el.focus();
        return false;
      }
    }
    return true;
  }

  document.addEventListener('click', function(e){
    prepareAll();
    const button = e.target.closest('button');
    if(!button || !actionMap[button.id]) return;
    if(!validate(actionMap[button.id])){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('keydown', function(e){
    prepareAll();
    if(e.key !== 'Enter') return;
    const active = document.activeElement;
    if(!active) return;
    if(active.id === 'empId' || active.id === 'loginPass'){
      if(!validate(['empId'])){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  document.addEventListener('click', function(e){
    const employee = e.target.closest('.employeeItem');
    if(!employee) return;
    setTimeout(() => {
      const field = $('adminEmpId');
      if(field) cleanInput(field);
    }, 0);
  });

  window.addEventListener('DOMContentLoaded', () => {
    prepareAll();
    setInterval(prepareAll, 1000);
  });
})();
