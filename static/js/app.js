/**
 * Jayakody Maha Vidyalaya (JMV) Portal - Client Application
 * Grounded in JMV-Web Theme, Details, and Specifications:
 * - Census No: 11084
 * - School Houses: Thisara (තිසර), Mayura (මයුර), Paravi (පරවි)
 * - Official Crest: /static/img/JMV_Logo.png
 * - Official Motto: “උගත මනා ශිල්පයමයි මතු රැකෙනා”
 * - Bilingual support: English (EN) & Sinhala (සිං)
 */

function icon(name, className = 'ui-icon') {
  return `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

// Application State
const AppState = {
  currentUser: null,         // { id, username, role, full_name, email, staff_id } or null
  currentEntity: null,       // Currently viewed student or staff member
  currentEntityType: null,   // 'student' | 'staff'
  currentViewMode: 'dossier',  // 'dossier'
  studentsList: [],
  staffList: [],
  timetableList: [],
  timetableData: null,
  currentTimetableMode: 'class',
  selectedClass: '6-A',
  selectedTeacher: '',
  userHasManuallySelectedTimetable: false,
  marksList: [],
  paymentsList: [],
  paymentStats: null,
  stats: null,
  activeTab: 'home',
  language: 'en'             // 'en' | 'si'
};

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initNavigation();
  initUniversalSearch();
  initResultControls();
  initDirectoryFilters();
  initModals();
  initTimetable();
  initQuickPills();
  initAuth();

  // Non-blocking background preload of timetable data
  ensureTimetableDataLoaded();

  // Parallel initial data queries
  checkDbHealth();
  loadStats();
  checkAuth().then(authenticated => {
    if (authenticated && ['admin', 'teacher'].includes(AppState.currentUser?.role)) {
      loadStudents();
      if (AppState.currentUser.role === 'admin') {
        loadStaff();
        loadPayments();
      }
    }
    updateHomeView();
  });

  // Check URL params for direct ID lookup e.g. ?id=JMV-STU-1001
  const urlParams = new URLSearchParams(window.location.search);
  const directId = urlParams.get('id');
  if (directId) {
    switchTab('lookup');
    executeLookup(directId);
  } else {
    switchTab('home');
  }
});

/* --------------------------------------------------------------------------
   Database health banner
   -------------------------------------------------------------------------- */
async function checkDbHealth(reloadOnSuccess = false) {
  const banner = document.getElementById('dbStatusBanner');
  const msg = document.getElementById('dbStatusMessage');
  const stripEngine = document.getElementById('stripDbEngine');
  const stripStatus = document.getElementById('stripDbStatus');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.mariadb_connected) {
      if (stripEngine) {
        stripEngine.textContent = 'ONLINE';
        stripEngine.style.color = '#86efac'; // soft emerald green
      }
      if (stripStatus) {
        stripStatus.textContent = 'Remote MariaDB Connected';
      }
      if (banner) banner.classList.add('hidden');
      if (reloadOnSuccess) {
        showToast('Connected to MariaDB successfully!', 'success');
        loadStats();
        loadStudents();
        loadStaff();
      }
    } else if (data.active_engine === 'sqlite') {
      if (stripEngine) {
        stripEngine.textContent = 'LOCAL';
        stripEngine.style.color = '#fde047'; // bright gold
      }
      if (stripStatus) {
        stripStatus.textContent = 'SQLite Fallback (MariaDB unreachable)';
      }
      if (banner) {
        if (msg) msg.textContent = (data.message || 'Remote MariaDB unavailable.') + ' Currently using local SQLite fallback database.';
        banner.classList.remove('hidden');
      }
    } else {
      if (stripEngine) {
        stripEngine.textContent = 'ERROR';
        stripEngine.style.color = '#f87171'; // red
      }
      if (stripStatus) stripStatus.textContent = 'Database unavailable';
      if (msg) msg.textContent = data.message || 'Database connection unavailable.';
      if (banner) banner.classList.remove('hidden');
    }
  } catch (err) {
    if (stripEngine) {
      stripEngine.textContent = 'OFFLINE';
      stripEngine.style.color = '#f87171';
    }
    if (stripStatus) stripStatus.textContent = 'Portal server offline';
    if (msg) msg.textContent = 'Portal server connection error.';
    if (banner) banner.classList.remove('hidden');
  }
}

/* --------------------------------------------------------------------------
   Live Clock & Header Info
   -------------------------------------------------------------------------- */
function initLiveClock() {
  const clockEl = document.getElementById('liveClock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    const options = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    };
    clockEl.textContent = now.toLocaleDateString('en-GB', options);
  }
  update();
  setInterval(update, 1000);
}

/* --------------------------------------------------------------------------
   Bilingual Language Switcher (EN / SI) matching JMV-Web
   -------------------------------------------------------------------------- */
function setLanguage(lang) {
  AppState.language = lang;

  // Update switcher buttons
  const enBtn = document.getElementById('langEnBtn');
  const siBtn = document.getElementById('langSiBtn');
  if (enBtn && siBtn) {
    enBtn.className = lang === 'en' 
      ? 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#d4af37] text-[#38050b] transition-all'
      : 'px-2.5 py-0.5 rounded-full text-[11px] font-bold text-rose-100 transition-all';
    siBtn.className = lang === 'si'
      ? 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#d4af37] text-[#38050b] transition-all'
      : 'px-2.5 py-0.5 rounded-full text-[11px] font-bold text-rose-100 transition-all';
  }

  // Header texts
  const schoolNameEl = document.getElementById('headerSchoolName');
  const subTitleEl = document.getElementById('headerSubTitle');
  const mottoEl = document.getElementById('headerMotto');

  if (lang === 'si') {
    if (schoolNameEl) schoolNameEl.textContent = 'ජයකොඩි මහා විද්‍යාලය';
    if (subTitleEl) subTitleEl.textContent = 'බප / කැල / ජයකොඩි ම.වි - ගණේමුල්ල';
    if (mottoEl) mottoEl.innerHTML = 'විදුහල් ආදර්ශ පාඨය: <strong>“උගත මනා ශිල්පයමයි මතු රැකෙනා”</strong>';
  } else {
    if (schoolNameEl) schoolNameEl.textContent = 'JAYAKODY MAHA VIDYALAYA';
    if (subTitleEl) subTitleEl.textContent = 'බප / කැල / ජයකොඩි ම.වි - ගණේමුල්ල (WP / KE / Jayakody M.V. - Ganemulla)';
    if (mottoEl) mottoEl.innerHTML = 'School Motto: <strong>“Knowledge Truly Learned Protects the Future”</strong>';
  }

  // Update elements with data-en and data-si
  document.querySelectorAll('[data-en]').forEach(el => {
    const val = el.getAttribute(`data-${lang}`);
    if (val) el.textContent = val;
  });

  // Re-render currently viewed cards if any
  if (AppState.currentEntity) {
    renderResult(AppState.currentEntity, AppState.currentEntityType);
  }
}

/* --------------------------------------------------------------------------
   Navigation & Tab Switching
   -------------------------------------------------------------------------- */
function initNavigation() {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Reset demo records button
  const resetDemoBtn = document.getElementById('resetDemoBtn');
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener('click', async () => {
      if (confirm("Restore database with official WP/KE/Jayakody Maha Vidyalaya records?")) {
        try {
          const res = await fetch('/api/reset-demo', { method: 'POST' });
          const data = await res.json();
          showToast("Database restored with official JMV records!", "success");
          loadStudents();
          loadStaff();
          loadStats();
        } catch (e) {
          showToast("Failed to reset database", "error");
        }
      }
    });
  }
}

function switchTab(tabId) {
  AppState.activeTab = tabId;

  // Update tab buttons styles
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tabId;
    if (isActive) {
      btn.className = 'nav-tab-btn active px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wide transition-all rounded-lg border-2 border-[#800020] text-[#6b0f1a] bg-[#fdf2f4]';
    } else {
      btn.className = 'nav-tab-btn px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wide transition-all rounded-lg border-2 border-transparent text-slate-600 hover:text-[#800020] hover:bg-[#fdf2f4]';
    }
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
    pane.classList.add('hidden');
  });

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) {
    targetPane.classList.remove('hidden');
    targetPane.classList.add('active');
  }

  // Refresh data if needed (only if not already loaded)
  if (tabId === 'home') updateHomeView();
  if (tabId === 'students' && (!AppState.studentsList || AppState.studentsList.length === 0)) loadStudents();
  if (tabId === 'marks' && (!AppState.marksList || AppState.marksList.length === 0)) loadAllMarksLedger();
  if (tabId === 'timetable' && (!AppState.timetableList || AppState.timetableList.length === 0)) loadTimetable();
  if (tabId === 'staff') {
    if (AppState.currentUser && AppState.currentUser.role === 'teacher') {
      const banner = document.getElementById('staffTeacherRestrictedBanner');
      const container = document.getElementById('staffMainContainer');
      if (banner) banner.classList.remove('hidden');
      if (container) container.classList.add('hidden');
    } else {
      if (!AppState.staffList || AppState.staffList.length === 0) loadStaff();
    }
  }
  if (tabId === 'payments') {
    if (AppState.currentUser && AppState.currentUser.role === 'teacher') {
      const banner = document.getElementById('paymentsTeacherRestrictedBanner');
      const container = document.getElementById('paymentsMainContainer');
      if (banner) banner.classList.remove('hidden');
      if (container) container.classList.add('hidden');
    } else {
      if (!AppState.paymentsList || AppState.paymentsList.length === 0) loadPayments();
    }
  }
}

function initTimetable() {
  const form = document.getElementById('timetableForm');
  if (form) form.addEventListener('submit', saveTimetableEntry);
  const refresh = document.getElementById('timetableRefreshBtn');
  if (refresh) refresh.addEventListener('click', loadTimetable);
  const cancel = document.getElementById('timetableCancelBtn');
  if (cancel) cancel.addEventListener('click', resetTimetableForm);

  const assignForm = document.getElementById('assignTeacherForm');
  if (assignForm) assignForm.addEventListener('submit', handleAssignTeacherSubmit);
  const teacherSelect = document.getElementById('assignSlotTeacherSelect');
  if (teacherSelect) teacherSelect.addEventListener('change', onAssignTeacherSelectChange);
}

let timetablePreloadPromise = null;
async function ensureTimetableDataLoaded() {
  if (AppState.timetableData) return AppState.timetableData;
  if (timetablePreloadPromise) return timetablePreloadPromise;
  timetablePreloadPromise = (async () => {
    try {
      const res = await fetch('/static/data/timetable_2026.json');
      if (res.ok) {
        AppState.timetableData = await res.json();
      }
    } catch (e) {
      console.warn("Could not preload timetable_2026.json:", e);
    }
    return AppState.timetableData;
  })();
  return timetablePreloadPromise;
}

function normalizePersonName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/^(MR\.|MRS\.|MISS\.|MS\.)\s*/g, '')
    .replace(/[^A-Z]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findStaffTimetableProfile(staffItem) {
  const data = AppState.timetableData;
  if (!data || !staffItem) return null;

  const staffId = String(staffItem.id || '').trim();
  if (staffId && data.staff_timetables && data.staff_timetables[staffId]) {
    return data.staff_timetables[staffId];
  }

  const teachers = data.teachers || {};
  const initName = String(staffItem.name_with_initials || '').trim();
  const fullName = String(staffItem.full_name || '').trim();

  if (initName && teachers[initName]) return teachers[initName];
  if (fullName && teachers[fullName]) return teachers[fullName];

  const targetNorm = normalizePersonName(initName || fullName);
  if (!targetNorm) return null;
  const targetTokens = targetNorm.split(' ');
  const targetSurname = targetTokens[targetTokens.length - 1];

  for (const prof of Object.values(teachers)) {
    if (prof.staff_id && prof.staff_id === staffId) return prof;
    const pNorm = normalizePersonName(prof.official_name || prof.timetable_name);
    if (pNorm === targetNorm) return prof;
    const pTokens = pNorm.split(' ');
    const pSurname = pTokens[pTokens.length - 1];
    if (pSurname && pSurname === targetSurname && pTokens[0] === targetTokens[0]) {
      return prof;
    }
  }
  return null;
}

function openStaffInTimetableTab(staffId, teacherKey) {
  switchTab('timetable');
  const data = AppState.timetableData;
  if (data) {
    let targetTeacher = teacherKey;
    if (!targetTeacher && staffId && data.staff_timetables && data.staff_timetables[staffId]) {
      targetTeacher = data.staff_timetables[staffId].official_name;
    }
    if (targetTeacher && data.teachers && data.teachers[targetTeacher]) {
      AppState.selectedTeacher = targetTeacher;
      AppState.userHasManuallySelectedTimetable = true;
      const select = document.getElementById('ttTeacherSelect');
      if (select) select.value = targetTeacher;
    }
  }
  switchTimetableMode('teacher');
}

function openClassInTimetableTab(className) {
  const cleanCls = String(className || '').split('/')[0].trim();
  if (!cleanCls) return;
  switchTab('timetable');
  if (AppState.timetableData?.classes?.[cleanCls]) {
    AppState.selectedClass = cleanCls;
    AppState.userHasManuallySelectedTimetable = true;
    const select = document.getElementById('ttClassSelect');
    if (select) select.value = cleanCls;
  }
  switchTimetableMode('class');
}

function getSubjectBadgeClass(subject) {
  const s = (subject || '').toLowerCase();
  if (s.includes('math')) return 'bg-blue-100 text-blue-900 border-blue-300';
  if (s.includes('sci')) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (s.includes('sinhala')) return 'bg-amber-100 text-amber-900 border-amber-300';
  if (s.includes('eng')) return 'bg-purple-100 text-purple-900 border-purple-300';
  if (s.includes('buddh') || s.includes('relig')) return 'bg-yellow-100 text-yellow-900 border-yellow-400';
  if (s.includes('hist')) return 'bg-rose-100 text-rose-900 border-rose-300';
  if (s.includes('geo')) return 'bg-teal-100 text-teal-900 border-teal-300';
  if (s.includes('civ')) return 'bg-cyan-100 text-cyan-900 border-cyan-300';
  if (s.includes('tamil')) return 'bg-orange-100 text-orange-900 border-orange-300';
  if (s.includes('it') || s.includes('ict') || s.includes('git')) return 'bg-sky-100 text-sky-900 border-sky-300';
  if (s.includes('phys') || s.includes('pt') || s.includes('sport')) return 'bg-green-100 text-green-900 border-green-300';
  if (s.includes('art') || s.includes('mus') || s.includes('dan') || s.includes('dra')) return 'bg-pink-100 text-pink-900 border-pink-300';
  if (s.includes('acc') || s.includes('econ') || s.includes('bus') || s.includes('com')) return 'bg-violet-100 text-violet-900 border-violet-300';
  if (s.includes('tour') || s.includes('grap')) return 'bg-indigo-100 text-indigo-900 border-indigo-300';
  if (s.includes('lib')) return 'bg-stone-100 text-stone-800 border-stone-300';
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

async function loadTimetable() {
  const u = AppState.currentUser;
  const isAdmin = u && u.role === 'admin';
  const isTeacher = u && u.role === 'teacher';
  const restricted = document.getElementById('timetableRestrictedBanner');
  const container = document.getElementById('timetableAdminContainer');
  const toggleFormBtn = document.getElementById('timetableToggleFormBtn');

  if (!isAdmin && !isTeacher) {
    if (restricted) restricted.classList.remove('hidden');
    if (container) container.classList.add('hidden');
    return;
  }
  if (restricted) restricted.classList.add('hidden');
  if (container) container.classList.remove('hidden');

  if (toggleFormBtn) {
    if (isAdmin) toggleFormBtn.classList.remove('hidden');
    else toggleFormBtn.classList.add('hidden');
  }

  try {
    const promises = [
      ensureTimetableDataLoaded(),
      fetch('/api/timetable', { credentials: 'include', headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []).catch(() => [])
    ];
    if (isAdmin) {
      promises.push(fetch('/api/staff', { credentials: 'include', headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []).catch(() => []));
    }
    const [jsonData, apiEntries, staffList] = await Promise.all(promises);

    if (jsonData) {
      AppState.timetableData = jsonData;
    }
    if (apiEntries) {
      AppState.timetableList = apiEntries;
    }
    if (jsonData && apiEntries && apiEntries.length) {
      applyDbTimetableToClasses(AppState.timetableData, apiEntries);
    }
    if (staffList && staffList.length) {
      AppState.staffList = staffList;
    }

    if (isAdmin && staffList && staffList.length) {
      const teacherSelect = document.getElementById('timetableTeacher');
      if (teacherSelect) {
        teacherSelect.innerHTML = '<option value="">Select teacher</option>' +
          staffList.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name_with_initials || t.full_name)} (${escapeHtml(t.id)})</option>`).join('');
      }
    }

    // Populate selectors
    populateTimetableClassSelect();
    populateTimetableTeacherSelect();

    // Auto-select logged-in teacher if applicable
    if (isTeacher && u && !AppState.userHasManuallySelectedTimetable) {
      const matchedProf = findStaffTimetableProfile({
        id: u.staff_id || '',
        name_with_initials: u.name_with_initials || '',
        full_name: u.full_name || ''
      });
      if (matchedProf && matchedProf.official_name) {
        AppState.selectedTeacher = matchedProf.official_name;
        const select = document.getElementById('ttTeacherSelect');
        if (select) select.value = matchedProf.official_name;
        switchTimetableMode('teacher');
      } else {
        switchTimetableMode('class');
      }
    } else if (!AppState.currentTimetableMode) {
      switchTimetableMode('class');
    } else {
      switchTimetableMode(AppState.currentTimetableMode);
    }

  } catch (error) {
    console.error("Timetable load error:", error);
    showToast("Error loading timetable: " + error.message, "error");
  }
}

function populateTimetableClassSelect() {
  const select = document.getElementById('ttClassSelect');
  if (!select) return;
  const classes = AppState.timetableData?.classes || {};
  const classNames = Object.keys(classes);
  if (!classNames.length) return;

  const junior = classNames.filter(c => /^[6-9]-/.test(c));
  const ol = classNames.filter(c => /^1[0-1]-/.test(c));
  const al = classNames.filter(c => /^1[2-3]/.test(c));

  select.innerHTML = `
    <optgroup label="Junior Secondary (Grades 6–9)">
      ${junior.map(c => `<option value="${escapeHtml(c)}">Grade ${escapeHtml(c)}</option>`).join('')}
    </optgroup>
    <optgroup label="G.C.E. Ordinary Level (Grades 10–11)">
      ${ol.map(c => `<option value="${escapeHtml(c)}">Grade ${escapeHtml(c)}</option>`).join('')}
    </optgroup>
    <optgroup label="Collegiate Advanced Level (Grades 12–13)">
      ${al.map(c => `<option value="${escapeHtml(c)}">Grade ${escapeHtml(c)}</option>`).join('')}
    </optgroup>
  `;

  if (AppState.selectedClass && classNames.includes(AppState.selectedClass)) {
    select.value = AppState.selectedClass;
  } else if (classNames.length) {
    AppState.selectedClass = classNames[0];
    select.value = AppState.selectedClass;
  }
}

function populateTimetableTeacherSelect() {
  const select = document.getElementById('ttTeacherSelect');
  if (!select) return;
  const teachers = AppState.timetableData?.teachers || {};
  const teacherNames = Object.keys(teachers).sort((a, b) => {
    const idA = teachers[a]?.staff_id || 'ZZZ';
    const idB = teachers[b]?.staff_id || 'ZZZ';
    return idA.localeCompare(idB);
  });
  if (!teacherNames.length) return;

  select.innerHTML = teacherNames.map(t => {
    const tObj = teachers[t] || {};
    const load = tObj.teaching_load || 0;
    const sid = tObj.staff_id ? `${tObj.staff_id} — ` : '';
    const formTag = tObj.form_class ? ` [Form: ${tObj.form_class}]` : '';
    return `<option value="${escapeHtml(t)}">${escapeHtml(sid + t)}${escapeHtml(formTag)} (${load}p/wk)</option>`;
  }).join('');

  if (AppState.selectedTeacher && teacherNames.includes(AppState.selectedTeacher)) {
    select.value = AppState.selectedTeacher;
  } else if (teacherNames.length) {
    AppState.selectedTeacher = teacherNames[0];
    select.value = AppState.selectedTeacher;
  }
}

function renderTimetableGrid() {
  const table = document.getElementById('ttGridTable');
  if (!table) return;

  const isAdmin = AppState.currentUser && AppState.currentUser.role === 'admin';
  const mode = AppState.currentTimetableMode || 'class';
  const data = AppState.timetableData;
  if (!data) {
    table.innerHTML = '<tr><td class="p-8 text-center text-slate-400">Loading timetable data...</td></tr>';
    return;
  }

  const days = data.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const times = data.period_times || [
    "07:50 - 08:30", "08:30 - 09:10", "09:10 - 09:50", "09:50 - 10:30",
    "10:50 - 11:30", "11:30 - 12:10", "12:10 - 12:50", "12:50 - 13:30"
  ];

  if (mode === 'class') {
    const clsKey = AppState.selectedClass || '6-A';
    const clsObj = (data.classes && data.classes[clsKey]) ? data.classes[clsKey] : {};
    const formTeacher = clsObj.form_teacher || 'Not assigned';
    const formTeacherId = clsObj.form_teacher_id || '';
    const schedule = clsObj.schedule || {};

    // Update sheet header & badges
    const titleEl = document.getElementById('ttSheetTitle');
    const subtitleEl = document.getElementById('ttSheetSubtitle');
    const teacherBadge = document.getElementById('ttClassFormTeacherText');
    if (titleEl) titleEl.textContent = `Grade ${clsKey} Weekly Timetable`;
    if (subtitleEl) {
      subtitleEl.innerHTML = formTeacherId
        ? `Form Teacher: <button onclick="lookupFromTable('${escapeHtml(formTeacherId)}')" class="underline hover:text-[#800020] font-extrabold cursor-pointer" title="View Form Teacher Profile">${escapeHtml(formTeacher)} (${escapeHtml(formTeacherId)})</button>`
        : `Form Teacher: ${escapeHtml(formTeacher)}`;
    }
    if (teacherBadge) {
      teacherBadge.innerHTML = formTeacherId
        ? `Class Teacher: <button onclick="lookupFromTable('${escapeHtml(formTeacherId)}')" class="underline hover:text-[#5c0d1b] font-extrabold cursor-pointer" title="Open Staff Profile">${escapeHtml(formTeacher)} (${escapeHtml(formTeacherId)})</button>`
        : `Class Teacher: ${escapeHtml(formTeacher)}`;
    }

    let html = `
      <thead>
        <tr class="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b-2 border-slate-300">
          <th class="p-3 w-32 border-r border-slate-200">Period &amp; Time</th>
          ${days.map(d => `<th class="p-3 border-r border-slate-200 text-[#800020] font-black">${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
    `;

    for (let p = 1; p <= 8; p++) {
      if (p === 5) {
        // Morning Interval Row
        html += `
          <tr class="bg-amber-100/80 border-y-2 border-[#d4af37] text-[#5c0d1b]">
            <td colspan="6" class="py-2.5 px-4 text-center font-extrabold uppercase tracking-wide text-xs">
              ☕ Morning Interval (10:30 AM – 10:50 AM) • උදෑසන විවේක කාලය (විනාඩි 20)
            </td>
          </tr>
        `;
      }

      const pTime = times[p - 1] || '';
      html += `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="tt-time-col p-2.5 text-center font-mono">
            <div class="font-extrabold text-slate-800 text-xs">Period ${p}</div>
            <div class="text-[10px] text-slate-500 font-semibold">${pTime}</div>
          </td>
      `;

      for (const d of days) {
        const daySlots = schedule[d] || [];
        const slot = daySlots.find(s => s.period === p) || { subject: 'Free Period', teacher: '' };
        const isFree = !slot.subject || slot.subject === 'Free Period';

        html += `<td class="tt-grid-cell border-r border-slate-200 p-2.5">`;
        if (isFree) {
          html += `<span class="tt-free-pill">— Free Period —</span>`;
          if (isAdmin) {
            html += `
              <div class="mt-1.5 pt-1 border-t border-dashed border-slate-200">
                <button type="button" onclick="openAssignTeacherModal('${escapeHtml(clsKey)}', '${escapeHtml(d)}', ${p})" class="w-full text-center px-1.5 py-0.5 text-[10px] font-extrabold text-[#800020] hover:text-white hover:bg-[#800020] border border-[#800020]/30 hover:border-[#800020] rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs" title="Assign Teacher to Period">
                  ${icon('plus')} <span>Assign</span>
                </button>
              </div>
            `;
          }
        } else {
          const badgeClass = getSubjectBadgeClass(slot.subject);
          const hasValidStaffId = slot.teacher_id && slot.teacher_id.startsWith('JMV-STF-');
          html += `
            <div class="tt-subject-badge ${badgeClass} shadow-xs">
              ${escapeHtml(slot.subject)}
            </div>
            ${slot.teacher ? `
              <div class="tt-teacher-pill">
                ${icon('users')}
                ${hasValidStaffId
                  ? `<button onclick="lookupFromTable('${escapeHtml(slot.teacher_id)}')" class="hover:text-[#800020] hover:underline text-left cursor-pointer" title="View Staff Profile (${escapeHtml(slot.teacher_id)})">${escapeHtml(slot.teacher)}</button>`
                  : `<span>${escapeHtml(slot.teacher)}</span>`
                }
              </div>
            ` : ''}
          `;
          if (isAdmin) {
            html += `
              <div class="mt-1.5 pt-1 border-t border-slate-200/60 flex justify-end">
                <button type="button" onclick="openAssignTeacherModal('${escapeHtml(clsKey)}', '${escapeHtml(d)}', ${p})" class="text-[10px] font-bold text-slate-500 hover:text-[#800020] hover:bg-slate-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1" title="Change Assigned Teacher or Subject">
                  ${icon('pencil')} <span>Change</span>
                </button>
              </div>
            `;
          }
        }
        html += `</td>`;
      }

      html += `</tr>`;
    }

    html += `</tbody>`;
    table.innerHTML = html;

  } else if (mode === 'teacher') {
    const tKey = AppState.selectedTeacher || Object.keys(data.teachers || {})[0];
    const tObj = (data.teachers && data.teachers[tKey]) ? data.teachers[tKey] : {};
    const schedule = tObj.schedule || {};
    const load = tObj.teaching_load || 0;
    const staffId = tObj.staff_id || '';
    const formClass = tObj.form_class || '';
    const subjectsList = (tObj.subjects_taught || []).join(', ');

    // Update sheet header & badges
    const titleEl = document.getElementById('ttSheetTitle');
    const subtitleEl = document.getElementById('ttSheetSubtitle');
    const loadBadge = document.getElementById('ttTeacherLoadText');
    if (titleEl) {
      titleEl.textContent = `${tKey}${staffId ? ` (${staffId})` : ''} — Teaching Timetable`;
    }
    if (subtitleEl) {
      const parts = [`Weekly Load: ${load} / 40 Periods`];
      if (formClass) parts.push(`Form Teacher: Grade ${formClass}`);
      if (subjectsList) parts.push(`Subjects: ${subjectsList}`);
      subtitleEl.textContent = parts.join(' • ');
    }
    if (loadBadge) {
      loadBadge.innerHTML = `
        <span>Teaching Load: ${load} Periods/Wk</span>
        ${staffId ? `<button onclick="lookupFromTable('${escapeHtml(staffId)}')" class="ml-2 px-2 py-0.5 bg-[#800020] text-white rounded text-[10px] font-extrabold uppercase hover:bg-[#5c0d1b] cursor-pointer" title="Open Full Staff Profile">View Staff Profile</button>` : ''}
      `;
    }

    let html = `
      <thead>
        <tr class="bg-slate-100 text-slate-700 font-extrabold uppercase text-[11px] border-b-2 border-slate-300">
          <th class="p-3 w-32 border-r border-slate-200">Period &amp; Time</th>
          ${days.map(d => `<th class="p-3 border-r border-slate-200 text-[#800020] font-black">${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200">
    `;

    for (let p = 1; p <= 8; p++) {
      if (p === 5) {
        html += `
          <tr class="bg-amber-100/80 border-y-2 border-[#d4af37] text-[#5c0d1b]">
            <td colspan="6" class="py-2.5 px-4 text-center font-extrabold uppercase tracking-wide text-xs">
              ☕ Morning Interval (10:30 AM – 10:50 AM) • උදෑසන විවේක කාලය (විනාඩි 20)
            </td>
          </tr>
        `;
      }

      const pTime = times[p - 1] || '';
      html += `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="tt-time-col p-2.5 text-center font-mono">
            <div class="font-extrabold text-slate-800 text-xs">Period ${p}</div>
            <div class="text-[10px] text-slate-500 font-semibold">${pTime}</div>
          </td>
      `;

      for (const d of days) {
        const daySlots = schedule[d] || [];
        const slot = daySlots.find(s => s.period === p) || { is_free: true };

        html += `<td class="tt-grid-cell border-r border-slate-200 p-2.5">`;
        if (slot.is_free) {
          html += `<span class="tt-free-pill">Free Period</span>`;
        } else {
          const badgeClass = getSubjectBadgeClass(slot.subject);
          html += `
            <div class="mb-1">
              <button onclick="openClassInTimetableTab('${escapeHtml(slot.class_name)}')" class="tt-class-pill shadow-xs hover:bg-[#5c0d1b] cursor-pointer" title="View Class Timetable">Grade ${escapeHtml(slot.class_name)}</button>
            </div>
            <div class="tt-subject-badge ${badgeClass}">
              ${escapeHtml(slot.subject)}
            </div>
          `;
          if (isAdmin && slot.class_name) {
            html += `
              <div class="mt-1.5 pt-1 border-t border-slate-200/60 flex justify-end">
                <button type="button" onclick="openAssignTeacherModal('${escapeHtml(slot.class_name)}', '${escapeHtml(d)}', ${p})" class="text-[10px] font-bold text-slate-500 hover:text-[#800020] hover:bg-slate-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1" title="Change Assigned Teacher or Subject">
                  ${icon('pencil')} <span>Change</span>
                </button>
              </div>
            `;
          }
        }
        html += `</td>`;
      }

      html += `</tr>`;
    }

    html += `</tbody>`;
    table.innerHTML = html;
  }
}

function switchTimetableMode(mode) {
  AppState.currentTimetableMode = mode;

  const btnClass = document.getElementById('ttModeClassBtn');
  const btnTeacher = document.getElementById('ttModeTeacherBtn');
  const btnTable = document.getElementById('ttModeTableBtn');

  const classSel = document.getElementById('ttClassSelectorContainer');
  const teacherSel = document.getElementById('ttTeacherSelectorContainer');
  const tableFilter = document.getElementById('ttTableFilterContainer');

  const classBadge = document.getElementById('ttClassFormTeacherBadge');
  const teacherBadge = document.getElementById('ttTeacherLoadBadge');

  const gridView = document.getElementById('timetableGridView');
  const tableView = document.getElementById('timetableTableView');

  [btnClass, btnTeacher, btnTable].forEach(b => {
    if (b) {
      b.className = 'px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all text-slate-600 hover:text-[#800020] flex items-center gap-1.5 cursor-pointer';
    }
  });

  if (mode === 'class') {
    if (btnClass) btnClass.className = 'px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all bg-[#800020] text-white shadow-sm flex items-center gap-1.5 cursor-pointer';
    if (classSel) classSel.classList.remove('hidden');
    if (teacherSel) teacherSel.classList.add('hidden');
    if (tableFilter) tableFilter.classList.add('hidden');
    if (classBadge) classBadge.classList.remove('hidden');
    if (teacherBadge) teacherBadge.classList.add('hidden');
    if (gridView) gridView.classList.remove('hidden');
    if (tableView) tableView.classList.add('hidden');
    renderTimetableGrid();
  } else if (mode === 'teacher') {
    if (btnTeacher) btnTeacher.className = 'px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all bg-[#800020] text-white shadow-sm flex items-center gap-1.5 cursor-pointer';
    if (classSel) classSel.classList.add('hidden');
    if (teacherSel) teacherSel.classList.remove('hidden');
    if (tableFilter) tableFilter.classList.add('hidden');
    if (classBadge) classBadge.classList.add('hidden');
    if (teacherBadge) teacherBadge.classList.remove('hidden');
    if (gridView) gridView.classList.remove('hidden');
    if (tableView) tableView.classList.add('hidden');
    renderTimetableGrid();
  } else if (mode === 'table') {
    if (btnTable) btnTable.className = 'px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all bg-[#800020] text-white shadow-sm flex items-center gap-1.5 cursor-pointer';
    if (classSel) classSel.classList.add('hidden');
    if (teacherSel) teacherSel.classList.add('hidden');
    if (tableFilter) tableFilter.classList.remove('hidden');
    if (classBadge) classBadge.classList.add('hidden');
    if (teacherBadge) teacherBadge.classList.add('hidden');
    if (gridView) gridView.classList.add('hidden');
    if (tableView) tableView.classList.remove('hidden');
    renderTimetableTable(AppState.timetableList);
  }
}

function onTimetableClassChange(className) {
  AppState.selectedClass = className;
  AppState.userHasManuallySelectedTimetable = true;
  renderTimetableGrid();
}

function onTimetableTeacherChange(teacherName) {
  AppState.selectedTeacher = teacherName;
  AppState.userHasManuallySelectedTimetable = true;
  renderTimetableGrid();
}

function printTimetable() {
  window.print();
}

function toggleTimetableForm() {
  const form = document.getElementById('timetableForm');
  if (form) form.classList.toggle('hidden');
}

function cancelTimetableForm() {
  const form = document.getElementById('timetableForm');
  if (form) {
    form.reset();
    form.classList.add('hidden');
  }
  const idInput = document.getElementById('timetableEntryId');
  if (idInput) idInput.value = '';
}

function renderTimetableTable(entries) {
  const u = AppState.currentUser;
  const isTeacher = u && u.role === 'teacher';
  const tbody = document.getElementById('timetableTableBody');
  const filterMode = document.getElementById('timetableFilterMode');
  const mode = filterMode ? filterMode.value : (isTeacher ? 'my' : 'all');

  let list = entries || [];
  if (mode === 'my' && u) {
    const myName = (u.full_name || '').toLowerCase();
    const myStaffId = (u.staff_id || '').toLowerCase();
    const myUser = (u.username || '').toLowerCase();
    list = list.filter(e => {
      const tId = (e.teacher_id || '').toLowerCase();
      const tName = (e.teacher_name || '').toLowerCase();
      return (myStaffId && tId === myStaffId) ||
             (tName && (tName.includes(myName) || myName.includes(tName))) ||
             (tId && tId.includes(myUser));
    });
  }

  if (!tbody) return;
  if (!list.length) {
    const emptyMsg = (mode === 'my' && isTeacher)
      ? 'No timetable slots assigned to your teaching profile yet.'
      : 'No timetable entries have been created.';
    tbody.innerHTML = `<tr><td colspan="${isTeacher ? 5 : 6}" class="p-8 text-center text-slate-500">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(entry => `
    <tr>
      <td class="p-3 font-semibold">${escapeHtml(entry.class_name)}</td>
      <td class="p-3">${escapeHtml(entry.day_of_week)}</td>
      <td class="p-3">Period ${entry.period_no}</td>
      <td class="p-3">${escapeHtml(entry.subject)}</td>
      <td class="p-3">${escapeHtml(entry.teacher_name)}</td>
      ${!isTeacher ? `
      <td class="p-3 text-right whitespace-nowrap">
        <button onclick="editTimetableEntryById('${escapeHtml(entry.id)}')" class="text-[#800020] font-bold text-xs mr-3 cursor-pointer">${icon('edit')} Edit</button>
        <button onclick="deleteTimetableEntry('${escapeHtml(entry.id)}')" class="text-red-700 font-bold text-xs cursor-pointer">${icon('trash')} Delete</button>
      </td>` : ''}
    </tr>`).join('');
}

async function saveTimetableEntry(event) {
  event.preventDefault();
  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can create or modify timetable entries.", "error");
    return;
  }
  const id = document.getElementById('timetableEntryId').value;
  const payload = {
    id: id || undefined,
    class_name: document.getElementById('timetableClass').value,
    day_of_week: document.getElementById('timetableDay').value,
    period_no: Number(document.getElementById('timetablePeriod').value),
    subject: document.getElementById('timetableSubject').value,
    teacher_id: document.getElementById('timetableTeacher').value
  };
  try {
    const response = await fetch(id ? `/api/timetable/${encodeURIComponent(id)}` : '/api/timetable', {
      method: id ? 'PUT' : 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save timetable entry.');
    showToast('Timetable entry saved.', 'success');
    cancelTimetableForm();
    loadTimetable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function editTimetableEntry(entry) {
  if (entry) {
    openAssignTeacherModal(entry.class_name, entry.day_of_week, entry.period_no);
  }
}

function editTimetableEntryById(id) {
  const entry = AppState.timetableList.find(item => String(item.id) === String(id));
  if (entry) {
    openAssignTeacherModal(entry.class_name, entry.day_of_week, entry.period_no);
  }
}

async function deleteTimetableEntry(id) {
  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can delete timetable entries.", "error");
    return;
  }
  if (!confirm('Delete this timetable entry?')) return;
  try {
    const response = await fetch(`/api/timetable/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to delete timetable entry.');
    showToast('Timetable entry deleted.', 'success');
    loadTimetable();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function resetTimetableForm() {
  cancelTimetableForm();
}

/* --------------------------------------------------------------------------
   Timetable Dynamic Database Sync & Period Teacher Assignment
   -------------------------------------------------------------------------- */

function applyDbTimetableToClasses(timetableData, dbEntries) {
  if (!timetableData || !Array.isArray(dbEntries) || !dbEntries.length) return;
  if (!timetableData.classes) timetableData.classes = {};
  if (!timetableData.teachers) timetableData.teachers = {};

  dbEntries.forEach(entry => {
    const clsKey = entry.class_name;
    const day = entry.day_of_week;
    const p = parseInt(entry.period_no, 10);
    const subject = entry.subject || '';
    const tId = entry.teacher_id || '';
    const tName = entry.teacher_name || '';
    const isFree = (!tId || tId === 'FREE' || !subject || subject.toLowerCase() === 'free period');

    // 1. Update Class Schedule
    if (!timetableData.classes[clsKey]) {
      timetableData.classes[clsKey] = { schedule: {} };
    }
    if (!timetableData.classes[clsKey].schedule) {
      timetableData.classes[clsKey].schedule = {};
    }
    if (!timetableData.classes[clsKey].schedule[day]) {
      timetableData.classes[clsKey].schedule[day] = [];
    }

    const classDaySlots = timetableData.classes[clsKey].schedule[day];
    let slot = classDaySlots.find(s => s.period === p);
    if (!slot) {
      slot = { period: p };
      classDaySlots.push(slot);
      classDaySlots.sort((a, b) => a.period - b.period);
    }
    slot.id = entry.id;
    slot.subject = isFree ? 'Free Period' : subject;
    slot.teacher = isFree ? '' : tName;
    slot.teacher_id = isFree ? '' : tId;

    // 2. Synchronize Teacher Schedules
    Object.values(timetableData.teachers).forEach(tObj => {
      if (tObj && tObj.schedule && tObj.schedule[day]) {
        const tSlot = tObj.schedule[day].find(s => s.period === p);
        if (tSlot && tSlot.class_name === clsKey) {
          tSlot.is_free = true;
          tSlot.subject = '';
          tSlot.class_name = '';
        }
      }
    });

    if (!isFree && (tName || tId)) {
      let tObj = timetableData.teachers[tName];
      if (!tObj) {
        for (const k of Object.keys(timetableData.teachers)) {
          if (timetableData.teachers[k].staff_id && timetableData.teachers[k].staff_id === tId) {
            tObj = timetableData.teachers[k];
            break;
          }
        }
      }

      if (tObj) {
        if (!tObj.schedule) tObj.schedule = {};
        if (!tObj.schedule[day]) tObj.schedule[day] = [];
        let tSlot = tObj.schedule[day].find(s => s.period === p);
        if (!tSlot) {
          tSlot = { period: p };
          tObj.schedule[day].push(tSlot);
          tObj.schedule[day].sort((a, b) => a.period - b.period);
        }
        tSlot.is_free = false;
        tSlot.subject = subject;
        tSlot.class_name = clsKey;
        tSlot.id = entry.id;
      }
    }
  });

  // 3. Recalculate teaching load for all teachers
  Object.values(timetableData.teachers).forEach(tObj => {
    if (tObj && tObj.schedule) {
      let count = 0;
      for (const d of Object.keys(tObj.schedule)) {
        const slots = tObj.schedule[d] || [];
        count += slots.filter(s => !s.is_free && s.subject && s.subject !== 'Free Period').length;
      }
      tObj.teaching_load = count;
    }
  });
}

function openAssignTeacherModal(className, dayName, periodNo) {
  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can assign or reassign teachers.", "error");
    return;
  }

  const modal = document.getElementById('assignTeacherModal');
  if (!modal) return;

  const idInput = document.getElementById('assignSlotId');
  const classInput = document.getElementById('assignSlotClass');
  const dayInput = document.getElementById('assignSlotDay');
  const periodInput = document.getElementById('assignSlotPeriod');
  const contextText = document.getElementById('assignSlotContextText');
  const timeBadge = document.getElementById('assignSlotTimeBadge');
  const subjectInput = document.getElementById('assignSlotSubjectInput');
  const overlapCheck = document.getElementById('assignAllowOverlapCheckbox');
  const conflictBanner = document.getElementById('assignTeacherConflictBanner');

  const pNum = parseInt(periodNo, 10);
  const clsObj = AppState.timetableData?.classes?.[className];
  const daySlots = clsObj?.schedule?.[dayName] || [];
  const slot = daySlots.find(s => s.period === pNum) || {};

  const currentSubject = slot.subject || '';
  const currentTeacherId = slot.teacher_id || '';
  const currentTeacherName = slot.teacher || '';
  const slotId = slot.id || '';

  if (idInput) idInput.value = slotId;
  if (classInput) classInput.value = className;
  if (dayInput) dayInput.value = dayName;
  if (periodInput) periodInput.value = pNum;

  if (contextText) {
    contextText.textContent = `Grade ${className} • ${dayName} • Period ${pNum}`;
  }

  const times = AppState.timetableData?.period_times || [
    "07:50 - 08:30", "08:30 - 09:10", "09:10 - 09:50", "09:50 - 10:30",
    "10:50 - 11:30", "11:30 - 12:10", "12:10 - 12:50", "12:50 - 13:30"
  ];
  if (timeBadge) {
    timeBadge.textContent = times[pNum - 1] || `Period ${pNum}`;
  }

  const isFree = (!currentSubject || currentSubject === 'Free Period');
  if (subjectInput) {
    subjectInput.value = isFree ? '' : currentSubject;
  }

  if (overlapCheck) overlapCheck.checked = false;
  if (conflictBanner) conflictBanner.classList.add('hidden');

  populateAssignModalTeacherSelect(currentTeacherId, currentTeacherName);

  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');

  checkPeriodConflict();
}

function populateAssignModalTeacherSelect(selectedId, selectedName) {
  const select = document.getElementById('assignSlotTeacherSelect');
  if (!select) return;

  const staffMap = new Map();

  // Add from timetable data teachers
  const ttTeachers = AppState.timetableData?.teachers || {};
  Object.keys(ttTeachers).forEach(name => {
    const t = ttTeachers[name];
    const sId = t.staff_id || name;
    staffMap.set(sId, {
      id: sId,
      name: name,
      load: t.teaching_load || 0,
      dept: t.department || ''
    });
  });

  // Add from AppState.staffList (active database staff)
  if (Array.isArray(AppState.staffList)) {
    AppState.staffList.forEach(s => {
      if (s.id) {
        const existing = staffMap.get(s.id);
        const name = s.name_with_initials || s.full_name || s.id;
        staffMap.set(s.id, {
          id: s.id,
          name: name,
          load: existing ? existing.load : 0,
          dept: s.department || (existing ? existing.dept : '')
        });
      }
    });
  }

  const sortedStaff = Array.from(staffMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  let html = `
    <option value="">-- Select Teacher --</option>
    <option value="FREE">— Free Period (No Teacher Assigned) —</option>
  `;

  sortedStaff.forEach(s => {
    const sidLabel = (s.id && s.id.startsWith('JMV-STF-')) ? `${s.id} — ` : '';
    const loadLabel = s.load !== undefined ? ` (${s.load}p/wk)` : '';
    html += `<option value="${escapeHtml(s.id)}" data-teacher-name="${escapeHtml(s.name)}">${escapeHtml(sidLabel + s.name)}${loadLabel}</option>`;
  });

  select.innerHTML = html;

  if (!selectedId || selectedId === 'FREE' || selectedName === 'Free Period') {
    select.value = 'FREE';
  } else {
    select.value = selectedId;
    if (!select.value && selectedName) {
      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (opt.getAttribute('data-teacher-name') === selectedName || opt.text.includes(selectedName)) {
          select.selectedIndex = i;
          break;
        }
      }
    }
  }
}

function onAssignTeacherSelectChange() {
  const select = document.getElementById('assignSlotTeacherSelect');
  const subjectInput = document.getElementById('assignSlotSubjectInput');
  if (!select) return;

  if (select.value === 'FREE') {
    if (subjectInput && !subjectInput.value) {
      subjectInput.value = 'Free Period';
    }
  } else if (subjectInput && subjectInput.value === 'Free Period') {
    subjectInput.value = '';
  }

  checkPeriodConflict();
}

function checkPeriodConflict() {
  const teacherSelect = document.getElementById('assignSlotTeacherSelect');
  const className = document.getElementById('assignSlotClass')?.value;
  const dayName = document.getElementById('assignSlotDay')?.value;
  const periodNo = parseInt(document.getElementById('assignSlotPeriod')?.value, 10);
  const banner = document.getElementById('assignTeacherConflictBanner');
  const msgEl = document.getElementById('assignTeacherConflictMsg');

  if (!banner || !msgEl) return;

  if (!teacherSelect || !teacherSelect.value || teacherSelect.value === 'FREE') {
    banner.classList.add('hidden');
    return;
  }

  const selectedTeacherId = teacherSelect.value;
  const selectedTeacherOpt = teacherSelect.options[teacherSelect.selectedIndex];
  const selectedTeacherName = selectedTeacherOpt?.getAttribute('data-teacher-name') || selectedTeacherOpt?.text || selectedTeacherId;

  const data = AppState.timetableData;
  if (!data) {
    banner.classList.add('hidden');
    return;
  }

  let teacherObj = data.teachers ? data.teachers[selectedTeacherName] : null;
  if (!teacherObj && data.teachers) {
    for (const k of Object.keys(data.teachers)) {
      if (data.teachers[k].staff_id && data.teachers[k].staff_id === selectedTeacherId) {
        teacherObj = data.teachers[k];
        break;
      }
    }
  }

  let conflictingClass = '';
  let conflictingSubject = '';

  if (teacherObj && teacherObj.schedule && teacherObj.schedule[dayName]) {
    const slot = teacherObj.schedule[dayName].find(s => s.period === periodNo);
    if (slot && !slot.is_free && slot.class_name && slot.class_name !== className) {
      conflictingClass = slot.class_name;
      conflictingSubject = slot.subject || 'Class';
    }
  }

  if (conflictingClass) {
    msgEl.innerHTML = `<strong>${escapeHtml(selectedTeacherName)}</strong> is already assigned to <strong>Grade ${escapeHtml(conflictingClass)}</strong> (${escapeHtml(conflictingSubject)}) on ${escapeHtml(dayName)} Period ${periodNo}.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function setSlotAsFreePeriod() {
  const subjectInput = document.getElementById('assignSlotSubjectInput');
  const teacherSelect = document.getElementById('assignSlotTeacherSelect');
  if (subjectInput) subjectInput.value = 'Free Period';
  if (teacherSelect) teacherSelect.value = 'FREE';
  const conflictBanner = document.getElementById('assignTeacherConflictBanner');
  if (conflictBanner) conflictBanner.classList.add('hidden');

  const form = document.getElementById('assignTeacherForm');
  if (form) {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }
}

async function handleAssignTeacherSubmit(e) {
  e.preventDefault();

  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can assign or reassign teachers.", "error");
    return;
  }

  const slotId = document.getElementById('assignSlotId')?.value || '';
  const className = document.getElementById('assignSlotClass')?.value || '';
  const dayName = document.getElementById('assignSlotDay')?.value || '';
  const periodNo = parseInt(document.getElementById('assignSlotPeriod')?.value || '0', 10);
  const subjectInput = document.getElementById('assignSlotSubjectInput');
  const teacherSelect = document.getElementById('assignSlotTeacherSelect');
  const overlapCheck = document.getElementById('assignAllowOverlapCheckbox');
  const submitBtn = document.getElementById('assignTeacherSubmitBtn');

  let subject = subjectInput ? subjectInput.value.trim() : '';
  let teacherId = teacherSelect ? teacherSelect.value : '';
  const isFree = (teacherId === 'FREE' || !teacherId || subject.toLowerCase() === 'free' || subject.toLowerCase() === 'free period');

  let teacherName = '';
  if (isFree) {
    subject = 'Free Period';
    teacherId = 'FREE';
    teacherName = 'Free Period';
  } else {
    if (!subject) {
      showToast("Please enter a subject for this period.", "error");
      if (subjectInput) subjectInput.focus();
      return;
    }
    if (!teacherId) {
      showToast("Please select a teacher from the dropdown.", "error");
      if (teacherSelect) teacherSelect.focus();
      return;
    }
    const opt = teacherSelect.options[teacherSelect.selectedIndex];
    teacherName = opt?.getAttribute('data-teacher-name') || opt?.text || teacherId;
    if (teacherName.includes('—')) {
      teacherName = teacherName.split('—')[1].trim();
    }
    if (teacherName.includes('(')) {
      teacherName = teacherName.split('(')[0].trim();
    }
  }

  const allowOverlap = overlapCheck ? overlapCheck.checked : false;

  const conflictBanner = document.getElementById('assignTeacherConflictBanner');
  if (conflictBanner && !conflictBanner.classList.contains('hidden') && !allowOverlap && !isFree) {
    showToast("Schedule conflict detected! Check 'Allow overlapping assignment' to proceed.", "warning");
    if (overlapCheck) overlapCheck.focus();
    return;
  }

  const payload = {
    id: slotId || undefined,
    class_name: className,
    day_of_week: dayName,
    period_no: periodNo,
    subject: subject,
    teacher_id: teacherId,
    teacher_name: teacherName,
    allow_overlap: allowOverlap,
    force: allowOverlap
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `${icon('spinner')} <span>Saving...</span>`;
  }

  try {
    const res = await fetch('/api/timetable', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to update timetable assignment.');
    }

    if (AppState.timetableData) {
      applyDbTimetableToClasses(AppState.timetableData, [result]);
    }

    if (Array.isArray(AppState.timetableList)) {
      const existingIdx = AppState.timetableList.findIndex(entry =>
        String(entry.id) === String(result.id) ||
        (entry.class_name === result.class_name && entry.day_of_week === result.day_of_week && Number(entry.period_no) === Number(result.period_no))
      );
      if (existingIdx >= 0) {
        AppState.timetableList[existingIdx] = result;
      } else {
        AppState.timetableList.push(result);
      }
    }

    closeModals();
    populateTimetableTeacherSelect();

    if (AppState.currentTimetableMode === 'table') {
      renderTimetableTable(AppState.timetableList);
    } else {
      renderTimetableGrid();
    }

    const toastMsg = isFree
      ? `Grade ${className} • ${dayName} Period ${periodNo} set as Free Period.`
      : `Assigned ${teacherName} for Grade ${className} (${subject}) on ${dayName} Period ${periodNo}!`;
    showToast(toastMsg, "success");

  } catch (err) {
    console.error("Save timetable error:", err);
    showToast(err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg class="ui-icon text-amber-300" aria-hidden="true"><use href="#icon-check"></use></svg> <span>Save Assignment</span>`;
    }
  }
}

/* --------------------------------------------------------------------------
   Instant Universal ID Search & Live Typeahead
   -------------------------------------------------------------------------- */
let debounceTimer = null;

function initUniversalSearch() {
  const searchInput = document.getElementById('universalSearchInput');
  const searchBtn = document.getElementById('universalSearchBtn');
  const clearBtn = document.getElementById('clearSearchBtn');
  const dropdown = document.getElementById('searchSuggestionsDropdown');

  if (!searchInput) return;

  // Input typing for auto-complete
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    clearTimeout(debounceTimer);
    if (!val) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(val)}`, { headers: getAuthHeaders() });
        const suggestions = await res.json();
        renderSuggestions(suggestions, dropdown);
      } catch (err) {
        console.error("Suggestion error:", err);
      }
    }, 200);
  });

  // Keydown enter
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (dropdown) dropdown.classList.add('hidden');
      executeLookup(searchInput.value.trim());
    }
  });

  // Search button click
  searchBtn.addEventListener('click', () => {
    if (dropdown) dropdown.classList.add('hidden');
    executeLookup(searchInput.value.trim());
  });

  // Clear button click
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      if (dropdown) dropdown.classList.add('hidden');
      searchInput.focus();
    });
  }

  // Hide dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function renderSuggestions(suggestions, dropdown) {
  if (!dropdown) return;
  if (!suggestions || suggestions.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.innerHTML = suggestions.map(item => `
    <div class="suggestion-item flex items-center gap-3 p-3 hover:bg-[#fdf2f4] border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors" data-id="${item.id}">
      <img src="${item.photo_url}" class="w-10 h-10 rounded-full object-cover border-2 border-[#d4af37]" alt="${item.title}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=5c0d1b&color=fff'">
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm text-slate-800 truncate">${escapeHtml(item.title)} <span class="font-mono text-xs text-[#800020] ml-1">(${item.id})</span></div>
        <div class="text-xs text-slate-500 truncate">${escapeHtml(item.subtitle)}</div>
      </div>
      <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${item.type === 'student' ? 'bg-[#fdf2f4] text-[#800020] border border-rose-200' : 'bg-[#d4af37]/20 text-[#38050b] border border-[#d4af37]'}">
        ${item.type}
      </span>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');

  dropdown.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      document.getElementById('universalSearchInput').value = id;
      dropdown.classList.add('hidden');
      executeLookup(id);
    });
  });
}

function initQuickPills() {
  document.querySelectorAll('.sample-id-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.getAttribute('data-id');
      const input = document.getElementById('universalSearchInput');
      if (input) input.value = id;
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.style.display = 'block';
      switchTab('lookup');
      executeLookup(id);
    });
  });
}

/* --------------------------------------------------------------------------
   Execute ID Lookup & Display (Safely preserves DOM container structure)
   -------------------------------------------------------------------------- */
async function executeLookup(queryId) {
  if (!queryId) {
    showToast("Please enter an admission number, staff ID, or EPF number.", "error");
    return;
  }

  const resultContainer = document.getElementById('lookupResultSection');
  const loadingEl = document.getElementById('idCardLoading');
  const notFoundEl = document.getElementById('idCardNotFound');
  const dossierView = document.getElementById('idCardDossierView');

  if (!resultContainer) return;

  resultContainer.classList.remove('hidden');
  resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Show loading state, hide other views
  if (notFoundEl) notFoundEl.classList.add('hidden');
  if (dossierView) dossierView.classList.add('hidden');
  if (loadingEl) {
    const targetText = document.getElementById('loadingTargetText');
    if (targetText) targetText.textContent = `Verifying identity for: ${queryId}`;
    loadingEl.classList.remove('hidden');
  }

  try {
    const [, res] = await Promise.all([
      ensureTimetableDataLoaded(),
      fetch(`/api/lookup?id=${encodeURIComponent(queryId)}`, { headers: getAuthHeaders() })
    ]);
    const data = await res.json();

    if (loadingEl) loadingEl.classList.add('hidden');

    if (data.found) {
      AppState.currentEntity = data.data;
      AppState.currentEntityType = data.type;
      renderResult(data.data, data.type);
    } else {
      if (notFoundEl) {
        const msgText = document.getElementById('notFoundMsgText');
        if (msgText) msgText.innerHTML = `No student or faculty member found matching: <strong class="font-mono text-slate-800">${escapeHtml(queryId)}</strong>`;
        notFoundEl.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error("Lookup error:", err);
    if (loadingEl) loadingEl.classList.add('hidden');
    showToast("Server connection error during search", "error");
  }
}

function renderResult(item, type) {
  const isStudent = type === 'student';
  const typeBadge = document.getElementById('resultTypeBadge');
  if (typeBadge) {
    typeBadge.textContent = isStudent ? 'Student Profile' : 'Faculty Profile';
    typeBadge.className = isStudent 
      ? 'bg-[#5c0d1b] text-white text-xs font-extrabold uppercase px-3 py-1 rounded border border-[#d4af37]/40' 
      : 'bg-[#d4af37] text-[#38050b] text-xs font-extrabold uppercase px-3 py-1 rounded border border-[#c59b27]';
  }

  // Render Dossier View (Comprehensive Record)
  renderDossier(item, type);

  // Ensure dossier view is visible
  const dossierView = document.getElementById('idCardDossierView');
  if (dossierView) dossierView.classList.remove('hidden');
}

/* --------------------------------------------------------------------------
   Student Education Level & Subject Selection Handlers
   -------------------------------------------------------------------------- */
function findMatchingSubject(subjectsStr, candidates) {
  if (!subjectsStr) return '';
  for (const c of candidates) {
    if (subjectsStr.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return '';
}

function handleEducationLevelChange() {
  const level = document.getElementById('studentAcademicLevelInput')?.value || '';
  const olContainer = document.getElementById('olSubjectsContainer');
  const alContainer = document.getElementById('alSubjectsContainer');
  const noticeEl = document.getElementById('generalCurriculumNotice');
  const noticeText = document.getElementById('generalCurriculumText');
  const streamInput = document.getElementById('studentStreamInput');

  if (olContainer) olContainer.classList.add('hidden');
  if (alContainer) alContainer.classList.add('hidden');
  if (noticeEl) noticeEl.classList.add('hidden');

  if (level === 'Ordinary Level') {
    if (olContainer) olContainer.classList.remove('hidden');
    if (streamInput) streamInput.value = 'Senior Secondary (G.C.E. O/L)';
  } else if (level === 'Advanced Level') {
    if (alContainer) alContainer.classList.remove('hidden');
    handleAlStreamChange();
  } else if (level) {
    if (noticeEl) {
      noticeEl.classList.remove('hidden');
      const msgs = {
        'Primary': 'Primary Section Curriculum (Grades 1–5): Core languages, Mathematics, Environment Related Activities, Religion & Aesthetic Studies.',
        'Grade 6 - 9': 'Junior Secondary Curriculum (Grades 6–9): Common national core curriculum covering 9 prescribed subjects.',
        '13 Years Guaranteed Education Program': '13-YGEP Curriculum: Applied vocational subjects & specialized skills training modules (වසර 13ක අඛණ්ඩ අධ්‍යාපන වැඩසටහන).'
      };
      if (noticeText) noticeText.textContent = msgs[level] || 'Standard curriculum applied for this level.';
    }
    if (streamInput) streamInput.value = level;
  }
}

function handleAlStreamChange() {
  const stream = document.getElementById('alStreamInput')?.value || '';
  const commerceSection = document.getElementById('alCommerceSection');
  const artSection = document.getElementById('alArtSection');
  const streamInput = document.getElementById('studentStreamInput');

  if (commerceSection) commerceSection.classList.add('hidden');
  if (artSection) artSection.classList.add('hidden');

  if (stream === 'Commerce') {
    if (commerceSection) commerceSection.classList.remove('hidden');
    if (streamInput) streamInput.value = 'Commerce Stream (A/L)';
  } else if (stream === 'Art') {
    if (artSection) artSection.classList.remove('hidden');
    if (streamInput) streamInput.value = 'Art Stream (A/L)';
  }
  updateAlSubjectCounters();
}

function updateAlSubjectCounters() {
  // Commerce Counter
  const comChecked = Array.from(document.querySelectorAll('input[name="alCommerceSubject"]:checked'));
  const comCounter = document.getElementById('alCommerceCounter');
  if (comCounter) {
    comCounter.textContent = `${comChecked.length} of 3 Selected`;
    if (comChecked.length === 3) {
      comCounter.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300';
      document.querySelectorAll('input[name="alCommerceSubject"]:not(:checked)').forEach(cb => cb.disabled = true);
    } else {
      comCounter.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300';
      document.querySelectorAll('input[name="alCommerceSubject"]').forEach(cb => cb.disabled = false);
    }
  }

  // Art Counter
  const artChecked = Array.from(document.querySelectorAll('input[name="alArtSubject"]:checked'));
  const artCounter = document.getElementById('alArtCounter');
  if (artCounter) {
    artCounter.textContent = `${artChecked.length} of 3 Selected`;
    if (artChecked.length === 3) {
      artCounter.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300';
      document.querySelectorAll('input[name="alArtSubject"]:not(:checked)').forEach(cb => cb.disabled = true);
    } else {
      artCounter.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300';
      document.querySelectorAll('input[name="alArtSubject"]').forEach(cb => cb.disabled = false);
    }
  }
}

/* --------------------------------------------------------------------------
   Student House Auto-Assignment (Admission No mod 3)
   mod 0 = Mayura
   mod 1 = Thisara
   mod 2 = Paravi
   -------------------------------------------------------------------------- */
function getHouseFromAdmission(admissionNo) {
  if (!admissionNo) return 'Thisara';
  const digits = String(admissionNo).replace(/\D/g, '');
  if (!digits) return 'Thisara';
  try {
    const mod = Number(BigInt(digits) % 3n);
    if (mod === 0) return 'Mayura';
    if (mod === 1) return 'Thisara';
    if (mod === 2) return 'Paravi';
  } catch (e) {
    const num = parseInt(digits, 10);
    if (!isNaN(num)) {
      const mod = num % 3;
      if (mod === 0) return 'Mayura';
      if (mod === 1) return 'Thisara';
      if (mod === 2) return 'Paravi';
    }
  }
  return 'Thisara';
}

function autoAssignHouseFromAdmission() {
  const admInput = document.getElementById('studentAdmissionInput');
  const houseSelect = document.getElementById('studentHouseInput');
  const badge = document.getElementById('houseAutoCalcBadge');
  const hint = document.getElementById('houseCalcHint');
  if (!admInput || !houseSelect) return;

  const rawVal = admInput.value.trim();
  const digits = rawVal.replace(/\D/g, '');

  if (!digits) {
    if (badge) {
      badge.textContent = 'Admission % 3';
      badge.className = 'text-[10px] text-amber-800 font-bold bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded';
    }
    if (hint) {
      hint.innerHTML = 'Auto-calculated from Admission No mod 3: 0 = Mayura, 1 = Thisara, 2 = Paravi';
    }
    return;
  }

  const house = getHouseFromAdmission(rawVal);
  const mod = Number(BigInt(digits) % 3n);
  houseSelect.value = house;

  const meta = {
    'Mayura': { sinhala: 'මයුර', colorName: 'Blue', style: 'bg-blue-100 text-blue-900 border-blue-300' },
    'Thisara': { sinhala: 'තිසර', colorName: 'Green', style: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
    'Paravi': { sinhala: 'පරවි', colorName: 'Yellow', style: 'bg-yellow-100 text-yellow-900 border-yellow-400' }
  }[house] || { sinhala: house, colorName: '', style: 'bg-slate-100 text-slate-800 border-slate-300' };

  if (badge) {
    badge.textContent = `Mod ${mod} → ${house} (${meta.colorName})`;
    badge.className = `text-[10px] font-bold border px-1.5 py-0.5 rounded ${meta.style}`;
  }
  if (hint) {
    hint.innerHTML = `Calculated: <span class="font-mono font-bold text-slate-700">${digits}</span> % 3 = <span class="font-extrabold text-[#800020]">${mod}</span> &rarr; Assigned to <span class="font-extrabold text-[#800020]">${house} House (${meta.sinhala} නිවාසය • ${meta.colorName})</span>`;
  }
}

function renderDossierSubjects(item) {
  const level = item.academic_level || (item.stream?.includes('O/L') ? 'Ordinary Level' : (item.stream?.includes('A/L') ? 'Advanced Level' : ''));
  
  if (level === 'Ordinary Level' || item.ol_bucket_1 || item.ol_bucket_2 || item.ol_bucket_3) {
    return `
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-slate-500 uppercase">Educational Stage:</span>
          <span class="font-extrabold text-[#800020] text-xs">G.C.E. Ordinary Level (O/L)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
          <div class="p-2.5 bg-white border border-amber-300 rounded-lg shadow-sm">
            <span class="block text-[10px] font-bold text-amber-800 uppercase mb-0.5">1st Bucket Subject</span>
            <span class="font-extrabold text-slate-800">${escapeHtml(item.ol_bucket_1 || 'Not recorded')}</span>
          </div>
          <div class="p-2.5 bg-white border border-amber-300 rounded-lg shadow-sm">
            <span class="block text-[10px] font-bold text-amber-800 uppercase mb-0.5">2nd Bucket Subject</span>
            <span class="font-extrabold text-slate-800">${escapeHtml(item.ol_bucket_2 || 'Not recorded')}</span>
          </div>
          <div class="p-2.5 bg-white border border-amber-300 rounded-lg shadow-sm">
            <span class="block text-[10px] font-bold text-amber-800 uppercase mb-0.5">3rd Bucket Subject</span>
            <span class="font-extrabold text-slate-800">${escapeHtml(item.ol_bucket_3 || 'Not recorded')}</span>
          </div>
        </div>
      </div>
    `;
  } else if (level === 'Advanced Level' || item.stream?.includes('Commerce') || item.stream?.includes('Art')) {
    const isCommerce = item.stream?.includes('Commerce');
    const isArt = item.stream?.includes('Art');
    const streamName = isCommerce ? 'Commerce Stream (වාණිජ අංශය)' : (isArt ? 'Art Stream (කලා අංශය)' : (item.stream || 'A/L Stream'));
    const subjList = item.subjects ? item.subjects.split(',').map(s => s.trim()).filter(s => s && !s.toLowerCase().includes('english') && !s.toLowerCase().includes('mandatory')) : [];

    return `
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold text-slate-500 uppercase">Educational Stage:</span>
            <span class="font-extrabold text-blue-900 text-xs">G.C.E. Advanced Level (A/L) • ${escapeHtml(streamName)}</span>
          </div>
          <span class="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded border border-emerald-300">
            ✓ General English (Compulsory)
          </span>
        </div>
        <div class="flex flex-wrap gap-2 pt-1 text-xs">
          <span class="px-3 py-1 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded font-bold">
            English (Compulsory)
          </span>
          ${subjList.length > 0 ? subjList.map(s => `
            <span class="px-3 py-1 bg-white text-slate-800 border border-slate-300 rounded font-bold shadow-sm">
              ${escapeHtml(s)}
            </span>
          `).join('') : `
            <span class="text-slate-400 italic">Subjects recorded: ${escapeHtml(item.subjects || 'General Curriculum')}</span>
          `}
        </div>
      </div>
    `;
  } else if (level === 'Primary') {
    return `
      <div class="text-xs text-slate-700 space-y-1">
        <span class="font-extrabold text-[#800020] block">Primary Section Curriculum (Grades 1–5)</span>
        <p class="text-slate-500">Enrolled in prescribed foundational curriculum: Languages, Mathematics, Environment Related Activities, Religion &amp; Creative Arts.</p>
      </div>
    `;
  } else if (level === 'Grade 6 - 9') {
    return `
      <div class="text-xs text-slate-700 space-y-1">
        <span class="font-extrabold text-[#800020] block">Junior Secondary Curriculum (Grades 6–9)</span>
        <p class="text-slate-500">Enrolled in common 9-subject national curriculum: Sinhala, English, Mathematics, Science, History, Religion, Geography, Health &amp; Aesthetics.</p>
      </div>
    `;
  } else if (level === '13 Years Guaranteed Education Program') {
    return `
      <div class="text-xs text-slate-700 space-y-1">
        <span class="font-extrabold text-[#800020] block">13 Years Guaranteed Education Program (13-YGEP)</span>
        <p class="text-slate-500">Enrolled in specialized vocational foundation &amp; career skills modules (වසර 13ක අඛණ්ඩ අධ්‍යාපන වැඩසටහන).</p>
      </div>
    `;
  } else {
    return `
      <div class="text-xs text-slate-500 italic">
        ${escapeHtml(item.subjects || item.stream || 'Standard Institutional Curriculum')}
      </div>
    `;
  }
}

function renderStaffDossierTimetable(item, ttProfile) {
  if (!ttProfile || !ttProfile.schedule) {
    return `
      <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <h4 class="font-extrabold text-[#800020] text-sm uppercase flex items-center gap-2">
            ${icon('calendar')} Personal Teaching Timetable (2026)
          </h4>
          <button onclick="switchTab('timetable')" class="px-3 py-1 bg-white border border-slate-300 hover:border-[#800020] text-slate-700 hover:text-[#800020] text-xs font-bold uppercase rounded shadow-xs cursor-pointer">
            View School Timetable
          </button>
        </div>
        <p class="text-xs text-slate-500 py-2">
          No individual Secondary Section (Grades 6–13) timetable grid is assigned to this profile (${escapeHtml(item.role || 'Staff')}).
        </p>
      </div>
    `;
  }

  const days = AppState.timetableData?.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const times = AppState.timetableData?.period_times || [
    "07:50 - 08:30", "08:30 - 09:10", "09:10 - 09:50", "09:50 - 10:30",
    "10:50 - 11:30", "11:30 - 12:10", "12:10 - 12:50", "12:50 - 13:30"
  ];
  const load = ttProfile.teaching_load || 0;
  const freeCount = Math.max(0, 40 - load);
  const formClass = ttProfile.form_class || '';
  const tKey = ttProfile.official_name || item.name_with_initials;

  let rowsHtml = '';
  for (let p = 1; p <= 8; p++) {
    if (p === 5) {
      rowsHtml += `
        <tr class="bg-amber-100/80 border-y border-[#d4af37] text-[#5c0d1b]">
          <td colspan="6" class="py-1.5 px-3 text-center font-extrabold uppercase tracking-wide text-[11px]">
            ☕ Morning Interval (10:30 AM – 10:50 AM) • උදෑසන විවේක කාලය
          </td>
        </tr>
      `;
    }
    const pTime = times[p - 1] || '';
    rowsHtml += `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-2 text-center font-mono bg-slate-50 border-r border-slate-200 whitespace-nowrap">
          <div class="font-extrabold text-slate-800 text-[11px]">Period ${p}</div>
          <div class="text-[10px] text-slate-500">${pTime}</div>
        </td>
    `;
    for (const d of days) {
      const daySlots = ttProfile.schedule[d] || [];
      const slot = daySlots.find(s => s.period === p) || { is_free: true };
      if (slot.is_free) {
        rowsHtml += `
          <td class="p-2 border-r border-slate-200 text-center align-middle">
            <span class="text-[10px] text-slate-300 font-semibold italic">— Free —</span>
          </td>
        `;
      } else {
        const badgeClass = getSubjectBadgeClass(slot.subject);
        rowsHtml += `
          <td class="p-2 border-r border-slate-200 align-top">
            <div class="mb-1">
              <button onclick="openClassInTimetableTab('${escapeHtml(slot.class_name)}')" class="tt-class-pill shadow-xs hover:bg-[#5c0d1b] cursor-pointer text-[10px]" title="Open Grade ${escapeHtml(slot.class_name)} Timetable">
                Grade ${escapeHtml(slot.class_name)}
              </button>
            </div>
            <div class="tt-subject-badge ${badgeClass} text-[11px]">
              ${escapeHtml(slot.subject)}
            </div>
          </td>
        `;
      }
    }
    rowsHtml += `</tr>`;
  }

  return `
    <div class="bg-white p-5 rounded-xl border-2 border-[#d4af37]/60 shadow-sm space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 class="font-extrabold text-[#800020] text-sm uppercase flex items-center gap-2">
            ${icon('calendar')} Personal Teaching Timetable (2026 Official Schedule)
          </h4>
          <p class="text-xs text-slate-500 mt-0.5">
            Identified from WP/KE/Jayakody Maha Vidyalaya 2026 Master Timetable (${escapeHtml(ttProfile.timetable_name || tKey)})
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${formClass ? `
            <button onclick="openClassInTimetableTab('${escapeHtml(formClass)}')" class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-100 text-[#5c0d1b] border border-[#d4af37] hover:bg-amber-200 cursor-pointer">
              Form Teacher: Grade ${escapeHtml(formClass)}
            </button>
          ` : ''}
          <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#fdf2f4] text-[#800020] border border-rose-200">
            ${load} / 40 Periods/Wk (${freeCount} Free)
          </span>
          <button onclick="openStaffInTimetableTab('${escapeHtml(item.id)}', '${escapeHtml(tKey)}')" class="px-3 py-1 bg-[#800020] hover:bg-[#5c0d1b] text-white text-xs font-bold uppercase rounded-lg shadow cursor-pointer flex items-center gap-1">
            ${icon('calendar')} Full Timetable &amp; Print
          </button>
        </div>
      </div>

      ${load > 0 ? `
        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-[#fdf2f4] text-[#38050b] font-extrabold uppercase text-[11px] border-b-2 border-[#d4af37]">
                <th class="p-2.5 w-28 border-r border-slate-200 text-center">Period</th>
                ${days.map(d => `<th class="p-2.5 border-r border-slate-200 text-[#800020]">${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="bg-amber-50/70 border border-amber-200 rounded-lg p-4 text-xs text-amber-900">
          This faculty member is listed in the 2026 Timetable Registry (${escapeHtml(ttProfile.timetable_name || tKey)}) with administrative/special duties and 0 regular classroom periods currently assigned.
        </div>
      `}
    </div>
  `;
}

function renderDossier(item, type) {
  const dossierArea = document.getElementById('idCardDossierView');
  if (!dossierArea) return;

  const isStudent = type === 'student';
  const recordKey = isStudent ? item.admission_no : item.id;
  const avatarUrl = item.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name_with_initials)}&background=5c0d1b&color=fff&size=200`;
  const ttProfile = !isStudent ? findStaffTimetableProfile(item) : null;

  const staffDept = !isStudent ? (item.department && item.department !== 'None' ? item.department : (ttProfile?.department || 'General Academic Faculty')) : '';
  const staffSubjectsArr = !isStudent
    ? (item.subjects_taught && item.subjects_taught !== 'None'
        ? item.subjects_taught.split(',').map(s => s.trim()).filter(Boolean)
        : (ttProfile?.subjects_taught || []))
    : [];
  const staffClassesArr = !isStudent
    ? (ttProfile?.assigned_classes?.length
        ? ttProfile.assigned_classes
        : (item.assigned_classes && item.assigned_classes !== 'None'
            ? item.assigned_classes.split(',').map(c => c.trim()).filter(Boolean)
            : []))
    : [];
  const staffFormClass = ttProfile?.form_class || '';
  const staffTeachingLoad = ttProfile ? ttProfile.teaching_load : null;

  const editBtn = document.getElementById('editResultBtn');
  const u = AppState.currentUser;
  const isTeacher = u && u.role === 'teacher';
  if (editBtn) {
    if (isTeacher) {
      if (isStudent) {
        editBtn.innerHTML = `${icon('chart')} <span>Record Marks</span>`;
        editBtn.className = 'px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase rounded shadow transition-all flex items-center gap-1.5 cursor-pointer';
        editBtn.style.display = 'inline-flex';
      } else {
        editBtn.style.display = 'none';
      }
    } else {
      editBtn.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-edit"></use></svg> <span data-en="Edit Record" data-si="සංස්කරණය">Edit</span>`;
      editBtn.className = 'px-4 py-1.5 bg-[#800020] hover:bg-[#5c0d1b] text-white text-xs font-bold uppercase rounded shadow transition-all flex items-center gap-1.5 cursor-pointer';
      editBtn.style.display = 'inline-flex';
    }
  }

  const detailsHtml = isStudent ? `
    <!-- Academic Details -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('graduation')} Academic &amp; Admissions Information
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Official Admission No</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.admission_no)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Grade / Class</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.grade)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Education Level</span>
          <span class="font-extrabold text-[#800020]">${escapeHtml(item.academic_level || (item.stream?.includes('O/L') ? 'Ordinary Level' : (item.stream?.includes('A/L') ? 'Advanced Level' : 'General')))}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Academic Stream</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.stream)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Medium of Study</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.medium)} Medium</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">School House</span>
          <span class="inline-block font-bold px-2 py-0.5 rounded text-[11px] border ${
            item.house === 'Thisara' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
            item.house === 'Paravi' ? 'bg-yellow-100 text-yellow-900 border-yellow-400' :
            item.house === 'Mayura' ? 'bg-blue-100 text-blue-900 border-blue-300' :
            'bg-slate-100 text-slate-800 border-slate-300'
          }">${escapeHtml(item.house)} House</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Enrolment Date</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.enrollment_date)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Status</span>
          <span class="font-bold ${(item.status || '').toLowerCase() === 'alumni' || (item.status || '').toLowerCase() === 'graduated' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-[#800020] bg-[#fdf2f4] border border-rose-200'} px-2 py-0.5 rounded text-[11px]">${escapeHtml((item.status || '').toLowerCase() === 'graduated' ? 'Alumni' : (item.status || 'Active'))}</span>
        </div>
      </div>
    </div>

    <!-- Enrolled Subjects & Elective Specialization -->
    <div class="bg-amber-50/60 p-5 rounded-xl border border-amber-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-amber-200 pb-2 flex items-center gap-2">
        ${icon('clipboard')} Enrolled Curriculum &amp; Elective Specialization
      </h4>
      ${renderDossierSubjects(item)}
    </div>

    <!-- Personal & Guardian Details -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('users')} Personal &amp; Guardian Information
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Full Name</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.full_name || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Name with Initials</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.name_with_initials)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Gender &amp; Date of Birth</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.gender || '—')} • ${escapeHtml(item.dob || '—')}</span>
          ${calculateAge(item.dob) !== null ? `<span class="inline-block ml-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#fdf2f4] text-[#800020] border border-rose-200">${calculateAge(item.dob)} yrs old</span>` : ''}
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Guardian / Parent</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.guardian_name)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Guardian Phone</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.guardian_contact)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Permanent Address</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.address)}</span>
        </div>
      </div>
    </div>

    <!-- Medical & Health Records -->
    <div class="bg-rose-50/60 p-5 rounded-xl border border-rose-200 space-y-2">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-rose-200 pb-2 flex items-center gap-2">
        ${icon('alert')} Medical &amp; Health Records
      </h4>
      <div class="text-xs">
        <span class="block uppercase font-bold text-slate-500 mb-1">Health Issues / Allergies / Medical Notes</span>
        <div class="font-semibold text-slate-800 ${item.health_issues ? 'text-rose-900 font-bold' : ''}">
          ${escapeHtml(item.health_issues || 'No chronic health issues or allergies reported.')}
        </div>
      </div>
    </div>

    <!-- Extracurriculars -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('trophy')} Clubs, Societies &amp; Commendations
      </h4>
      <div class="space-y-2 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Clubs, Societies &amp; Sports</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.extracurricular || 'None recorded')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Academic Notes &amp; Commendations</span>
          <span class="italic text-slate-600">${escapeHtml(item.notes || 'Good academic standing.')}</span>
        </div>
      </div>
    </div>

    <!-- Academic Examination Marks Section -->
    <div id="dossierMarksContainer" class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <div class="flex items-center justify-between border-b border-slate-200 pb-2">
        <h4 class="font-extrabold text-[#800020] text-sm uppercase flex items-center gap-2">
          ${icon('chart')} Term Examination Results &amp; Academic Progress
        </h4>
        <button onclick="openAddMarkModal('${escapeHtml(item.id)}')" class="px-3.5 py-1 bg-[#800020] hover:bg-[#5c0d1b] text-white text-xs font-bold uppercase rounded shadow flex items-center gap-1 cursor-pointer">
          ${icon('plus')} Record Marks
        </button>
      </div>
      <div id="dossierMarksContent" class="overflow-x-auto text-xs">
        <p class="text-slate-400 italic py-2">Loading student academic marks...</p>
      </div>
    </div>
  ` : `
    <!-- Staff Service Details -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <h4 class="font-extrabold text-[#800020] text-sm uppercase flex items-center gap-2">
          ${icon('building')} Executive &amp; Institutional Service Details
        </h4>
        <div class="flex flex-wrap items-center gap-1.5">
          ${staffFormClass ? `
            <span class="px-2.5 py-0.5 rounded text-[11px] font-extrabold bg-amber-100 text-[#5c0d1b] border border-[#d4af37]">
              Form Teacher: Grade ${escapeHtml(staffFormClass)}
            </span>
          ` : ''}
          ${staffTeachingLoad !== null ? `
            <span class="px-2.5 py-0.5 rounded text-[11px] font-extrabold bg-[#fdf2f4] text-[#800020] border border-rose-200">
              ${staffTeachingLoad} / 40 Periods/Wk
            </span>
          ` : ''}
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Faculty Member ID</span>
          <span class="font-extrabold text-[#800020] font-mono text-sm">${escapeHtml(item.id)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">EPF / Service No</span>
          <span class="font-bold text-slate-800 font-mono">${escapeHtml(item.epf_no || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Designation / Role</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.role)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Department</span>
          <span class="font-bold text-slate-800">${escapeHtml(staffDept || '—')}</span>
        </div>
        <div class="sm:col-span-2">
          <span class="block uppercase font-bold text-slate-400 mb-1">Subjects Taught</span>
          <div class="flex flex-wrap gap-1.5">
            ${staffSubjectsArr.length
              ? staffSubjectsArr.map(subj => `<span class="px-2 py-0.5 rounded border text-[11px] font-extrabold ${getSubjectBadgeClass(subj)}">${escapeHtml(subj)}</span>`).join('')
              : `<span class="font-bold text-slate-700">${escapeHtml(item.subjects_taught || 'General Administration')}</span>`
            }
          </div>
        </div>
        <div class="sm:col-span-2">
          <span class="block uppercase font-bold text-slate-400 mb-1">Assigned Classes</span>
          <div class="flex flex-wrap gap-1.5">
            ${staffFormClass ? `
              <button onclick="openClassInTimetableTab('${escapeHtml(staffFormClass)}')" class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-100 text-[#5c0d1b] border border-[#d4af37] hover:bg-amber-200 cursor-pointer" title="View Grade ${escapeHtml(staffFormClass)} Timetable">
                ★ Class Teacher (${escapeHtml(staffFormClass)})
              </button>
            ` : ''}
            ${staffClassesArr.length
              ? staffClassesArr.map(cls => `<button onclick="openClassInTimetableTab('${escapeHtml(cls)}')" class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 hover:bg-[#800020] hover:text-white text-slate-800 transition-colors cursor-pointer" title="View Grade ${escapeHtml(cls)} Timetable">Grade ${escapeHtml(cls)}</button>`).join('')
              : `<span class="font-bold text-slate-700">${escapeHtml(item.assigned_classes || 'N/A')}</span>`
            }
          </div>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Appointment Date</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.appointed_date || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Status</span>
          <span class="font-bold text-[#800020] bg-[#fdf2f4] border border-rose-200 px-2 py-0.5 rounded text-[11px]">${escapeHtml(item.status || 'Active')}</span>
        </div>
      </div>
    </div>

    <!-- Personal Weekly Teaching Timetable (2026) -->
    ${renderStaffDossierTimetable(item, ttProfile)}

    <!-- Credentials -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('clipboard')} Academic Qualifications &amp; Credentials
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Qualifications</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.qualifications || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">National ID (NIC)</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.nic || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Date of Birth &amp; Age</span>
          <span class="font-bold text-slate-800">
            ${escapeHtml(item.dob || '—')}
            ${calculateAge(item.dob) !== null ? `<span class="ml-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">${calculateAge(item.dob)} years old</span>` : ''}
          </span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Official School Email</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.email || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Direct Phone</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.contact_no || '—')}</span>
        </div>
        <div class="sm:col-span-2">
          <span class="block uppercase font-bold text-slate-400">Residential Address</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.address || '—')}</span>
        </div>
      </div>
    </div>
  `;

  dossierArea.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
      <!-- Sidebar with Avatar & Actions -->
      <div class="md:col-span-4 bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center space-y-4">
        <img src="${avatarUrl}" class="w-32 h-32 mx-auto rounded-2xl object-cover border-4 border-[#d4af37] shadow" alt="${item.name_with_initials}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.name_with_initials)}&background=5c0d1b&color=fff'">
        <div>
          <h3 class="text-xl font-extrabold text-[#38050b]">${escapeHtml(item.name_with_initials)}</h3>
          <p class="text-xs text-slate-500">${isStudent ? `Grade ${item.grade} Student` : escapeHtml(item.role)}</p>
        </div>
        <div class="bg-[#fdf2f4] text-[#800020] font-mono font-extrabold py-1 px-3 rounded text-sm inline-block">
          ${escapeHtml(recordKey)}
        </div>
        ${!isStudent && ttProfile ? `
          <div class="flex flex-wrap justify-center gap-1.5 pt-1">
            ${staffFormClass ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-[#5c0d1b] border border-[#d4af37]">Class Teacher: ${escapeHtml(staffFormClass)}</span>` : ''}
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#fdf2f4] text-[#800020] border border-rose-200">${ttProfile.teaching_load} Periods/Wk</span>
          </div>
        ` : ''}
        <div class="space-y-2 pt-2">
          <button onclick="copyIdToClipboard('${recordKey}')" class="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-white shadow-sm transition-all cursor-pointer">
            ${icon('clipboard')} ${isStudent ? 'Copy Admission No' : 'Copy ID'}
          </button>
          ${!isStudent && ttProfile ? `
            <button onclick="openStaffInTimetableTab('${escapeHtml(item.id)}', '${escapeHtml(ttProfile.official_name || item.name_with_initials)}')" class="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-[#5c0d1b] border border-[#d4af37] rounded-lg text-xs font-extrabold uppercase shadow-xs transition-all cursor-pointer">
              ${icon('calendar')} Open Full Timetable
            </button>
          ` : ''}
          ${!isTeacher ? `
            <button onclick="openEditModal('${recordKey}', '${type}')" class="w-full py-2 px-3 bg-[#800020] hover:bg-[#5c0d1b] text-white rounded-lg text-xs font-bold uppercase shadow transition-all cursor-pointer">
              ${icon('edit')} Edit Record
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Main Dossier Content -->
      <div class="md:col-span-8 space-y-6">
        ${detailsHtml}
        ${AppState.currentUser && AppState.currentUser.role === 'admin' ? `
        <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
          <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
            ${icon('clipboard')} Record History &amp; Audit Trail
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span class="block uppercase font-bold text-slate-400">Created By</span>
              <span class="font-bold text-slate-800">${escapeHtml(item.created_by || '—')}</span>
            </div>
            <div>
              <span class="block uppercase font-bold text-slate-400">Last Updated By</span>
              <span class="font-bold text-slate-800">${escapeHtml(item.updated_by || '—')}</span>
              <span class="block text-[11px] text-slate-500">${escapeHtml(formatAuditTime(item.last_updated_at))}</span>
            </div>
          </div>
          <div id="auditHistoryContent" class="text-xs space-y-2 max-h-96 overflow-y-auto">
            <p class="text-slate-400 italic">Loading change history...</p>
          </div>
        </div>` : ''}
      </div>
    </div>
  `;

  if (AppState.currentUser && AppState.currentUser.role === 'admin') {
    loadAuditHistory(recordKey, isStudent ? 'student' : 'staff');
  }
  if (isStudent) {
    loadStudentDossierMarks(item.id);
  }
}

function formatAuditTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

const AUDIT_FIELD_LABELS = {
  admission_no: 'Admission No', name_with_initials: 'Name with Initials', full_name: 'Full Name',
  gender: 'Gender', dob: 'Date of Birth', grade: 'Grade / Class', stream: 'Stream', medium: 'Medium',
  house: 'House', guardian_name: 'Guardian Name', guardian_contact: 'Guardian Phone', address: 'Address',
  enrollment_date: 'Enrollment Date', status: 'Status', extracurricular: 'Extracurricular',
  photo_url: 'Photo URL', notes: 'Notes', health_issues: 'Health Issues', academic_level: 'Education Level',
  subjects: 'Subjects', ol_bucket_1: 'O/L Bucket 1', ol_bucket_2: 'O/L Bucket 2', ol_bucket_3: 'O/L Bucket 3',
  epf_no: 'EPF No', role: 'Role', department: 'Department', subjects_taught: 'Subjects Taught',
  qualifications: 'Qualifications', appointed_date: 'Appointed Date', contact_no: 'Phone', email: 'Email',
  nic: 'NIC', assigned_classes: 'Assigned Classes'
};

async function loadAuditHistory(entityId, entityType) {
  const box = document.getElementById('auditHistoryContent');
  if (!box) return;
  try {
    const res = await fetch(`/api/audit?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`, { headers: getAuthHeaders() });
    const rows = await res.json();
    if (!res.ok || !Array.isArray(rows) || rows.length === 0) {
      box.innerHTML = '<p class="text-slate-400 italic">No changes recorded yet.</p>';
      return;
    }
    const actionStyles = {
      create: 'bg-emerald-100 text-emerald-800',
      update: 'bg-blue-100 text-blue-800',
      delete: 'bg-rose-100 text-rose-800'
    };
    box.innerHTML = rows.map(r => {
      const entries = Object.entries(r.changes || {});
      const changeHtml = r.action === 'update' && entries.length
        ? `<ul class="mt-1.5 space-y-0.5">${entries.map(([k, v]) => `
            <li><span class="font-bold text-slate-700">${escapeHtml(AUDIT_FIELD_LABELS[k] || k)}:</span>
              <span class="text-rose-700 line-through">${escapeHtml(v.old || '(empty)')}</span> →
              <span class="text-emerald-700 font-semibold">${escapeHtml(v.new || '(empty)')}</span></li>`).join('')}</ul>`
        : (r.action === 'create' ? '<div class="mt-1 text-slate-500">Record created.</div>' : '');
      return `
        <div class="bg-white border border-slate-200 rounded-lg p-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="px-2 py-0.5 rounded font-extrabold uppercase text-[10px] ${actionStyles[r.action] || 'bg-slate-100 text-slate-700'}">${escapeHtml(r.action)}</span>
            <span class="text-slate-500">${escapeHtml(formatAuditTime(r.changed_at))}</span>
          </div>
          <div class="mt-1 text-slate-700">by <strong>${escapeHtml(r.changed_by)}</strong>${r.changed_by_role ? ` (${escapeHtml(r.changed_by_role)})` : ''}</div>
          ${changeHtml}
        </div>`;
    }).join('');
  } catch (e) {
    box.innerHTML = '<p class="text-rose-600">Could not load change history.</p>';
  }
}

function initResultControls() {
  const printBtn = document.getElementById('printResultBtn');
  const copyBtn = document.getElementById('copyIdBtn');
  const editBtn = document.getElementById('editResultBtn');

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (AppState.currentEntity) {
        const key = AppState.currentEntityType === 'student'
          ? AppState.currentEntity.admission_no
          : AppState.currentEntity.id;
        copyIdToClipboard(key);
      }
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (!AppState.currentEntity || !AppState.currentEntityType) return;
      const isTeacher = AppState.currentUser && AppState.currentUser.role === 'teacher';
      if (isTeacher) {
        if (AppState.currentEntityType === 'student') {
          openAddMarkModal(AppState.currentEntity.id);
        } else {
          showToast("Teachers cannot edit faculty records.", "error");
        }
        return;
      }
      const key = AppState.currentEntityType === 'student'
        ? AppState.currentEntity.admission_no
        : AppState.currentEntity.id;
      openEditModal(key, AppState.currentEntityType);
    });
  }
}

function toggleViewMode(mode) {
  AppState.currentViewMode = 'dossier';
  const dossierView = document.getElementById('idCardDossierView');
  if (dossierView) dossierView.classList.remove('hidden');
}

function copyIdToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ID "${text}" to clipboard!`, "success");
  }).catch(() => {
    showToast(`ID: ${text}`, "info");
  });
}

/* --------------------------------------------------------------------------
   Students Directory & Filtering
   -------------------------------------------------------------------------- */
async function loadStudents() {
  const search = document.getElementById('studentFilterSearch')?.value.trim() || '';
  const grade = document.getElementById('studentFilterGrade')?.value || '';
  const house = document.getElementById('studentFilterHouse')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (grade) params.append('grade', grade);
  if (house) params.append('house', house);

  try {
    const res = await fetch(`/api/students?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const students = await res.json();
    if (Array.isArray(students)) {
      AppState.studentsList = students;
      renderStudentsTable(students);
      updateHomeView();
      if (!search && !grade && !house) {
        const activeStuCount = students.filter(s => ((s.status || 'Active').trim().toLowerCase() === 'active')).length;
        const stripStu = document.getElementById('stripStudents');
        if (stripStu) stripStu.textContent = String(activeStuCount);
      }
    }
  } catch (err) {
    console.error("Failed to load students:", err);
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('studentsTableBody');
  const countBadge = document.getElementById('studentsCountBadge');
  const activeCount = (students || []).filter(s => (s.status || '').toLowerCase() === 'active').length;
  if (countBadge) countBadge.textContent = `${activeCount} Active Enrolled`;

  if (!tbody) return;

  if (!students || students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center p-8 text-slate-400">
          No students matching search criteria.
        </td>
      </tr>
    `;
    return;
  }

  const houseThemes = {
    'Thisara': 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    'Mayura': 'bg-blue-100 text-blue-900 border border-blue-300',
    'Paravi': 'bg-yellow-100 text-yellow-900 border border-yellow-400'
  };

  const u = AppState.currentUser;
  const isTeacher = u && u.role === 'teacher';

  tbody.innerHTML = students.map(s => {
    const age = calculateAge(s.dob);
    return `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3.5 font-mono font-bold text-[#800020]">
        <button onclick="lookupFromTable('${s.admission_no}')" class="bg-slate-100 hover:bg-[#800020] hover:text-white px-2 py-0.5 rounded transition-colors cursor-pointer" title="View student record">
          ${escapeHtml(s.admission_no)}
        </button>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-3">
          <img src="${s.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name_with_initials)}&background=5c0d1b&color=fff`}" class="w-8 h-8 rounded-full object-cover border border-[#d4af37]" alt="${s.name_with_initials}">
          <div>
            <div class="font-bold text-slate-800">${escapeHtml(s.name_with_initials || s.full_name)}</div>
            ${s.full_name ? `<div class="text-[11px] text-slate-400">${escapeHtml(s.full_name)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="p-3.5">
        <span class="font-bold text-slate-800">${escapeHtml(s.grade)}</span>
        <span class="text-xs text-slate-500">(${escapeHtml(s.stream)})</span>
      </td>
      <td class="p-3.5 text-xs whitespace-nowrap">
        ${s.dob ? `
          <div class="font-bold text-slate-800">${escapeHtml(s.dob)}</div>
          ${age !== null ? `<span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#fdf2f4] text-[#800020] border border-rose-200">${age} yrs old</span>` : ''}
        ` : `<span class="text-slate-400 font-semibold">—</span>`}
      </td>
      <td class="p-3.5 text-xs text-slate-600 max-w-[200px] truncate" title="${escapeHtml(s.address || '')}">
        ${escapeHtml(s.address || '—')}
      </td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded ${houseThemes[s.house] || 'bg-slate-100 text-slate-800'}">
          ${escapeHtml(s.house)}
        </span>
      </td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded ${
          (s.status || '').toLowerCase() === 'alumni' || (s.status || '').toLowerCase() === 'graduated'
            ? 'bg-amber-100 text-amber-900 border border-amber-300'
            : (s.status || '').toLowerCase() === 'leave'
              ? 'bg-slate-100 text-slate-700 border border-slate-200'
              : 'bg-[#fdf2f4] text-[#800020] border border-rose-200'
        }">
          ${escapeHtml((s.status || '').toLowerCase() === 'graduated' ? 'Alumni' : (s.status || 'Active'))}
        </span>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-1.5">
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors cursor-pointer" title="View student record" onclick="lookupFromTable('${s.admission_no}')">
            ${icon('search')}
          </button>
          <button class="px-2 py-1 bg-amber-50 hover:bg-[#800020] hover:text-white text-[#800020] rounded border border-amber-300 transition-colors cursor-pointer font-bold text-xs flex items-center gap-1" title="Enter or Update Examination Marks" onclick="openAddMarkModal('${s.id}')">
            ${icon('chart')} Marks
          </button>
          ${!isTeacher ? `
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors cursor-pointer" title="Edit Student Profile (Admin)" onclick="openEditModal('${s.admission_no}', 'student')">
            ${icon('edit')}
          </button>
          <button class="p-1.5 bg-slate-100 hover:bg-rose-600 hover:text-white rounded transition-colors cursor-pointer" title="Delete Student (Admin)" onclick="confirmDelete('${s.admission_no}', 'student', '${escapeHtml(s.name_with_initials)}')">
            ${icon('trash')}
          </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `}).join('');
}

/* --------------------------------------------------------------------------
   Staff Directory & Filtering (Role Protected: Teachers restricted)
   -------------------------------------------------------------------------- */
async function loadStaff() {
  const banner = document.getElementById('staffTeacherRestrictedBanner');
  const container = document.getElementById('staffMainContainer');

  if (AppState.currentUser && AppState.currentUser.role === 'teacher') {
    if (banner) banner.classList.remove('hidden');
    if (container) container.classList.add('hidden');
    return;
  }

  const search = document.getElementById('staffFilterSearch')?.value.trim() || '';
  const dept = document.getElementById('staffFilterDept')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (dept) params.append('department', dept);

  try {
    const [, res] = await Promise.all([
      ensureTimetableDataLoaded(),
      fetch(`/api/staff?${params.toString()}`, { headers: getAuthHeaders() })
    ]);
    if (res.status === 403) {
      if (banner) banner.classList.remove('hidden');
      if (container) container.classList.add('hidden');
      return;
    }
    if (banner) banner.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    const staff = await res.json();
    if (Array.isArray(staff)) {
      AppState.staffList = staff;
      renderStaffTable(staff);
      updateHomeView();
      if (!search && !dept) {
        const activeStaff = staff.filter(st => ((st.status || 'Active').trim().toLowerCase() === 'active'));
        const nonAcadCount = activeStaff.filter(st => {
          const r = (st.role || '').toLowerCase();
          const d = (st.department || '').toLowerCase();
          return r.includes('clerk') || r.includes('attendant') || r.includes('driver') ||
                 r.includes('security') || r.includes('librarian') || r.includes('laboratory assistant') ||
                 r.includes('lab assistant') || r.includes('non-academic') || r.includes('watcher') ||
                 r.includes('office assistant') ||
                 (d.includes('non-academic') && !r.includes('teacher') && !r.includes('principal'));
        }).length;
        const acadCount = Math.max(0, activeStaff.length - nonAcadCount);
        const stripStf = document.getElementById('stripStaff');
        const stripNonAcad = document.getElementById('stripNonAcademicStaff');
        if (stripStf) stripStf.textContent = String(acadCount);
        if (stripNonAcad) stripNonAcad.textContent = String(nonAcadCount);
      }
    }
  } catch (err) {
    console.error("Failed to load staff:", err);
  }
}

function calculateAge(dobString) {
  if (!dobString) return null;
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return (age >= 0 && age < 120) ? age : null;
}

function updateStaffAgeDisplay(dobVal) {
  const badge = document.getElementById('staffCalculatedAgeBadge');
  if (!badge) return;
  const age = calculateAge(dobVal);
  if (age !== null) {
    badge.textContent = `${age} years old`;
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function updateStudentAgeDisplay(dobVal) {
  const badge = document.getElementById('studentCalculatedAgeBadge');
  if (!badge) return;
  const age = calculateAge(dobVal);
  if (age !== null) {
    badge.textContent = `${age} years old`;
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function deriveDobFromSriLankanNic(nic) {
  if (!nic) return null;
  const clean = String(nic).trim().toUpperCase();
  let year, days;
  if (/^\d{9}[V|X]$/.test(clean)) {
    year = 1900 + parseInt(clean.substring(0, 2), 10);
    days = parseInt(clean.substring(2, 5), 10);
  } else if (/^\d{12}$/.test(clean)) {
    year = parseInt(clean.substring(0, 4), 10);
    days = parseInt(clean.substring(4, 7), 10);
  } else {
    return null;
  }
  if (days > 500) days -= 500;
  if (days < 1 || days > 366) return null;
  const d = new Date(Date.UTC(year, 0, days));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function renderStaffTable(staff) {
  const tbody = document.getElementById('staffTableBody');
  const countBadge = document.getElementById('staffCountBadge');
  const activeStaffCount = (staff || []).filter(st => (st.status || '').toLowerCase() === 'active').length;
  if (countBadge) countBadge.textContent = `${activeStaffCount} Active Staff`;

  if (!tbody) return;

  if (!staff || staff.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center p-8 text-slate-400">
          No faculty members matching criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = staff.map(st => {
    const ttProf = findStaffTimetableProfile(st);
    const deptText = (st.department && st.department !== 'None') ? st.department : (ttProf?.department || '—');
    const subjText = (st.subjects_taught && st.subjects_taught !== 'None')
      ? st.subjects_taught
      : (ttProf?.subjects_taught?.length ? ttProf.subjects_taught.join(', ') : 'General Administration');
    const formCls = ttProf?.form_class || '';
    const loadVal = ttProf ? ttProf.teaching_load : null;
    const tKey = ttProf?.official_name || st.name_with_initials;

    return `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3.5 font-mono font-bold text-[#800020]">
        <button onclick="lookupFromTable('${st.id}')" class="bg-slate-100 hover:bg-[#800020] hover:text-white px-2 py-0.5 rounded transition-colors cursor-pointer" title="View profile &amp; timetable">
          ${escapeHtml(st.id)}
        </button>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-3">
          <img src="${st.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(st.name_with_initials)}&background=5c0d1b&color=fff`}" class="w-8 h-8 rounded-full object-cover border border-[#d4af37]" alt="${st.name_with_initials}">
          <div>
            <div class="font-bold text-slate-800">${escapeHtml(st.name_with_initials)}</div>
            <div class="text-[11px] text-[#800020] font-semibold flex flex-wrap items-center gap-1.5">
              <span>${escapeHtml(st.role)}</span>
              ${formCls ? `<span class="px-1.5 py-0.2 bg-amber-100 text-[#5c0d1b] border border-[#d4af37] rounded text-[10px] font-extrabold">Form: ${escapeHtml(formCls)}</span>` : ''}
            </div>
          </div>
        </div>
      </td>
      <td class="p-3.5 text-xs text-slate-700">${escapeHtml(deptText)}</td>
      <td class="p-3.5 text-xs text-slate-600">
        <div class="font-semibold text-slate-800">${escapeHtml(subjText)}</div>
        ${loadVal !== null ? `<div class="text-[10px] text-[#800020] font-bold mt-0.5">${loadVal} periods/wk</div>` : ''}
      </td>
      <td class="p-3.5 text-xs whitespace-nowrap">
        ${st.dob ? `
          <div class="font-bold text-slate-800">${escapeHtml(st.dob)}</div>
          ${calculateAge(st.dob) !== null ? `<span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">${calculateAge(st.dob)} yrs old</span>` : ''}
        ` : `<span class="text-slate-400 font-semibold">—</span>`}
      </td>
      <td class="p-3.5 text-xs text-slate-600 max-w-[200px] truncate" title="${escapeHtml(st.address || '')}">
        ${escapeHtml(st.address || '—')}
      </td>
      <td class="p-3.5 font-mono text-xs text-slate-600">${escapeHtml(st.epf_no || '—')}</td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#fdf2f4] text-[#800020] border border-rose-200">
          ${escapeHtml(st.status)}
        </span>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-1.5">
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors cursor-pointer" title="View Staff Profile &amp; Timetable" onclick="lookupFromTable('${st.id}')">
            ${icon('search')}
          </button>
          ${ttProf ? `
          <button class="p-1.5 bg-amber-50 hover:bg-[#800020] hover:text-white text-[#800020] border border-amber-300 rounded transition-colors cursor-pointer" title="Open Teacher Schedule in Timetable Tab" onclick="openStaffInTimetableTab('${escapeHtml(st.id)}', '${escapeHtml(tKey)}')">
            ${icon('calendar')}
          </button>
          ` : ''}
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors cursor-pointer" title="Edit Staff" onclick="openEditModal('${st.id}', 'staff')">
            ${icon('edit')}
          </button>
          <button class="p-1.5 bg-slate-100 hover:bg-rose-600 hover:text-white rounded transition-colors cursor-pointer" title="Delete Staff" onclick="confirmDelete('${st.id}', 'staff', '${escapeHtml(st.name_with_initials)}')">
            ${icon('trash')}
          </button>
        </div>
      </td>
    </tr>
  `}).join('');
}

function lookupFromTable(id) {
  switchTab('lookup');
  const input = document.getElementById('universalSearchInput');
  if (input) input.value = id;
  executeLookup(id);
}

function initDirectoryFilters() {
  const sSearch = document.getElementById('studentFilterSearch');
  const sGrade = document.getElementById('studentFilterGrade');
  const sHouse = document.getElementById('studentFilterHouse');
  if (sSearch) sSearch.addEventListener('input', () => debounce(loadStudents, 250)());
  if (sGrade) sGrade.addEventListener('change', loadStudents);
  if (sHouse) sHouse.addEventListener('change', loadStudents);

  const stSearch = document.getElementById('staffFilterSearch');
  const stDept = document.getElementById('staffFilterDept');
  if (stSearch) stSearch.addEventListener('input', () => debounce(loadStaff, 250)());
  if (stDept) stDept.addEventListener('change', loadStaff);
}

/* --------------------------------------------------------------------------
   Analytics / Overview Tab with JMV-Web Houses (Thisara, Mayura, Paravi)
   -------------------------------------------------------------------------- */
async function loadStats(retryCount = 2) {
  try {
    const res = await fetch('/api/stats', { headers: getAuthHeaders() });
    if (!res.ok) {
      console.warn("Stats API returned status:", res.status);
      if (retryCount > 0) {
        setTimeout(() => loadStats(retryCount - 1), 600);
      }
      return;
    }
    const stats = await res.json();
    if (stats.error && retryCount > 0) {
      setTimeout(() => loadStats(retryCount - 1), 600);
      return;
    }
    AppState.stats = stats;
    updateHomeView();

    const stripStu = document.getElementById('stripStudents');
    const stripStf = document.getElementById('stripStaff');
    const stripNonAcademic = document.getElementById('stripNonAcademicStaff');
    if (stripStu) stripStu.textContent = stats.total_students ?? "0";
    if (stripStf) stripStf.textContent = stats.total_staff ?? "0";
    if (stripNonAcademic) stripNonAcademic.textContent = stats.non_academic_staff ?? "0";

    // Render house breakdown bars for Thisara, Mayura, Paravi
    const houseBars = document.getElementById('houseDistributionBars');
    if (houseBars) {
      if (stats.houses && stats.houses.length > 0) {
        const houseTheme = {
          'Thisara': { color: '#16a34a', bg: '#dcfce7', sinhala: 'තිසර', colorName: 'Green' },
          'Mayura': { color: '#2563eb', bg: '#dbeafe', sinhala: 'මයුර', colorName: 'Blue' },
          'Paravi': { color: '#eab308', bg: '#fef9c3', sinhala: 'පරවි', colorName: 'Yellow' }
        };

        const total = stats.total_students || 1;
        houseBars.innerHTML = stats.houses.map(h => {
          const theme = houseTheme[h.house] || { color: '#6b0f1a', bg: '#f1f5f9', sinhala: h.house, colorName: '' };
          const pct = Math.round((h.count / total) * 100);
          return `
            <div class="mb-4">
              <div class="flex justify-between text-xs font-bold mb-1">
                <span class="text-slate-800 flex items-center gap-1.5">
                  <span style="background-color:${theme.color};" class="inline-block w-2.5 h-2.5 rounded-full"></span>
                  ${h.house} House (${theme.sinhala} නිවාසය${theme.colorName ? ` • ${theme.colorName}` : ''})
                </span>
                <span class="text-slate-500">${h.count} students (${pct}%)</span>
              </div>
              <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div style="width:${pct}%; background-color:${theme.color};" class="h-full rounded-full transition-all duration-500"></div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        houseBars.innerHTML = '<p class="text-xs text-slate-400 italic py-2">No students enrolled yet. Once students are added, house distributions will appear here.</p>';
      }
    }
  } catch (err) {
    console.error("Failed to load statistics:", err);
  }
}

/* --------------------------------------------------------------------------
   Modals & CRUD Handling
   -------------------------------------------------------------------------- */
function openAddStudentModal() {
  if (!AppState.currentUser) {
    showToast("Please sign in as Administrator to enroll students.", "info");
    openLoginModal();
    return;
  }
  if (AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can enroll new students. Teacher accounts can update student marks.", "error");
    return;
  }
  const modal = document.getElementById('studentModal');
  const form = document.getElementById('studentForm');
  if (!modal || !form) return;
  document.getElementById('studentModalTitle').textContent = "Enroll New Student";
  form.reset();
  if (document.getElementById('studentAcademicLevelInput')) document.getElementById('studentAcademicLevelInput').value = '';
  if (document.getElementById('olBucket1Input')) document.getElementById('olBucket1Input').value = '';
  if (document.getElementById('olBucket2Input')) document.getElementById('olBucket2Input').value = '';
  if (document.getElementById('olBucket3Input')) document.getElementById('olBucket3Input').value = '';
  if (document.getElementById('alStreamInput')) document.getElementById('alStreamInput').value = '';
  document.querySelectorAll('input[name="alCommerceSubject"]').forEach(cb => { cb.checked = false; cb.disabled = false; });
  document.querySelectorAll('input[name="alArtSubject"]').forEach(cb => { cb.checked = false; cb.disabled = false; });
  if (document.getElementById('studentHealthInput')) document.getElementById('studentHealthInput').value = '';
  if (document.getElementById('studentNotesInput')) document.getElementById('studentNotesInput').value = '';
  handleEducationLevelChange();
  if (document.getElementById('studentDobInput')) document.getElementById('studentDobInput').value = '';
  updateStudentAgeDisplay('');
  document.getElementById('studentFormMode').value = 'create';
  document.getElementById('studentAdmissionInput').readOnly = false;
  autoAssignHouseFromAdmission();
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
}

function openAddStaffModal() {
  if (!AppState.currentUser) {
    showToast("Please sign in as Administrator to add faculty members.", "info");
    openLoginModal();
    return;
  }
  if (AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can manage faculty and staff.", "error");
    return;
  }
  const modal = document.getElementById('staffModal');
  const form = document.getElementById('staffForm');
  if (!modal || !form) return;
  document.getElementById('staffModalTitle').textContent = "Add Faculty Member";
  form.reset();
  document.getElementById('staffFormMode').value = 'create';
  document.getElementById('staffIdInput').readOnly = false;
  const nextNum = String(1 + (AppState.staffList.length || 0)).padStart(3, '0');
  document.getElementById('staffIdInput').value = `JMV-STF-${nextNum}`;
  if (document.getElementById('staffGenderInput')) document.getElementById('staffGenderInput').value = 'Male';
  if (document.getElementById('staffDobInput')) document.getElementById('staffDobInput').value = '';
  updateStaffAgeDisplay('');
  if (document.getElementById('staffStatusInput')) document.getElementById('staffStatusInput').value = 'Active';
  if (document.getElementById('staffDeptInput')) document.getElementById('staffDeptInput').value = '';
  if (document.getElementById('staffAddressInput')) document.getElementById('staffAddressInput').value = '';
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
}

function closeModals() {
  const studentModal = document.getElementById('studentModal');
  const staffModal = document.getElementById('staffModal');
  const loginModal = document.getElementById('loginModal');
  const marksModal = document.getElementById('marksModal');
  const bulkUploadModal = document.getElementById('bulkUploadModal');
  const assignModal = document.getElementById('assignTeacherModal');
  if (studentModal) studentModal.classList.add('hidden');
  if (staffModal) staffModal.classList.add('hidden');
  if (loginModal) loginModal.classList.add('hidden');
  if (marksModal) marksModal.classList.add('hidden');
  if (bulkUploadModal) bulkUploadModal.classList.add('hidden');
  if (assignModal) assignModal.classList.add('hidden');
  const payModal = document.getElementById('paymentModal');
  const recModal = document.getElementById('receiptModal');
  if (payModal) payModal.classList.add('hidden');
  if (recModal) recModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function openBulkUploadModal(entityType = 'student') {
  if (!AppState.currentUser) {
    showToast("Please sign in as Administrator to upload bulk records.", "info");
    openLoginModal();
    return;
  }
  if (AppState.currentUser.role !== 'admin') {
    showToast("Only school administrators can perform bulk Excel uploads.", "error");
    return;
  }
  const modal = document.getElementById('bulkUploadModal');
  const form = document.getElementById('bulkUploadForm');
  const resBox = document.getElementById('bulkUploadResultBox');
  if (!modal || !form) return;
  form.reset();
  if (resBox) {
    resBox.classList.add('hidden');
    resBox.innerHTML = '';
  }
  setBulkUploadType(entityType);
  modal.classList.remove('hidden');
}

function setBulkUploadType(entityType) {
  const hiddenInput = document.getElementById('bulkUploadEntityType');
  const stuTab = document.getElementById('bulkTypeStudentTab');
  const stfTab = document.getElementById('bulkTypeStaffTab');
  const titleEl = document.getElementById('bulkUploadModalTitle');
  const helperEl = document.getElementById('bulkUploadHelperNote');

  if (hiddenInput) hiddenInput.value = entityType;

  if (entityType === 'staff') {
    if (stuTab) stuTab.className = 'px-3 py-1.5 rounded font-bold text-xs transition-all cursor-pointer text-slate-700 hover:bg-slate-100';
    if (stfTab) stfTab.className = 'px-3 py-1.5 rounded font-bold text-xs transition-all cursor-pointer bg-[#800020] text-white';
    if (titleEl) titleEl.innerHTML = `${icon('clipboard')} Bulk Upload Teachers &amp; Staff (Excel / CSV)`;
    if (helperEl) {
      helperEl.innerHTML = 'Required columns for Teachers/Staff: <strong>Name with Initials *</strong>, <strong>Designation / Role *</strong>. (Staff ID is auto-generated if blank; Full Name, Department, and EPF No are optional).';
    }
  } else {
    if (stuTab) stuTab.className = 'px-3 py-1.5 rounded font-bold text-xs transition-all cursor-pointer bg-[#800020] text-white';
    if (stfTab) stfTab.className = 'px-3 py-1.5 rounded font-bold text-xs transition-all cursor-pointer text-slate-700 hover:bg-slate-100';
    if (titleEl) titleEl.innerHTML = `${icon('clipboard')} Bulk Upload Students (Excel / CSV)`;
    if (helperEl) {
      helperEl.innerHTML = 'Required columns for Students: <strong>Admission Number *</strong>, <strong>Name with Initials *</strong>, <strong>Education Level *</strong>, <strong>Grade / Class *</strong>. (Full Name is optional; House is auto-calculated from Admission No mod 3 if left blank).';
    }
  }
}

function initModals() {
  const studentForm = document.getElementById('studentForm');
  const staffForm = document.getElementById('staffForm');
  const loginForm = document.getElementById('loginForm');
  const marksForm = document.getElementById('marksForm');
  const payForm = document.getElementById('paymentForm');
  if (payForm) payForm.addEventListener('submit', handlePaymentSubmit);

  const admInput = document.getElementById('studentAdmissionInput');
  if (admInput) {
    admInput.addEventListener('input', autoAssignHouseFromAdmission);
    admInput.addEventListener('change', autoAssignHouseFromAdmission);
  }

  const studentDob = document.getElementById('studentDobInput');
  if (studentDob) {
    studentDob.addEventListener('input', (e) => updateStudentAgeDisplay(e.target.value));
    studentDob.addEventListener('change', (e) => updateStudentAgeDisplay(e.target.value));
  }

  const staffDob = document.getElementById('staffDobInput');
  if (staffDob) {
    staffDob.addEventListener('input', (e) => updateStaffAgeDisplay(e.target.value));
    staffDob.addEventListener('change', (e) => updateStaffAgeDisplay(e.target.value));
  }

  const staffNic = document.getElementById('staffNicInput');
  if (staffNic) {
    staffNic.addEventListener('input', (e) => {
      const dobInput = document.getElementById('staffDobInput');
      if (dobInput && !dobInput.value) {
        const derivedDob = deriveDobFromSriLankanNic(e.target.value);
        if (derivedDob) {
          dobInput.value = derivedDob;
          updateStaffAgeDisplay(derivedDob);
        }
      }
    });
  }

  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = document.getElementById('studentFormMode').value;
      const admissionNo = document.getElementById('studentAdmissionInput').value.trim();
      const studentId = mode === 'create'
        ? admissionNo
        : (AppState.currentEntity?.admission_no || admissionNo);

      const level = document.getElementById('studentAcademicLevelInput')?.value;
      if (!level) {
        showToast("Please select an Education Level for the student.", "error");
        document.getElementById('studentAcademicLevelInput')?.focus();
        return;
      }

      let stream = document.getElementById('studentStreamInput')?.value || level;
      let subjects = '';
      let ol_bucket_1 = '';
      let ol_bucket_2 = '';
      let ol_bucket_3 = '';

      if (level === 'Ordinary Level') {
        ol_bucket_1 = document.getElementById('olBucket1Input')?.value || '';
        ol_bucket_2 = document.getElementById('olBucket2Input')?.value || '';
        ol_bucket_3 = document.getElementById('olBucket3Input')?.value || '';

        if (!ol_bucket_1) {
          showToast("Please select a 1st Bucket subject for Ordinary Level.", "error");
          document.getElementById('olBucket1Input')?.focus();
          return;
        }
        if (!ol_bucket_2) {
          showToast("Please select a 2nd Bucket subject for Ordinary Level.", "error");
          document.getElementById('olBucket2Input')?.focus();
          return;
        }
        if (!ol_bucket_3) {
          showToast("Please select a 3rd Bucket subject for Ordinary Level.", "error");
          document.getElementById('olBucket3Input')?.focus();
          return;
        }
        subjects = `${ol_bucket_1}, ${ol_bucket_2}, ${ol_bucket_3}`;
        stream = 'Senior Secondary (G.C.E. O/L)';
      } else if (level === 'Advanced Level') {
        const alStream = document.getElementById('alStreamInput')?.value;
        if (!alStream) {
          showToast("Please select an A/L Subject Stream (Commerce or Art).", "error");
          document.getElementById('alStreamInput')?.focus();
          return;
        }

        if (alStream === 'Commerce') {
          const chosen = Array.from(document.querySelectorAll('input[name="alCommerceSubject"]:checked')).map(cb => cb.value);
          if (chosen.length !== 3) {
            showToast(`Please select exactly 3 Commerce subjects (currently ${chosen.length} selected).`, "error");
            return;
          }
          subjects = `English (Mandatory), ${chosen.join(', ')}`;
          stream = 'Commerce Stream (A/L)';
        } else if (alStream === 'Art') {
          const chosen = Array.from(document.querySelectorAll('input[name="alArtSubject"]:checked')).map(cb => cb.value);
          if (chosen.length !== 3) {
            showToast(`Please select exactly 3 Art subjects (currently ${chosen.length} selected).`, "error");
            return;
          }
          subjects = `English (Mandatory), ${chosen.join(', ')}`;
          stream = 'Art Stream (A/L)';
        }
      } else {
        stream = level;
      }

      const payload = {
        admission_no: admissionNo,
        name_with_initials: document.getElementById('studentInitialsInput').value.trim(),
        full_name: document.getElementById('studentFullNameInput').value.trim(),
        gender: document.getElementById('studentGenderInput').value,
        dob: document.getElementById('studentDobInput').value,
        academic_level: level,
        grade: document.getElementById('studentGradeInput').value.trim(),
        stream: stream,
        subjects: subjects,
        ol_bucket_1: ol_bucket_1,
        ol_bucket_2: ol_bucket_2,
        ol_bucket_3: ol_bucket_3,
        medium: document.getElementById('studentMediumInput').value,
        house: document.getElementById('studentHouseInput')?.value || getHouseFromAdmission(admissionNo),
        guardian_name: document.getElementById('studentGuardianInput').value.trim(),
        guardian_contact: document.getElementById('studentContactInput').value.trim(),
        address: document.getElementById('studentAddressInput').value.trim(),
        status: document.getElementById('studentStatusInput').value,
        extracurricular: document.getElementById('studentExtraInput').value.trim(),
        health_issues: document.getElementById('studentHealthInput') ? document.getElementById('studentHealthInput').value.trim() : '',
        notes: document.getElementById('studentNotesInput') ? document.getElementById('studentNotesInput').value.trim() : '',
        photo_url: document.getElementById('studentPhotoInput').value.trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(document.getElementById('studentInitialsInput').value.trim())}&background=5c0d1b&color=fff`
      };

      try {
        const url = mode === 'create' ? '/api/students' : `/api/students/${encodeURIComponent(studentId)}`;
        const method = mode === 'create' ? 'POST' : 'PUT';
        const res = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          closeModals();
          showToast(`Student ${admissionNo} saved successfully!`, 'success');
          loadStudents();
          loadStats();
          if (AppState.currentEntity && AppState.currentEntity.admission_no === admissionNo) {
            executeLookup(admissionNo);
          }
        } else {
          showToast(data.error || 'Failed to save student', 'error');
        }
      } catch (err) {
        showToast('Error communicating with server', 'error');
      }
    });
  }

  if (staffForm) {
    staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = document.getElementById('staffFormMode').value;
      const staffId = document.getElementById('staffIdInput').value.trim();

      const initials = document.getElementById('staffInitialsInput').value.trim();
      const customPhoto = document.getElementById('staffPhotoInput') ? document.getElementById('staffPhotoInput').value.trim() : '';

      const payload = {
        id: staffId,
        epf_no: document.getElementById('staffEpfInput').value.trim() || null,
        name_with_initials: initials,
        full_name: document.getElementById('staffFullNameInput').value.trim(),
        gender: document.getElementById('staffGenderInput') ? document.getElementById('staffGenderInput').value : 'Male',
        dob: document.getElementById('staffDobInput') ? (document.getElementById('staffDobInput').value.trim() || null) : null,
        nic: document.getElementById('staffNicInput') ? document.getElementById('staffNicInput').value.trim() : '',
        role: document.getElementById('staffRoleInput').value.trim(),
        department: document.getElementById('staffDeptInput').value,
        appointed_date: document.getElementById('staffAppointedDateInput') ? (document.getElementById('staffAppointedDateInput').value || null) : null,
        status: document.getElementById('staffStatusInput') ? document.getElementById('staffStatusInput').value : 'Active',
        subjects_taught: document.getElementById('staffSubjectsInput').value.trim(),
        assigned_classes: document.getElementById('staffClassesInput').value.trim(),
        qualifications: document.getElementById('staffQualInput').value.trim(),
        contact_no: document.getElementById('staffContactInput').value.trim(),
        email: document.getElementById('staffEmailInput').value.trim(),
        address: document.getElementById('staffAddressInput') ? document.getElementById('staffAddressInput').value.trim() : '',
        notes: document.getElementById('staffNotesInput') ? document.getElementById('staffNotesInput').value.trim() : '',
        photo_url: customPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(initials || staffId)}&background=5c0d1b&color=fff`
      };

      try {
        const url = mode === 'create' ? '/api/staff' : `/api/staff/${encodeURIComponent(staffId)}`;
        const method = mode === 'create' ? 'POST' : 'PUT';
        const res = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          closeModals();
          showToast(`Faculty member ${staffId} saved successfully!`, 'success');
          loadStaff();
          loadStats();
          if (AppState.currentEntity && AppState.currentEntity.id === staffId) {
            executeLookup(staffId);
          }
        } else {
          showToast(data.error || 'Failed to save staff member', 'error');
        }
      } catch (err) {
        showToast('Error communicating with server', 'error');
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsernameInput').value.trim();
      const p = document.getElementById('loginPasswordInput').value.trim();
      const errBox = document.getElementById('loginErrorMsg');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('jmv_token', data.token);
          AppState.currentUser = data.user;
          closeModals();
          updateRoleBasedUI();
          showToast(`Signed in as ${data.user.full_name} (${data.user.role.toUpperCase()})`, 'success');

          // Refresh current views with updated permissions
          loadStats();
          if (['admin', 'teacher'].includes(data.user.role)) {
            loadStudents();
            if (data.user.role === 'admin') {
              loadStaff();
              loadPayments();
            }
          }
          if (AppState.activeTab === 'marks') {
            loadAllMarksLedger();
          } else {
            switchTab('home');
          }
        } else {
          if (errBox) {
            errBox.textContent = data.error || `Request failed (${res.status}).`;
            errBox.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'Unable to reach the portal server. Open /api/health on this deployment to check its database status.';
          errBox.classList.remove('hidden');
        }
      }
    });
  }

  if (marksForm) {
    marksForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = document.getElementById('marksFormStudentSelect').value;
      const markId = document.getElementById('marksFormMarkId').value;
      const subject = document.getElementById('marksFormSubject').value.trim();
      const term = document.getElementById('marksFormTerm').value;
      const year = document.getElementById('marksFormYear').value;
      const score = parseInt(document.getElementById('marksFormScore').value, 10);
      const remarks = document.getElementById('marksFormRemarks').value.trim();

      if (!studentId || !subject || isNaN(score)) {
        showToast('Please select a student, subject, and enter valid marks (0-100).', 'error');
        return;
      }

      const payload = {
        id: markId || undefined,
        subject,
        term,
        year,
        marks: score,
        remarks
      };

      try {
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/marks`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          closeModals();
          showToast(`Marks for ${subject} (${score} - Grade ${data.grade}) saved successfully!`, 'success');
          loadAllMarksLedger();
          if (AppState.currentEntity && AppState.currentEntity.id === studentId) {
            loadStudentDossierMarks(studentId);
          }
        } else {
          showToast(data.error || 'Failed to save marks', 'error');
        }
      } catch (err) {
        showToast('Error saving marks', 'error');
      }
    });
  }

  // Marks filter listeners
  const mfSearch = document.getElementById('marksFilterSearch');
  const mfTerm = document.getElementById('marksFilterTerm');
  const mfYear = document.getElementById('marksFilterYear');
  if (mfSearch) mfSearch.addEventListener('input', debounce(() => loadAllMarksLedger(), 300));
  if (mfTerm) mfTerm.addEventListener('change', () => loadAllMarksLedger());
  if (mfYear) mfYear.addEventListener('change', () => loadAllMarksLedger());

  // Bulk Excel Upload form handler
  const bulkUploadForm = document.getElementById('bulkUploadForm');
  if (bulkUploadForm) {
    bulkUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const entityType = document.getElementById('bulkUploadEntityType')?.value || 'student';
      const fileInput = document.getElementById('bulkUploadFileInput');
      const modeSelect = document.getElementById('bulkUploadModeSelect');
      const submitBtn = document.getElementById('bulkUploadSubmitBtn');
      const submitText = document.getElementById('bulkUploadSubmitText');
      const resBox = document.getElementById('bulkUploadResultBox');

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please select an Excel (.xlsx) or CSV (.csv) file to upload.", "error");
        return;
      }

      const file = fileInput.files[0];
      const mode = modeSelect ? modeSelect.value : 'upsert';

      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = "Processing Sheet...";
      if (resBox) {
        resBox.className = "rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600 text-xs";
        resBox.innerHTML = "Reading and validating Excel records...";
        resBox.classList.remove('hidden');
      }

      try {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });

        const endpoint = entityType === 'staff' ? '/api/staff/bulk' : '/api/students/bulk';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            filename: file.name,
            file_base64: base64Data,
            mode: mode
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const hasErrors = data.error_count > 0;
          if (resBox) {
            resBox.className = `rounded-xl border p-4 space-y-2 text-xs ${
              hasErrors ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`;
            const errListHtml = hasErrors
              ? `<div class="mt-2 pt-2 border-t border-amber-200 max-h-36 overflow-y-auto space-y-1">
                   <div class="font-extrabold uppercase text-[10px] text-rose-800">Row Warnings / Errors (${data.error_count}):</div>
                   ${data.errors.map(er => `<div class="text-[11px] text-rose-700">• <strong>Row ${er.row}</strong> (${escapeHtml(er.identifier)}): ${escapeHtml(er.error)}</div>`).join('')}
                 </div>`
              : '';

            resBox.innerHTML = `
              <div class="font-extrabold uppercase text-xs flex items-center justify-between">
                <span>✓ Bulk Import Completed (${escapeHtml(file.name)})</span>
                <span class="font-mono">${data.total_rows} Rows Processed</span>
              </div>
              <div class="grid grid-cols-3 gap-2 pt-1 text-center">
                <div class="bg-white p-2 rounded border border-emerald-200">
                  <div class="text-base font-extrabold text-emerald-700">${data.created_count}</div>
                  <div class="text-[10px] uppercase font-bold text-slate-500">New Added</div>
                </div>
                <div class="bg-white p-2 rounded border border-blue-200">
                  <div class="text-base font-extrabold text-blue-700">${data.updated_count}</div>
                  <div class="text-[10px] uppercase font-bold text-slate-500">Updated</div>
                </div>
                <div class="bg-white p-2 rounded border border-slate-200">
                  <div class="text-base font-extrabold text-slate-600">${data.skipped_count}</div>
                  <div class="text-[10px] uppercase font-bold text-slate-500">Skipped</div>
                </div>
              </div>
              ${errListHtml}
            `;
          }
          showToast(`Imported ${data.created_count} new and updated ${data.updated_count} ${entityType} records!`, "success");
          loadStats();
          if (entityType === 'staff') {
            loadStaff();
          } else {
            loadStudents();
          }
        } else {
          if (resBox) {
            resBox.className = "rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 text-xs font-bold";
            resBox.textContent = data.error || "Failed to process bulk upload.";
          }
          showToast(data.error || "Bulk upload failed", "error");
        }
      } catch (err) {
        if (resBox) {
          resBox.className = "rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 text-xs font-bold";
          resBox.textContent = "Error reading or uploading the file to the server.";
        }
        showToast("Error uploading Excel file", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = "Upload & Import Records";
      }
    });
  }
}

async function openEditModal(id, type) {
  if (!AppState.currentUser) {
    showToast("Please sign in to edit records.", "info");
    openLoginModal();
    return;
  }

  if (type === 'student') {
    if (AppState.currentUser.role === 'teacher') {
      // Teachers update marks and academic performance
      openAddMarkModal(id);
      return;
    }

    const res = await fetch(`/api/students/${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
    const s = await res.json();
    if (!res.ok) return showToast("Could not retrieve student details", "error");

    document.getElementById('studentModalTitle').textContent = `Edit Student: ${s.admission_no}`;
    document.getElementById('studentFormMode').value = 'edit';
    document.getElementById('studentAdmissionInput').value = s.admission_no;
    document.getElementById('studentAdmissionInput').readOnly = true;
    document.getElementById('studentInitialsInput').value = s.name_with_initials || '';
    document.getElementById('studentFullNameInput').value = s.full_name || '';
    document.getElementById('studentGenderInput').value = s.gender;
    document.getElementById('studentDobInput').value = s.dob || '';
    updateStudentAgeDisplay(s.dob || '');
    document.getElementById('studentGradeInput').value = s.grade;
    document.getElementById('studentStreamInput').value = s.stream || '';

    // Infer or restore Education Level
    let edLevel = s.academic_level || '';
    if (!edLevel) {
      if ((s.stream && s.stream.includes('O/L')) || (s.grade && (s.grade.startsWith('10') || s.grade.startsWith('11')))) {
        edLevel = 'Ordinary Level';
      } else if ((s.stream && s.stream.includes('A/L')) || (s.grade && (s.grade.startsWith('12') || s.grade.startsWith('13')))) {
        edLevel = 'Advanced Level';
      } else if (s.grade && (s.grade.startsWith('6') || s.grade.startsWith('7') || s.grade.startsWith('8') || s.grade.startsWith('9'))) {
        edLevel = 'Grade 6 - 9';
      } else if (s.grade && (s.grade.startsWith('1') || s.grade.startsWith('2') || s.grade.startsWith('3') || s.grade.startsWith('4') || s.grade.startsWith('5'))) {
        edLevel = 'Primary';
      } else if (s.stream && s.stream.includes('13')) {
        edLevel = '13 Years Guaranteed Education Program';
      }
    }
    if (document.getElementById('studentAcademicLevelInput')) {
      document.getElementById('studentAcademicLevelInput').value = edLevel;
    }
    handleEducationLevelChange();

    if (edLevel === 'Ordinary Level') {
      if (document.getElementById('olBucket1Input')) {
        document.getElementById('olBucket1Input').value = s.ol_bucket_1 || findMatchingSubject(s.subjects, ['Citizenship Education', 'Geography', 'Business Studies & Accounting']);
      }
      if (document.getElementById('olBucket2Input')) {
        document.getElementById('olBucket2Input').value = s.ol_bucket_2 || findMatchingSubject(s.subjects, ['Music', 'Art', 'Dancing', 'Drama']);
      }
      if (document.getElementById('olBucket3Input')) {
        document.getElementById('olBucket3Input').value = s.ol_bucket_3 || findMatchingSubject(s.subjects, ['Information & Communication Technology', 'Health', 'Home Science', 'Media', 'Food and Agri Culture']);
      }
    } else if (edLevel === 'Advanced Level') {
      const isCom = (s.stream && s.stream.includes('Commerce')) || (s.subjects && (s.subjects.includes('Accounting') || s.subjects.includes('Business Studies')));
      const isArt = (s.stream && s.stream.includes('Art')) || (s.subjects && (s.subjects.includes('Sinhala') || s.subjects.includes('Drama') || s.subjects.includes('Dancing') || s.subjects.includes('Music') || s.subjects.includes('Buddhist Civilization') || s.subjects.includes('Political Science')));
      const alStream = isCom ? 'Commerce' : (isArt ? 'Art' : 'Commerce');
      if (document.getElementById('alStreamInput')) {
        document.getElementById('alStreamInput').value = alStream;
      }
      handleAlStreamChange();

      const subjs = s.subjects ? s.subjects.split(',').map(x => x.trim()) : [];
      document.querySelectorAll('input[name="alCommerceSubject"]').forEach(cb => {
        cb.checked = subjs.includes(cb.value);
      });
      document.querySelectorAll('input[name="alArtSubject"]').forEach(cb => {
        cb.checked = subjs.includes(cb.value);
      });
      updateAlSubjectCounters();
    }

    document.getElementById('studentMediumInput').value = s.medium;
    document.getElementById('studentHouseInput').value = s.house || getHouseFromAdmission(s.admission_no);
    autoAssignHouseFromAdmission();
    document.getElementById('studentGuardianInput').value = s.guardian_name;
    document.getElementById('studentContactInput').value = s.guardian_contact;
    document.getElementById('studentAddressInput').value = s.address;
    const stuStatus = (s.status && s.status.toLowerCase() === 'graduated') ? 'Alumni' : (s.status || 'Active');
    document.getElementById('studentStatusInput').value = stuStatus;
    document.getElementById('studentExtraInput').value = s.extracurricular || '';
    document.getElementById('studentPhotoInput').value = s.photo_url || '';
    if (document.getElementById('studentHealthInput')) document.getElementById('studentHealthInput').value = s.health_issues || '';
    if (document.getElementById('studentNotesInput')) document.getElementById('studentNotesInput').value = s.notes || '';

    document.body.style.overflow = 'hidden';
    document.getElementById('studentModal').classList.remove('hidden');
  } else {
    if (AppState.currentUser.role !== 'admin') {
      showToast("Only school administrators can edit faculty records.", "error");
      return;
    }

    const [, res] = await Promise.all([
      ensureTimetableDataLoaded(),
      fetch(`/api/staff/${encodeURIComponent(id)}`, { headers: getAuthHeaders() })
    ]);
    const st = await res.json();
    if (!res.ok) return showToast("Could not retrieve staff details", "error");
    const ttProf = findStaffTimetableProfile(st);

    document.getElementById('staffModalTitle').textContent = `Edit Faculty Member: ${st.id}`;
    document.getElementById('staffFormMode').value = 'edit';
    document.getElementById('staffIdInput').value = st.id;
    document.getElementById('staffIdInput').readOnly = true;
    document.getElementById('staffEpfInput').value = st.epf_no || '';
    document.getElementById('staffInitialsInput').value = st.name_with_initials || '';
    document.getElementById('staffFullNameInput').value = st.full_name || '';
    if (document.getElementById('staffGenderInput')) document.getElementById('staffGenderInput').value = st.gender || 'Male';
    if (document.getElementById('staffDobInput')) {
      document.getElementById('staffDobInput').value = st.dob || '';
      updateStaffAgeDisplay(st.dob || '');
    }
    if (document.getElementById('staffNicInput')) document.getElementById('staffNicInput').value = st.nic || '';
    document.getElementById('staffRoleInput').value = st.role || '';
    document.getElementById('staffDeptInput').value = (st.department && st.department !== 'None') ? st.department : (ttProf?.department || '');
    if (document.getElementById('staffAppointedDateInput')) document.getElementById('staffAppointedDateInput').value = st.appointed_date || '';
    if (document.getElementById('staffStatusInput')) document.getElementById('staffStatusInput').value = st.status || 'Active';
    document.getElementById('staffSubjectsInput').value = (st.subjects_taught && st.subjects_taught !== 'None') ? st.subjects_taught : (ttProf?.subjects_taught?.join(', ') || '');
    document.getElementById('staffClassesInput').value = (st.assigned_classes && st.assigned_classes !== 'None') ? st.assigned_classes : (ttProf?.assigned_classes?.join(', ') || '');
    document.getElementById('staffQualInput').value = st.qualifications || '';
    document.getElementById('staffContactInput').value = st.contact_no || '';
    document.getElementById('staffEmailInput').value = st.email || '';
    if (document.getElementById('staffAddressInput')) document.getElementById('staffAddressInput').value = st.address || '';
    if (document.getElementById('staffPhotoInput')) document.getElementById('staffPhotoInput').value = st.photo_url || '';
    if (document.getElementById('staffNotesInput')) document.getElementById('staffNotesInput').value = st.notes || '';

    document.body.style.overflow = 'hidden';
    document.getElementById('staffModal').classList.remove('hidden');
  }
}

async function confirmDelete(id, type, name) {
  if (!AppState.currentUser) {
    showToast("Please sign in as Administrator to delete records.", "info");
    openLoginModal();
    return;
  }
  if (AppState.currentUser.role !== 'admin') {
    showToast("Teacher accounts cannot delete records. Only administrators can delete records.", "error");
    return;
  }

  if (confirm(`Are you sure you want to delete ${type} record for "${name}" (${id})?`)) {
    try {
      const url = type === 'student' ? `/api/students/${encodeURIComponent(id)}` : `/api/staff/${encodeURIComponent(id)}`;
      const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) {
        showToast(`${type} record deleted successfully`, 'success');
        if (type === 'student') loadStudents();
        else loadStaff();
        loadStats();
        if (AppState.currentEntity && AppState.currentEntity.id === id) {
          document.getElementById('lookupResultSection').classList.add('hidden');
        }
      } else {
        const d = await res.json();
        showToast(d.error || `Failed to delete ${type}`, 'error');
      }
    } catch (err) {
      showToast('Error deleting record', 'error');
    }
  }
}

/* --------------------------------------------------------------------------
   Role-Based Authentication & Session Management
   -------------------------------------------------------------------------- */
function initAuth() {
  // Check for session in storage
}

function getAuthHeaders() {
  const token = localStorage.getItem('jmv_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    const data = await res.json();
    if (data.authenticated && data.user) {
      AppState.currentUser = data.user;
    } else {
      AppState.currentUser = null;
    }
  } catch (e) {
    AppState.currentUser = null;
  }
  updateRoleBasedUI();
  return Boolean(AppState.currentUser);
}

function updateRoleBasedUI() {
  const openLoginBtn = document.getElementById('openLoginBtn');
  const userProfilePill = document.getElementById('userProfilePill');
  const userRoleBadge = document.getElementById('userRoleBadge');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const addStudentBtn = document.getElementById('addStudentBtn');
  const bulkStudentBtn = document.getElementById('bulkStudentBtn');
  const staffAdminLockBadge = document.getElementById('staffAdminLockBadge');
  const staffTeacherRestrictedBanner = document.getElementById('staffTeacherRestrictedBanner');
  const staffMainContainer = document.getElementById('staffMainContainer');
  const portalAuthGate = document.getElementById('portalAuthGate');

  const u = AppState.currentUser;

  if (u) {
    if (u.role !== 'admin' && u.role !== 'teacher') {
      if (portalAuthGate) {
        portalAuthGate.innerHTML = `
          <div class="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl border-t-4 border-amber-500">
            <svg class="ui-icon mx-auto mb-4 text-amber-700" style="width:3rem;height:3rem" aria-hidden="true"><use href="#icon-lock"></use></svg>
            <h2 class="text-xl font-extrabold text-slate-900">Data access restricted</h2>
            <p class="mt-2 text-sm text-slate-600">Only teachers and administrators can view portal data.</p>
            <button onclick="handleUserLogout()" class="mt-6 rounded-lg bg-[#800020] px-5 py-2.5 text-xs font-extrabold uppercase text-white shadow hover:bg-[#5c0d1b]">
              Sign out
            </button>
          </div>`;
        portalAuthGate.classList.remove('hidden');
        portalAuthGate.classList.add('flex');
      }
      return;
    }
    if (portalAuthGate) {
      portalAuthGate.classList.add('hidden');
      portalAuthGate.classList.remove('flex');
    }
    if (openLoginBtn) openLoginBtn.classList.add('hidden');
    if (userProfilePill) userProfilePill.classList.remove('hidden');
    if (userNameDisplay) userNameDisplay.textContent = u.full_name || u.username;
    if (userRoleBadge) {
      if (u.role === 'admin') {
        userRoleBadge.textContent = 'ADMIN';
        userRoleBadge.className = 'bg-[#d4af37] text-[#38050b] text-[10px] font-extrabold uppercase px-2 py-0.5 rounded';
      } else {
        userRoleBadge.textContent = 'TEACHER';
        userRoleBadge.className = 'bg-[#5c0d1b] text-[#fde047] text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-[#d4af37]/60';
      }
    }

    const navStaffTab = document.getElementById('navStaffTab');
    const navPaymentsTab = document.getElementById('navPaymentsTab');
    const studentTemplateLink = document.getElementById('studentTemplateLink');
    const timetableForm = document.getElementById('timetableForm');
    const timetableActionHeader = document.getElementById('timetableActionHeader');
    const homeBtnStudents = document.getElementById('homeBtnStudents');
    const homeBtnStaff = document.getElementById('homeBtnStaff');
    const homeBtnTimetable = document.getElementById('homeBtnTimetable');
    const homeBtnPayments = document.getElementById('homeBtnPayments');
    const homeModulesGrid = document.getElementById('homeModulesGrid');
    const homeModulesSubtitle = document.getElementById('homeModulesSubtitle');
    const homeStaffStatCard = document.getElementById('homeStaffStatCard');
    const paymentsTeacherRestrictedBanner = document.getElementById('paymentsTeacherRestrictedBanner');
    const paymentsMainContainer = document.getElementById('paymentsMainContainer');
    const paymentsAdminLockBadge = document.getElementById('paymentsAdminLockBadge');

    if (u.role === 'teacher') {
      if (addStudentBtn) addStudentBtn.style.display = 'none';
      if (bulkStudentBtn) bulkStudentBtn.style.display = 'none';
      if (studentTemplateLink) studentTemplateLink.style.display = 'none';
      if (navStaffTab) navStaffTab.style.display = 'none';
      if (navPaymentsTab) navPaymentsTab.style.display = 'none';
      if (staffAdminLockBadge) staffAdminLockBadge.classList.remove('hidden');
      if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.remove('hidden');
      if (staffMainContainer) staffMainContainer.classList.add('hidden');
      if (paymentsTeacherRestrictedBanner) paymentsTeacherRestrictedBanner.classList.remove('hidden');
      if (paymentsMainContainer) paymentsMainContainer.classList.add('hidden');
      if (paymentsAdminLockBadge) paymentsAdminLockBadge.classList.remove('hidden');
      if (timetableForm) timetableForm.classList.add('hidden');
      if (timetableActionHeader) timetableActionHeader.style.display = 'none';

      // Home Page Buttons for Teachers: ONLY Students & Timetable
      if (homeBtnStudents) homeBtnStudents.style.display = 'flex';
      if (homeBtnTimetable) homeBtnTimetable.style.display = 'flex';
      if (homeBtnStaff) homeBtnStaff.style.display = 'none';
      if (homeBtnPayments) homeBtnPayments.style.display = 'none';
      if (homeStaffStatCard) homeStaffStatCard.style.display = 'none';
      if (homeModulesGrid) homeModulesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto gap-6 sm:gap-8';
    } else if (u.role === 'admin') {
      if (addStudentBtn) addStudentBtn.style.display = 'inline-flex';
      if (bulkStudentBtn) bulkStudentBtn.style.display = 'inline-flex';
      if (studentTemplateLink) studentTemplateLink.style.display = 'inline-flex';
      if (navStaffTab) navStaffTab.style.display = 'inline-flex';
      if (navPaymentsTab) navPaymentsTab.style.display = 'inline-flex';
      if (staffAdminLockBadge) staffAdminLockBadge.classList.add('hidden');
      if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.add('hidden');
      if (staffMainContainer) staffMainContainer.classList.remove('hidden');
      if (paymentsTeacherRestrictedBanner) paymentsTeacherRestrictedBanner.classList.add('hidden');
      if (paymentsMainContainer) paymentsMainContainer.classList.remove('hidden');
      if (paymentsAdminLockBadge) paymentsAdminLockBadge.classList.add('hidden');
      if (timetableForm) timetableForm.classList.remove('hidden');
      if (timetableActionHeader) timetableActionHeader.style.display = '';

      // Home Page Buttons for Admins: Students, Staff, Timetable, Payments
      if (homeBtnStudents) homeBtnStudents.style.display = 'flex';
      if (homeBtnStaff) homeBtnStaff.style.display = 'flex';
      if (homeBtnTimetable) homeBtnTimetable.style.display = 'flex';
      if (homeBtnPayments) homeBtnPayments.style.display = 'flex';
      if (homeStaffStatCard) homeStaffStatCard.style.display = 'flex';
      if (homeModulesGrid) homeModulesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8';
    }
    updateHomeView();
  } else {
    const navStaffTab = document.getElementById('navStaffTab');
    const navPaymentsTab = document.getElementById('navPaymentsTab');
    const studentTemplateLink = document.getElementById('studentTemplateLink');
    const timetableForm = document.getElementById('timetableForm');
    const timetableActionHeader = document.getElementById('timetableActionHeader');

    if (portalAuthGate) {
      portalAuthGate.classList.remove('hidden');
      portalAuthGate.classList.add('flex');
    }
    if (openLoginBtn) openLoginBtn.classList.remove('hidden');
    if (userProfilePill) userProfilePill.classList.add('hidden');
    if (addStudentBtn) addStudentBtn.style.display = 'inline-flex';
    if (bulkStudentBtn) bulkStudentBtn.style.display = 'inline-flex';
    if (studentTemplateLink) studentTemplateLink.style.display = 'inline-flex';
    if (navStaffTab) navStaffTab.style.display = 'inline-flex';
    if (navPaymentsTab) navPaymentsTab.style.display = 'inline-flex';
    if (staffAdminLockBadge) staffAdminLockBadge.classList.add('hidden');
    if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.add('hidden');
    if (staffMainContainer) staffMainContainer.classList.remove('hidden');
    if (timetableForm) timetableForm.classList.remove('hidden');
    if (timetableActionHeader) timetableActionHeader.style.display = '';
  }

  // Refresh student table actions if populated
  if (AppState.studentsList && AppState.studentsList.length > 0) {
    renderStudentsTable(AppState.studentsList);
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const errBox = document.getElementById('loginErrorMsg');
  if (errBox) errBox.classList.add('hidden');
  if (modal) modal.classList.remove('hidden');
  const uInput = document.getElementById('loginUsernameInput');
  if (uInput) uInput.focus();
}

function fillLoginForm(username, password) {
  const u = document.getElementById('loginUsernameInput');
  const p = document.getElementById('loginPasswordInput');
  if (u) u.value = username;
  if (p) p.value = password;
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleUserLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
  } catch (e) {}
  localStorage.removeItem('jmv_token');
  AppState.currentUser = null;
  updateRoleBasedUI();
  showToast('Signed out of school portal.', 'info');
  switchTab('lookup');
}

/* --------------------------------------------------------------------------
   Marks Ledger & Student Gradebook Management
   -------------------------------------------------------------------------- */
async function loadAllMarksLedger() {
  const search = document.getElementById('marksFilterSearch')?.value.trim() || '';
  const term = document.getElementById('marksFilterTerm')?.value || '';
  const year = document.getElementById('marksFilterYear')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (term) params.append('term', term);
  if (year) params.append('year', year);

  const tbody = document.getElementById('marksTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/marks?${params.toString()}`, { headers: getAuthHeaders() });
    const marks = await res.json();
    AppState.marksList = marks;
    renderMarksTable(marks);
  } catch (err) {
    console.error("Failed to load marks:", err);
  }
}

function renderMarksTable(marks) {
  const tbody = document.getElementById('marksTableBody');
  if (!tbody) return;

  if (!marks || marks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center p-8 text-slate-400">
          No examination marks recorded for the selected criteria.
        </td>
      </tr>
    `;
    return;
  }

  const gradeColors = {
    'A': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'B': 'bg-blue-100 text-blue-800 border-blue-300',
    'C': 'bg-amber-100 text-amber-800 border-amber-300',
    'S': 'bg-purple-100 text-purple-800 border-purple-300',
    'F': 'bg-rose-100 text-rose-800 border-rose-300'
  };

  tbody.innerHTML = marks.map(m => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3.5">
        <div class="flex items-center gap-2">
          <button onclick="lookupFromTable('${m.student_id}')" class="font-mono font-bold text-[#800020] hover:underline cursor-pointer" title="View student profile">
            ${escapeHtml(m.student_id)}
          </button>
          <span class="text-slate-800 font-bold">${escapeHtml(m.student_name || m.name_with_initials || '')}</span>
        </div>
      </td>
      <td class="p-3.5 font-bold text-slate-600">${escapeHtml(m.student_grade || '')}</td>
      <td class="p-3.5 font-bold text-slate-800">${escapeHtml(m.subject)}</td>
      <td class="p-3.5 text-slate-600 font-semibold">${escapeHtml(m.term)} • ${escapeHtml(m.year)}</td>
      <td class="p-3.5 text-center font-mono font-extrabold text-sm text-slate-900">${m.marks}</td>
      <td class="p-3.5 text-center">
        <span class="font-extrabold px-2.5 py-0.5 rounded border text-xs inline-block ${gradeColors[m.grade] || 'bg-slate-100 text-slate-700'}">
          ${escapeHtml(m.grade)}
        </span>
      </td>
      <td class="p-3.5 text-slate-600 italic max-w-[200px] truncate" title="${escapeHtml(m.remarks || '')}">${escapeHtml(m.remarks || '—')}</td>
      <td class="p-3.5 text-slate-500 text-[11px]">${escapeHtml(m.updated_by || 'Staff')}</td>
      <td class="p-3.5 text-right">
        <div class="inline-flex items-center gap-1.5">
          <button onclick="openAddMarkModal('${m.student_id}', '${escapeHtml(m.subject)}', '${escapeHtml(m.term)}', '${escapeHtml(m.year)}', ${m.marks}, '${escapeHtml(m.remarks || '')}', '${m.id}')" class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors cursor-pointer" title="Edit Mark">
            ${icon('edit')}
          </button>
          <button onclick="confirmDeleteMark('${m.id}', '${escapeHtml(m.student_id)}', '${escapeHtml(m.subject)}')" class="p-1.5 bg-slate-100 hover:bg-rose-600 hover:text-white rounded transition-colors cursor-pointer" title="Delete Mark">
            ${icon('trash')}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddMarkModal(studentId = null, subject = '', term = 'Term 1', year = '2026', currentMarks = '', currentRemarks = '', markId = '') {
  if (!AppState.currentUser) {
    showToast("Please sign in as a Teacher or Administrator to record marks.", "info");
    openLoginModal();
    return;
  }

  const modal = document.getElementById('marksModal');
  const title = document.getElementById('marksModalTitle');
  const studentSelect = document.getElementById('marksFormStudentSelect');
  const markIdInput = document.getElementById('marksFormMarkId');
  const subjectInput = document.getElementById('marksFormSubject');
  const termSelect = document.getElementById('marksFormTerm');
  const yearSelect = document.getElementById('marksFormYear');
  const scoreInput = document.getElementById('marksFormScore');
  const remarksInput = document.getElementById('marksFormRemarks');

  if (markIdInput) markIdInput.value = markId || '';
  if (title) title.textContent = markId ? "Edit Student Examination Mark" : "Enter Student Examination Marks";

  // Populate student select
  if (studentSelect && AppState.studentsList) {
    studentSelect.innerHTML = AppState.studentsList.map(s => `
      <option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>
        ${s.id} - ${s.name_with_initials} (${s.grade} - ${s.stream})
      </option>
    `).join('');
  }

  if (subjectInput) subjectInput.value = subject || '';
  if (termSelect) termSelect.value = term || 'Term 1';
  if (yearSelect) yearSelect.value = year || '2026';
  if (scoreInput) {
    scoreInput.value = currentMarks !== '' ? currentMarks : '';
    updateGradePreview(scoreInput.value);
  }
  if (remarksInput) remarksInput.value = currentRemarks || '';

  if (modal) modal.classList.remove('hidden');
}

function updateGradePreview(val) {
  const badge = document.getElementById('marksFormGradeBadge');
  if (!badge) return;
  const num = parseFloat(val);
  if (isNaN(num) || val === '') {
    badge.textContent = '-';
    badge.className = 'p-2 border border-slate-200 rounded-lg text-center font-extrabold text-sm bg-slate-100 text-slate-500';
    return;
  }
  let g = 'F';
  let desc = 'Fail';
  let cls = 'bg-rose-100 text-rose-800 border-rose-300';
  if (num >= 75) { g = 'A'; desc = 'Distinction (විශිෂ්ට)'; cls = 'bg-emerald-100 text-emerald-800 border-emerald-400'; }
  else if (num >= 65) { g = 'B'; desc = 'Very Good (ඉතා හොඳ)'; cls = 'bg-blue-100 text-blue-800 border-blue-400'; }
  else if (num >= 50) { g = 'C'; desc = 'Credit (සම්මාන)'; cls = 'bg-amber-100 text-amber-800 border-amber-400'; }
  else if (num >= 35) { g = 'S'; desc = 'Ordinary Pass (සාමාන්‍ය)'; cls = 'bg-purple-100 text-purple-800 border-purple-400'; }

  badge.textContent = `Grade: ${g} (${desc})`;
  badge.className = `p-2 border rounded-lg text-center font-extrabold text-sm ${cls}`;
}

async function confirmDeleteMark(markId, studentId, subject) {
  if (!AppState.currentUser) {
    showToast("Please sign in to delete marks.", "info");
    openLoginModal();
    return;
  }

  if (confirm(`Delete mark entry for "${subject}" on student ${studentId}?`)) {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/marks/${encodeURIComponent(markId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        showToast("Mark entry deleted.", "success");
        loadAllMarksLedger();
        if (AppState.currentEntity && AppState.currentEntity.id === studentId) {
          loadStudentDossierMarks(studentId);
        }
      } else {
        const d = await res.json();
        showToast(d.error || "Failed to delete mark", "error");
      }
    } catch (e) {
      showToast("Error deleting mark", "error");
    }
  }
}

async function loadStudentDossierMarks(studentId) {
  const content = document.getElementById('dossierMarksContent');
  if (!content) return;

  try {
    const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/marks`, { headers: getAuthHeaders() });
    const marks = await res.json();
    if (!marks || marks.length === 0) {
      content.innerHTML = `
        <div class="py-4 text-center text-slate-400">
          No examination marks recorded yet for this student.
          <div class="mt-2">
            <button onclick="openAddMarkModal('${escapeHtml(studentId)}')" class="px-3 py-1 bg-slate-100 hover:bg-[#800020] hover:text-white rounded text-xs font-bold transition-colors cursor-pointer">
              + Enter First Term Mark
            </button>
          </div>
        </div>
      `;
      return;
    }

    const gradeColors = {
      'A': 'bg-emerald-100 text-emerald-800 border-emerald-300',
      'B': 'bg-blue-100 text-blue-800 border-blue-300',
      'C': 'bg-amber-100 text-amber-800 border-amber-300',
      'S': 'bg-purple-100 text-purple-800 border-purple-300',
      'F': 'bg-rose-100 text-rose-800 border-rose-300'
    };

    content.innerHTML = `
      <table class="w-full text-left">
        <thead class="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] border-b border-slate-200">
          <tr>
            <th class="p-2">Subject</th>
            <th class="p-2">Term &amp; Year</th>
            <th class="p-2 text-center">Score</th>
            <th class="p-2 text-center">Grade</th>
            <th class="p-2">Teacher Remarks</th>
            <th class="p-2">Assessed By</th>
            <th class="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${marks.map(m => `
            <tr class="hover:bg-white transition-colors">
              <td class="p-2 font-bold text-slate-800">${escapeHtml(m.subject)}</td>
              <td class="p-2 text-slate-600">${escapeHtml(m.term)} • ${escapeHtml(m.year)}</td>
              <td class="p-2 text-center font-mono font-bold text-slate-900">${m.marks}</td>
              <td class="p-2 text-center">
                <span class="font-extrabold px-2 py-0.5 rounded border text-[11px] inline-block ${gradeColors[m.grade] || 'bg-slate-100 text-slate-700'}">
                  ${escapeHtml(m.grade)}
                </span>
              </td>
              <td class="p-2 text-slate-600 italic">${escapeHtml(m.remarks || '—')}</td>
              <td class="p-2 text-slate-500 text-[10px]">${escapeHtml(m.updated_by || '')}</td>
              <td class="p-2 text-right">
                <button onclick="openAddMarkModal('${m.student_id}', '${escapeHtml(m.subject)}', '${escapeHtml(m.term)}', '${escapeHtml(m.year)}', ${m.marks}, '${escapeHtml(m.remarks || '')}', '${m.id}')" class="p-1 bg-slate-100 hover:bg-[#800020] hover:text-white rounded cursor-pointer" title="Edit Mark">
                  ${icon('edit')}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    content.innerHTML = '<p class="text-rose-500 text-xs">Failed to load academic marks.</p>';
  }
}

/* --------------------------------------------------------------------------
   Helpers: Toast, Escape HTML, Debounce
   -------------------------------------------------------------------------- */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'error' 
    ? 'bg-[#800020] text-white border-2 border-rose-400' 
    : (type === 'success' ? 'bg-[#38050b] text-[#fde047] border-2 border-[#d4af37]' : 'bg-[#5c0d1b] text-white border-2 border-[#d4af37]');
  toast.className = `${bgClass} px-4 py-2.5 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 border-l-4 border-[#d4af37] transition-all transform duration-300`;
  const toastIcon = type === 'success' ? 'shield' : (type === 'error' ? 'alert' : 'clipboard');
  toast.innerHTML = `${icon(toastIcon)} <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/* --------------------------------------------------------------------------
   Home Page View & Quick Search
   -------------------------------------------------------------------------- */
function updateHomeView() {
  const u = AppState.currentUser;
  const greeting = document.getElementById('homeUserGreeting');
  const roleBadge = document.getElementById('homeUserRoleBadge');
  const statStudents = document.getElementById('homeStatStudents');
  const statStaff = document.getElementById('homeStatStaff');
  const studentsCountBadge = document.getElementById('homeStudentsCountBadge');
  const staffCountBadge = document.getElementById('homeStaffCountBadge');
  const paymentsCountBadge = document.getElementById('homePaymentsCountBadge');

  if (greeting && u) {
    greeting.textContent = u.full_name || u.username;
  }
  if (roleBadge && u) {
    if (u.role === 'admin') {
      roleBadge.textContent = 'ADMIN';
      roleBadge.className = 'bg-[#d4af37] text-[#38050b] text-[10px] font-extrabold uppercase px-2 py-0.5 rounded';
    } else {
      roleBadge.textContent = 'TEACHER';
      roleBadge.className = 'bg-[#5c0d1b] text-[#fde047] text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-[#d4af37]/60';
    }
  }

  const stuCount = AppState.studentsList?.length || (AppState.stats?.total_students) || 10;
  const stfCount = AppState.staffList?.length || (AppState.stats?.total_staff) || 8;

  if (statStudents) statStudents.textContent = stuCount;
  if (statStaff) statStaff.textContent = stfCount;
  if (studentsCountBadge) studentsCountBadge.textContent = `${stuCount} Active Students`;
  if (staffCountBadge) staffCountBadge.textContent = `${stfCount} School Faculty`;
  if (paymentsCountBadge) {
    const payCount = AppState.paymentsList?.length || 8;
    paymentsCountBadge.textContent = `${payCount} Fee Records`;
  }
}

function handleHomeQuickSearch() {
  const input = document.getElementById('homeQuickSearchInput');
  const query = input ? input.value.trim() : '';
  if (!query) {
    showToast('Please enter a student/staff ID or name to search.', 'info');
    return;
  }
  const mainSearchInput = document.getElementById('universalSearchInput');
  if (mainSearchInput) mainSearchInput.value = query;
  switchTab('lookup');
  if (typeof executeUniversalSearch === 'function') {
    executeUniversalSearch(query);
  }
}

/* --------------------------------------------------------------------------
   Payments Management (Role: Admin)
   -------------------------------------------------------------------------- */
async function loadPayments() {
  if (AppState.currentUser && AppState.currentUser.role === 'teacher') return;
  try {
    const res = await fetch('/api/payments', { headers: getAuthHeaders() });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) return;
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    AppState.paymentsList = Array.isArray(data) ? data : [];
    renderPaymentsTable(AppState.paymentsList);
    loadPaymentStats();
    populatePaymentStudentDropdown();
    updateHomeView();
  } catch (err) {
    console.error('Failed to load payments:', err);
  }
}

async function loadPaymentStats() {
  try {
    const res = await fetch('/api/payments/stats', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    AppState.paymentStats = data;
    const kpiCollected = document.getElementById('payKpiCollected');
    const kpiPending = document.getElementById('payKpiPending');
    const kpiPaidCount = document.getElementById('payKpiPaidCount');
    const kpiPendingCount = document.getElementById('payKpiPendingCount');
    if (kpiCollected) kpiCollected.textContent = `LKR ${Number(data.total_collected || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (kpiPending) kpiPending.textContent = `LKR ${Number(data.total_pending || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (kpiPaidCount) kpiPaidCount.textContent = data.count_paid || 0;
    if (kpiPendingCount) kpiPendingCount.textContent = data.count_pending || 0;
  } catch (e) {
    console.warn('Failed to load payment stats:', e);
  }
}

function renderPaymentsTable(list) {
  const tbody = document.getElementById('paymentsTableBody');
  const countEl = document.getElementById('payRecordCount');
  if (countEl) countEl.textContent = (list || []).length;
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-400">
          <svg class="ui-icon mx-auto mb-2 text-slate-300" style="width:2rem;height:2rem" aria-hidden="true"><use href="#icon-payments"></use></svg>
          No payment records found matching the current filters.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const isPaid = (p.status || '').toLowerCase() === 'paid';
    const statusBadge = isPaid
      ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#fdf2f4] text-[#800020] border border-rose-200">Paid</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-900 border border-amber-300">Pending</span>`;
    const amt = Number(p.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3.5 font-mono font-bold text-[#800020]">${escapeHtml(p.receipt_no || p.id)}</td>
        <td class="p-3.5">
          <div class="font-bold text-slate-900">${escapeHtml(p.student_name)}</div>
          <div class="text-[11px] text-slate-500 font-mono">${escapeHtml(p.student_id)}</div>
        </td>
        <td class="p-3.5 font-bold text-slate-700">Grade ${escapeHtml(p.grade || '')}</td>
        <td class="p-3.5 text-slate-800 font-medium">${escapeHtml(p.fee_type)}</td>
        <td class="p-3.5 text-right font-mono font-black text-slate-900">LKR ${amt}</td>
        <td class="p-3.5 text-slate-600">${escapeHtml(p.payment_method || 'Cash')}</td>
        <td class="p-3.5 font-mono text-slate-500">${escapeHtml(p.payment_date || '')}</td>
        <td class="p-3.5">${statusBadge}</td>
        <td class="p-3.5 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="viewPaymentReceipt('${escapeHtml(p.id)}')" class="p-1.5 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="View / Print Receipt">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-printer"></use></svg>
            </button>
            <button onclick="handleDeletePayment('${escapeHtml(p.id)}')" class="p-1.5 hover:bg-rose-100 rounded text-rose-700 cursor-pointer" title="Delete record">
              <svg class="ui-icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterPayments() {
  const search = (document.getElementById('paySearchInput')?.value || '').toLowerCase().trim();
  const grade = (document.getElementById('payGradeFilter')?.value || 'all').toLowerCase();
  const status = (document.getElementById('payStatusFilter')?.value || 'all').toLowerCase();

  const filtered = (AppState.paymentsList || []).filter(p => {
    if (grade !== 'all' && String(p.grade).trim().toLowerCase() !== grade) return false;
    if (status !== 'all' && (p.status || '').toLowerCase() !== status) return false;
    if (search) {
      const match = (p.receipt_no || '').toLowerCase().includes(search) ||
                    (p.student_id || '').toLowerCase().includes(search) ||
                    (p.student_name || '').toLowerCase().includes(search) ||
                    (p.fee_type || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderPaymentsTable(filtered);
}

function populatePaymentStudentDropdown() {
  const select = document.getElementById('payFormStudentSelect');
  if (!select) return;
  const students = AppState.studentsList || [];
  let html = '<option value="">-- Select Student --</option>';
  students.forEach(s => {
    html += `<option value="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name_with_initials || s.full_name)}" data-grade="${escapeHtml(s.grade || '')}">${escapeHtml(s.id)} - ${escapeHtml(s.name_with_initials || s.full_name)} (Grade ${s.grade || ''})</option>`;
  });
  select.innerHTML = html;
}

function openPaymentModal() {
  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') {
    showToast('Payment entry is restricted to Administrators.', 'warning');
    return;
  }
  populatePaymentStudentDropdown();
  const dateInput = document.getElementById('payFormDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  const modal = document.getElementById('paymentModal');
  if (modal) modal.classList.remove('hidden');
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const select = document.getElementById('payFormStudentSelect');
  const opt = select ? select.options[select.selectedIndex] : null;
  const studentId = select ? select.value : '';
  const studentName = opt ? (opt.getAttribute('data-name') || opt.text) : '';
  const grade = opt ? (opt.getAttribute('data-grade') || '') : '';
  const feeType = document.getElementById('payFormFeeType')?.value;
  const amount = parseFloat(document.getElementById('payFormAmount')?.value || 0);
  const method = document.getElementById('payFormMethod')?.value;
  const payDate = document.getElementById('payFormDate')?.value;
  const status = document.getElementById('payFormStatus')?.value;
  const term = document.getElementById('payFormTerm')?.value;
  const remarks = document.getElementById('payFormRemarks')?.value;

  if (!studentId || !amount || amount <= 0) {
    showToast('Please select a student and enter a valid payment amount.', 'error');
    return;
  }

  const payload = {
    student_id: studentId,
    student_name: studentName,
    grade: grade,
    fee_type: feeType,
    amount: amount,
    payment_method: method,
    payment_date: payDate,
    status: status,
    term: term,
    year: '2026',
    remarks: remarks
  };

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    showToast('Payment record successfully recorded!', 'success');
    closeModals();
    loadPayments();
  } catch (err) {
    showToast(`Failed to record payment: ${err.message}`, 'error');
  }
}

async function handleDeletePayment(paymentId) {
  if (!confirm('Are you sure you want to delete this payment record? This action will be logged in the audit trail.')) {
    return;
  }
  try {
    const res = await fetch(`/api/payments/${encodeURIComponent(paymentId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('Payment record deleted.', 'info');
    loadPayments();
  } catch (err) {
    showToast(`Failed to delete payment: ${err.message}`, 'error');
  }
}

function viewPaymentReceipt(paymentId) {
  const p = (AppState.paymentsList || []).find(item => item.id === paymentId);
  if (!p) return;
  const area = document.getElementById('receiptPrintArea');
  if (!area) return;

  const amt = Number(p.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  area.innerHTML = `
    <div class="border-2 border-[#800020] rounded-xl p-5 space-y-4 font-sans bg-white text-slate-800">
      <div class="flex items-center justify-between border-b-2 border-[#d4af37] pb-3">
        <div class="flex items-center gap-3">
          <img src="/static/img/JMV_Logo.png" class="w-12 h-12 object-contain" alt="Crest">
          <div>
            <div class="font-black text-[#800020] text-sm uppercase">Jayakody Maha Vidyalaya</div>
            <div class="text-[10px] text-slate-600 font-bold">Official School Fee Receipt</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] text-slate-500 font-bold uppercase">Receipt No</div>
          <div class="text-sm font-black font-mono text-[#800020]">${escapeHtml(p.receipt_no || p.id)}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div><span class="text-slate-500">Student Name:</span> <strong>${escapeHtml(p.student_name)}</strong></div>
        <div><span class="text-slate-500">Student ID:</span> <strong class="font-mono">${escapeHtml(p.student_id)}</strong></div>
        <div><span class="text-slate-500">Grade:</span> <strong>Grade ${escapeHtml(p.grade || '')}</strong></div>
        <div><span class="text-slate-500">Academic Term:</span> <strong>${escapeHtml(p.term || 'Term 1')} (2026)</strong></div>
        <div><span class="text-slate-500">Date Paid:</span> <strong>${escapeHtml(p.payment_date)}</strong></div>
        <div><span class="text-slate-500">Payment Mode:</span> <strong>${escapeHtml(p.payment_method || 'Cash')}</strong></div>
      </div>

      <div class="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div class="flex justify-between items-center text-xs">
          <span class="font-bold text-slate-700">${escapeHtml(p.fee_type)}</span>
          <span class="font-black font-mono text-sm text-[#800020]">LKR ${amt}</span>
        </div>
        ${p.remarks ? `<div class="text-[11px] text-slate-500 mt-1 italic">Remarks: ${escapeHtml(p.remarks)}</div>` : ''}
      </div>

      <div class="flex justify-between items-center pt-2 text-[11px] text-slate-500">
        <div>Status: <strong class="text-emerald-700 uppercase">${escapeHtml(p.status || 'Paid')}</strong></div>
        <div>Issued by: <strong>${escapeHtml(p.received_by || 'School Administration')}</strong></div>
      </div>
    </div>
  `;

  const modal = document.getElementById('receiptModal');
  if (modal) modal.classList.remove('hidden');
}
