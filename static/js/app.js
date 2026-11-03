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
  marksList: [],
  stats: null,
  activeTab: 'lookup',
  language: 'en'             // 'en' | 'si'
};

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initLiveClock();
  initNavigation();
  initUniversalSearch();
  initResultControls();
  initDirectoryFilters();
  initModals();
  initTimetable();
  initQuickPills();
  initAuth();

  // Load initial data
  checkDbHealth();
  loadStats();
  const authenticated = await checkAuth();
  if (authenticated && ['admin', 'teacher'].includes(AppState.currentUser.role)) {
    loadStudents();
    loadStaff();
  }

  // Check URL params for direct ID lookup e.g. ?id=JMV-STU-1001
  const urlParams = new URLSearchParams(window.location.search);
  const directId = urlParams.get('id');
  if (directId) {
    executeLookup(directId);
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

  // Refresh data if needed
  if (tabId === 'students') loadStudents();
  if (tabId === 'marks') loadAllMarksLedger();
  if (tabId === 'timetable') loadTimetable();
  if (tabId === 'staff') {
    if (AppState.currentUser && AppState.currentUser.role === 'teacher') {
      const banner = document.getElementById('staffTeacherRestrictedBanner');
      const container = document.getElementById('staffMainContainer');
      if (banner) banner.classList.remove('hidden');
      if (container) container.classList.add('hidden');
    } else {
      loadStaff();
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
}

async function loadTimetable() {
      const admin = AppState.currentUser && AppState.currentUser.role === 'admin';
      const restricted = document.getElementById('timetableRestrictedBanner');
      const container = document.getElementById('timetableAdminContainer');
      if (!admin) {
        if (restricted) restricted.classList.remove('hidden');
        if (container) container.classList.add('hidden');
        return;
      }
      if (restricted) restricted.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      try {
        const [entriesRes, staffRes] = await Promise.all([
          fetch('/api/timetable', { headers: getAuthHeaders() }),
          fetch('/api/staff', { headers: getAuthHeaders() })
        ]);
        if (!entriesRes.ok || !staffRes.ok) throw new Error('Unable to load timetable data.');
        const entries = await entriesRes.json();
        AppState.timetableList = entries;
        const staff = await staffRes.json();
        const teacherSelect = document.getElementById('timetableTeacher');
        if (teacherSelect) {
          teacherSelect.innerHTML = '<option value="">Select teacher</option>' +
            staff.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name_with_initials || t.full_name)}</option>`).join('');
        }
        const tbody = document.getElementById('timetableTableBody');
        if (tbody) tbody.innerHTML = entries.length ? entries.map(entry => `
          <tr>
            <td class="p-3 font-semibold">${escapeHtml(entry.class_name)}</td>
            <td class="p-3">${escapeHtml(entry.day_of_week)}</td>
            <td class="p-3">Period ${entry.period_no}</td>
            <td class="p-3">${escapeHtml(entry.subject)}</td>
            <td class="p-3">${escapeHtml(entry.teacher_name)}</td>
            <td class="p-3 text-right whitespace-nowrap">
              <button onclick="editTimetableEntryById('${escapeHtml(entry.id)}')" class="text-[#800020] font-bold text-xs mr-3">${icon('edit')} Edit</button>
              <button onclick="deleteTimetableEntry('${escapeHtml(entry.id)}')" class="text-red-700 font-bold text-xs">${icon('trash')} Delete</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" class="p-8 text-center text-slate-500">No timetable entries have been created.</td></tr>';
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    async function saveTimetableEntry(event) {
      event.preventDefault();
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
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to save timetable entry.');
        showToast('Timetable entry saved.', 'success');
        resetTimetableForm();
        loadTimetable();
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    function editTimetableEntry(entry) {
      document.getElementById('timetableEntryId').value = entry.id;
      document.getElementById('timetableClass').value = entry.class_name;
      document.getElementById('timetableDay').value = entry.day_of_week;
      document.getElementById('timetablePeriod').value = entry.period_no;
      document.getElementById('timetableSubject').value = entry.subject;
      document.getElementById('timetableTeacher').value = entry.teacher_id;
      document.getElementById('timetableCancelBtn').classList.remove('hidden');
      document.getElementById('timetableClass').focus();
    }

    function editTimetableEntryById(id) {
      const entry = AppState.timetableList.find(item => String(item.id) === String(id));
      if (entry) editTimetableEntry(entry);
    }

    async function deleteTimetableEntry(id) {
      if (!confirm('Delete this timetable entry?')) return;
      try {
        const response = await fetch(`/api/timetable/${encodeURIComponent(id)}`, {method: 'DELETE'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to delete timetable entry.');
        showToast('Timetable entry deleted.', 'success');
        loadTimetable();
      } catch (error) {
        showToast(error.message, 'error');
      }
    }

    function resetTimetableForm() {
      document.getElementById('timetableForm').reset();
      document.getElementById('timetableEntryId').value = '';
      document.getElementById('timetableCancelBtn').classList.add('hidden');
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
      <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${item.type === 'student' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">
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
    const res = await fetch(`/api/lookup?id=${encodeURIComponent(queryId)}`, { headers: getAuthHeaders() });
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
      ? 'bg-blue-600 text-white text-xs font-extrabold uppercase px-3 py-1 rounded' 
      : 'bg-[#d4af37] text-[#38050b] text-xs font-extrabold uppercase px-3 py-1 rounded';
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

function renderDossier(item, type) {
  const dossierArea = document.getElementById('idCardDossierView');
  if (!dossierArea) return;

  const isStudent = type === 'student';
  const recordKey = isStudent ? item.admission_no : item.id;
  const avatarUrl = item.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name_with_initials)}&background=5c0d1b&color=fff&size=200`;

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
          <span class="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">${escapeHtml(item.status)}</span>
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
          <span class="block uppercase font-bold text-slate-400">Gender &amp; DOB</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.gender)} • ${escapeHtml(item.dob)}</span>
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
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('building')} Executive &amp; Institutional Service Details
      </h4>
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
          <span class="font-bold text-slate-800">${escapeHtml(item.department || '—')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Subjects Taught</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.subjects_taught || 'General Administration')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Assigned Classes</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.assigned_classes || 'N/A')}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Appointment Date</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.appointed_date)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">Status</span>
          <span class="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">${escapeHtml(item.status)}</span>
        </div>
      </div>
    </div>

    <!-- Credentials -->
    <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
      <h4 class="font-extrabold text-[#800020] text-sm uppercase border-b border-slate-200 pb-2 flex items-center gap-2">
        ${icon('clipboard')} Academic Qualifications &amp; Credentials
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <span class="block uppercase font-bold text-slate-400">Qualifications</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.qualifications)}</span>
        </div>
        <div>
          <span class="block uppercase font-bold text-slate-400">National ID (NIC)</span>
          <span class="font-bold text-slate-800">${escapeHtml(item.nic)}</span>
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
        <div class="space-y-2 pt-2">
          <button onclick="copyIdToClipboard('${recordKey}')" class="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-white shadow-sm transition-all">
            ${icon('clipboard')} ${isStudent ? 'Copy Admission No' : 'Copy ID'}
          </button>
          <button onclick="openEditModal('${recordKey}', '${type}')" class="w-full py-2 px-3 bg-[#800020] hover:bg-[#5c0d1b] text-white rounded-lg text-xs font-bold uppercase shadow transition-all">
            ${icon('edit')} Edit Record
          </button>
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
      if (AppState.currentEntity && AppState.currentEntityType) {
        const key = AppState.currentEntityType === 'student'
          ? AppState.currentEntity.admission_no
          : AppState.currentEntity.id;
        openEditModal(key, AppState.currentEntityType);
      }
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
    const students = await res.json();
    AppState.studentsList = students;
    renderStudentsTable(students);
  } catch (err) {
    console.error("Failed to load students:", err);
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('studentsTableBody');
  const countBadge = document.getElementById('studentsCountBadge');
  if (countBadge) countBadge.textContent = `${students.length} Enrolled`;

  if (!tbody) return;

  if (!students || students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center p-8 text-slate-400">
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

  tbody.innerHTML = students.map(s => `
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
      <td class="p-3.5 text-xs text-slate-600">${escapeHtml(s.admission_no)}</td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded ${houseThemes[s.house] || 'bg-slate-100 text-slate-800'}">
          ${escapeHtml(s.house)}
        </span>
      </td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
          ${escapeHtml(s.status)}
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
  `).join('');
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
    const res = await fetch(`/api/staff?${params.toString()}`, { headers: getAuthHeaders() });
    if (res.status === 403) {
      if (banner) banner.classList.remove('hidden');
      if (container) container.classList.add('hidden');
      return;
    }
    if (banner) banner.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    const staff = await res.json();
    AppState.staffList = staff;
    renderStaffTable(staff);
  } catch (err) {
    console.error("Failed to load staff:", err);
  }
}

function renderStaffTable(staff) {
  const tbody = document.getElementById('staffTableBody');
  const countBadge = document.getElementById('staffCountBadge');
  if (countBadge) countBadge.textContent = `${staff.length} Faculty Members`;

  if (!tbody) return;

  if (!staff || staff.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center p-8 text-slate-400">
          No faculty members matching criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = staff.map(st => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3.5 font-mono font-bold text-[#800020]">
        <button onclick="lookupFromTable('${st.id}')" class="bg-slate-100 hover:bg-[#800020] hover:text-white px-2 py-0.5 rounded transition-colors" title="View profile">
          ${escapeHtml(st.id)}
        </button>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-3">
          <img src="${st.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(st.name_with_initials)}&background=5c0d1b&color=fff`}" class="w-8 h-8 rounded-full object-cover border border-[#d4af37]" alt="${st.name_with_initials}">
          <div>
            <div class="font-bold text-slate-800">${escapeHtml(st.name_with_initials)}</div>
            <div class="text-[11px] text-[#800020] font-semibold">${escapeHtml(st.role)}</div>
          </div>
        </div>
      </td>
      <td class="p-3.5 text-xs text-slate-700">${escapeHtml(st.department || '—')}</td>
      <td class="p-3.5 text-xs text-slate-600">${escapeHtml(st.subjects_taught || 'General Administration')}</td>
      <td class="p-3.5 text-xs text-slate-600">${escapeHtml(st.address || '—')}</td>
      <td class="p-3.5 font-mono text-xs text-slate-600">${escapeHtml(st.epf_no || '—')}</td>
      <td class="p-3.5">
        <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
          ${escapeHtml(st.status)}
        </span>
      </td>
      <td class="p-3.5">
        <div class="flex items-center gap-1.5">
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors" title="View Profile" onclick="lookupFromTable('${st.id}')">
            ${icon('search')}
          </button>
          <button class="p-1.5 bg-slate-100 hover:bg-[#800020] hover:text-white rounded transition-colors" title="Edit Staff" onclick="openEditModal('${st.id}', 'staff')">
            ${icon('edit')}
          </button>
          <button class="p-1.5 bg-slate-100 hover:bg-rose-600 hover:text-white rounded transition-colors" title="Delete Staff" onclick="confirmDelete('${st.id}', 'staff', '${escapeHtml(st.name_with_initials)}')">
            ${icon('trash')}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
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
async function loadStats() {
  try {
    const res = await fetch('/api/stats', { headers: getAuthHeaders() });
    if (!res.ok) {
      console.warn("Stats API returned status:", res.status);
      return;
    }
    const stats = await res.json();
    AppState.stats = stats;

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
  if (studentModal) studentModal.classList.add('hidden');
  if (staffModal) staffModal.classList.add('hidden');
  if (loginModal) loginModal.classList.add('hidden');
  if (marksModal) marksModal.classList.add('hidden');
  if (bulkUploadModal) bulkUploadModal.classList.add('hidden');
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

  const admInput = document.getElementById('studentAdmissionInput');
  if (admInput) {
    admInput.addEventListener('input', autoAssignHouseFromAdmission);
    admInput.addEventListener('change', autoAssignHouseFromAdmission);
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
            }
          }
          if (AppState.activeTab === 'marks') {
            loadAllMarksLedger();
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
    document.getElementById('studentDobInput').value = s.dob;
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
    document.getElementById('studentStatusInput').value = s.status;
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

    const res = await fetch(`/api/staff/${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
    const st = await res.json();
    if (!res.ok) return showToast("Could not retrieve staff details", "error");

    document.getElementById('staffModalTitle').textContent = `Edit Faculty Member: ${st.id}`;
    document.getElementById('staffFormMode').value = 'edit';
    document.getElementById('staffIdInput').value = st.id;
    document.getElementById('staffIdInput').readOnly = true;
    document.getElementById('staffEpfInput').value = st.epf_no || '';
    document.getElementById('staffInitialsInput').value = st.name_with_initials || '';
    document.getElementById('staffFullNameInput').value = st.full_name || '';
    if (document.getElementById('staffGenderInput')) document.getElementById('staffGenderInput').value = st.gender || 'Male';
    if (document.getElementById('staffNicInput')) document.getElementById('staffNicInput').value = st.nic || '';
    document.getElementById('staffRoleInput').value = st.role || '';
    document.getElementById('staffDeptInput').value = st.department || '';
    if (document.getElementById('staffAppointedDateInput')) document.getElementById('staffAppointedDateInput').value = st.appointed_date || '';
    if (document.getElementById('staffStatusInput')) document.getElementById('staffStatusInput').value = st.status || 'Active';
    document.getElementById('staffSubjectsInput').value = st.subjects_taught || '';
    document.getElementById('staffClassesInput').value = st.assigned_classes || '';
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
        userRoleBadge.className = 'bg-blue-600 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded';
      }
    }

    if (u.role === 'teacher') {
      if (addStudentBtn) addStudentBtn.style.display = 'none';
      if (bulkStudentBtn) bulkStudentBtn.style.display = 'none';
      if (staffAdminLockBadge) staffAdminLockBadge.classList.remove('hidden');
      if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.remove('hidden');
      if (staffMainContainer) staffMainContainer.classList.add('hidden');
    } else if (u.role === 'admin') {
      if (addStudentBtn) addStudentBtn.style.display = 'inline-flex';
      if (bulkStudentBtn) bulkStudentBtn.style.display = 'inline-flex';
      if (staffAdminLockBadge) staffAdminLockBadge.classList.add('hidden');
      if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.add('hidden');
      if (staffMainContainer) staffMainContainer.classList.remove('hidden');
    }
  } else {
    if (portalAuthGate) {
      portalAuthGate.classList.remove('hidden');
      portalAuthGate.classList.add('flex');
    }
    if (openLoginBtn) openLoginBtn.classList.remove('hidden');
    if (userProfilePill) userProfilePill.classList.add('hidden');
    if (addStudentBtn) addStudentBtn.style.display = 'inline-flex';
    if (bulkStudentBtn) bulkStudentBtn.style.display = 'inline-flex';
    if (staffAdminLockBadge) staffAdminLockBadge.classList.add('hidden');
    if (staffTeacherRestrictedBanner) staffTeacherRestrictedBanner.classList.add('hidden');
    if (staffMainContainer) staffMainContainer.classList.remove('hidden');
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
  const bgClass = type === 'error' ? 'bg-rose-700 text-white' : (type === 'success' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white');
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
