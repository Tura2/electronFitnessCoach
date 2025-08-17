const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function switchTab(name) {
  $$('.tab').forEach(s => s.classList.remove('active'));
  $(`#tab-${name}`).classList.add('active');
  $$('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}

$$('nav button').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

const form = $('#trainee-form');
const tbody = $('#trainees-table tbody');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.first_name = data.first_name.trim();
  data.last_name = (data.last_name||'').trim();
  if (!data.first_name) return alert('שם פרטי חובה');

  const res = await window.api.createTrainee(data);
  if (res?.ok) {
    form.reset();
    loadTrainees();
  } else {
    alert('שגיאה ביצירת מתאמן/ת');
  }
});

async function loadTrainees() {
  const rows = await window.api.listTrainees();
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');

    const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
    tr.innerHTML = `
      <td>${fullName || '(ללא שם)'}</td>
      <td>${r.email || ''}</td>
      <td>${r.phone || ''}</td>
      <td>
        <select data-id="${r.id}" class="status">
          <option value="active" ${r.status==='active'?'selected':''}>פעיל</option>
          <option value="invited" ${r.status==='invited'?'selected':''}>שוגר זימון</option>
          <option value="inactive" ${r.status==='inactive'?'selected':''}>לא פעיל</option>
        </select>
      </td>
      <td>
        <button class="del" data-id="${r.id}">מחיקה</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // שינוי סטטוס
  $$('.status', tbody).forEach(sel => sel.addEventListener('change', async ev => {
    const id = ev.target.dataset.id;
    const status = ev.target.value;
    await window.api.updateTrainee(id, { status });
  }));

  // מחיקה
  $$('.del', tbody).forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('למחוק מתאמן/ת?')) return;
    await window.api.deleteTrainee(btn.dataset.id);
    loadTrainees();
  }));
}

loadTrainees();
