// ===== State =====
let currentQuestion = null;
let currentDate = new Date();
let reflections = { answers: [] }; // { answers: [{ questionId, date, text }] }
let diary = { entries: [] }; // { entries: [{ date, text }] }

// ===== URL Config =====
function loadConfigFromUrl() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#config=')) return false;
  
  try {
    const encoded = hash.substring(8); // Remove '#config='
    const json = atob(encoded);
    const config = JSON.parse(json);
    
    if (config.repo) localStorage.setItem('github_repo', config.repo);
    if (config.token) localStorage.setItem('github_token', config.token);
    if (config.branch) localStorage.setItem('github_branch', config.branch);
    
    // Clear hash from URL (keeps it clean, config is now in localStorage)
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch (e) {
    console.error('Failed to parse config from URL:', e);
    return false;
  }
}

function generateShareUrl() {
  const config = {
    repo: localStorage.getItem('github_repo') || '',
    token: localStorage.getItem('github_token') || '',
    branch: localStorage.getItem('github_branch') || 'main'
  };
  
  if (!config.repo || !config.token) {
    showToast('先にGitHub設定を保存してください', true);
    return null;
  }
  
  const encoded = btoa(JSON.stringify(config));
  const url = `${window.location.origin}${window.location.pathname}#config=${encoded}`;
  return url;
}

function handleGenerateShareUrl() {
  const url = generateShareUrl();
  if (!url) return;
  
  // Copy to clipboard
  navigator.clipboard.writeText(url).then(() => {
    showToast('共有URLをコピーしました！このURLをブックマークしてください');
  }).catch(() => {
    // Fallback: show in prompt
    prompt('このURLをブックマークしてください:', url);
  });
}

// ===== GitHub API =====
const github = {
  getConfig() {
    return {
      repo: localStorage.getItem('github_repo') || '',
      token: localStorage.getItem('github_token') || '',
      branch: localStorage.getItem('github_branch') || 'main'
    };
  },

  async getFile(path) {
    const { repo, token, branch } = this.getConfig();
    if (!repo || !token) return null;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
        { headers: { Authorization: `token ${token}` } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Proper UTF-8 decoding for Japanese text
      const decoded = decodeURIComponent(escape(atob(data.content)));
      return {
        content: JSON.parse(decoded),
        sha: data.sha
      };
    } catch (e) {
      console.error('GitHub getFile error:', e);
      return null;
    }
  },

  async saveFile(path, content) {
    const { repo, token, branch } = this.getConfig();
    if (!repo || !token) {
      showToast('GitHub設定が必要です', true);
      return false;
    }

    try {
      // Always get current sha first (required for updating existing files)
      let sha = null;
      const existing = await this.getFile(path);
      if (existing) {
        sha = existing.sha;
      }

      const body = {
        message: `Update ${path}`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        branch
      };
      if (sha) body.sha = sha;

      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return true;
    } catch (e) {
      console.error('GitHub saveFile error:', e);
      showToast(`保存エラー: ${e.message}`, true);
      return false;
    }
  },

  async testConnection() {
    const { repo, token } = this.getConfig();
    if (!repo || !token) return { ok: false, message: '設定が必要です' };

    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}`,
        { headers: { Authorization: `token ${token}` } }
      );
      if (res.ok) {
        return { ok: true, message: '接続成功！' };
      } else {
        const err = await res.json();
        return { ok: false, message: err.message };
      }
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
};

// ===== Data Management =====
async function loadData() {
  // Load from GitHub
  const reflectionsData = await github.getFile('data/reflections.json');
  if (reflectionsData) {
    reflections = reflectionsData.content;
  }

  const diaryData = await github.getFile('data/diary.json');
  if (diaryData) {
    diary = diaryData.content;
  }

  // Also save to localStorage as backup
  localStorage.setItem('reflections', JSON.stringify(reflections));
  localStorage.setItem('diary', JSON.stringify(diary));
}

async function saveReflections() {
  localStorage.setItem('reflections', JSON.stringify(reflections));
  const success = await github.saveFile('data/reflections.json', reflections);
  return success;
}

async function saveDiaryData() {
  localStorage.setItem('diary', JSON.stringify(diary));
  const success = await github.saveFile('data/diary.json', diary);
  return success;
}

// ===== Utility =====
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => toast.className = 'toast', 3000);
}

function formatDate(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}

function formatFullDate(date) {
  return date.toISOString().split('T')[0];
}

function getMonthDay(date) {
  // Handle Feb 29 → Feb 28
  let m = date.getMonth() + 1;
  let d = date.getDate();
  if (m === 2 && d === 29) d = 28;
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ===== Reflection =====
function showRandomQuestion() {
  const idx = Math.floor(Math.random() * QUESTIONS.length);
  currentQuestion = QUESTIONS[idx];
  
  document.getElementById('questionCategory').textContent = currentQuestion.category;
  document.getElementById('questionText').textContent = currentQuestion.text;
  document.getElementById('reflectionAnswer').value = '';
  
  showPastAnswers();
}

function showPastAnswers() {
  const list = document.getElementById('pastAnswersList');
  const answers = reflections.answers
    .filter(a => a.questionId === currentQuestion.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (answers.length === 0) {
    list.innerHTML = '<p class="no-data">この質問への回答はまだありません</p>';
    return;
  }

  list.innerHTML = answers.map(a => `
    <div class="past-answer-item">
      <div class="date">${a.date}</div>
      <div class="text">${escapeHtml(a.text)}</div>
    </div>
  `).join('');
}

async function handleSaveReflection() {
  const text = document.getElementById('reflectionAnswer').value.trim();
  if (!text) {
    showToast('回答を入力してください', true);
    return;
  }

  reflections.answers.push({
    questionId: currentQuestion.id,
    date: formatFullDate(new Date()),
    text
  });

  const success = await saveReflections();
  if (success) {
    showToast('保存しました！');
    document.getElementById('reflectionAnswer').value = '';
    showPastAnswers();
  }
}

// ===== Diary =====
function updateDiaryView() {
  document.getElementById('currentDate').textContent = formatDate(currentDate);
  document.getElementById('currentYearLabel').textContent = `${currentDate.getFullYear()}年`;

  // Load current entry
  const dateKey = formatFullDate(currentDate);
  const entry = diary.entries.find(e => e.date === dateKey);
  document.getElementById('diaryText').value = entry ? entry.text : '';

  // Show past years
  showPastEntries();
}

function showPastEntries() {
  const list = document.getElementById('pastEntriesList');
  const currentYear = currentDate.getFullYear();
  const monthDay = getMonthDay(currentDate);

  // Find entries from other years with same month-day
  const pastEntries = diary.entries
    .filter(e => {
      const entryDate = new Date(e.date);
      const entryMonthDay = getMonthDay(entryDate);
      const entryYear = entryDate.getFullYear();
      return entryMonthDay === monthDay && entryYear !== currentYear;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (pastEntries.length === 0) {
    list.innerHTML = '<p class="no-data">過去の同じ日の記録はありません</p>';
    return;
  }

  list.innerHTML = pastEntries.map(e => {
    const year = new Date(e.date).getFullYear();
    return `
      <div class="past-entry-item">
        <div class="year">${year}年</div>
        <div class="text">${escapeHtml(e.text)}</div>
      </div>
    `;
  }).join('');
}

async function handleSaveDiary() {
  const text = document.getElementById('diaryText').value.trim();
  const dateKey = formatFullDate(currentDate);

  // Update or add entry
  const idx = diary.entries.findIndex(e => e.date === dateKey);
  if (idx >= 0) {
    if (text) {
      diary.entries[idx].text = text;
    } else {
      diary.entries.splice(idx, 1); // Remove if empty
    }
  } else if (text) {
    diary.entries.push({ date: dateKey, text });
  }

  const success = await saveDiaryData();
  if (success) {
    showToast('保存しました！');
  }
}

function changeDate(days) {
  currentDate.setDate(currentDate.getDate() + days);
  updateDiaryView();
}

function goToToday() {
  currentDate = new Date();
  updateDiaryView();
}

// ===== Settings =====
function loadSettings() {
  document.getElementById('repoName').value = localStorage.getItem('github_repo') || '';
  document.getElementById('githubToken').value = localStorage.getItem('github_token') || '';
  document.getElementById('branchName').value = localStorage.getItem('github_branch') || 'main';
}

function handleSaveSettings() {
  localStorage.setItem('github_repo', document.getElementById('repoName').value.trim());
  localStorage.setItem('github_token', document.getElementById('githubToken').value.trim());
  localStorage.setItem('github_branch', document.getElementById('branchName').value.trim() || 'main');
  showToast('設定を保存しました');
}

async function handleTestConnection() {
  const status = document.getElementById('connectionStatus');
  status.textContent = '接続中...';
  status.className = '';

  const result = await github.testConnection();
  status.textContent = result.message;
  status.className = result.ok ? 'success' : 'error';
}

async function handleSyncFromGithub() {
  showToast('同期中...');
  await loadData();
  showToast('同期完了！');
  showRandomQuestion();
  updateDiaryView();
}

function handleExportData() {
  const data = { reflections, diary };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reflection-diary-${formatFullDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('エクスポートしました');
}

// ===== Utility =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Tab Navigation =====
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

// ===== Init =====
async function init() {
  setupTabs();
  
  // Load config from URL first (if present)
  const loadedFromUrl = loadConfigFromUrl();
  
  loadSettings();

  // Load from localStorage first (faster)
  const localReflections = localStorage.getItem('reflections');
  const localDiary = localStorage.getItem('diary');
  if (localReflections) reflections = JSON.parse(localReflections);
  if (localDiary) diary = JSON.parse(localDiary);

  // Then sync from GitHub
  if (github.getConfig().token) {
    loadData();
    if (loadedFromUrl) {
      showToast('設定を読み込みました！');
    }
  }

  // Reflection
  showRandomQuestion();
  document.getElementById('nextQuestion').addEventListener('click', showRandomQuestion);
  document.getElementById('saveReflection').addEventListener('click', handleSaveReflection);

  // Diary
  updateDiaryView();
  document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
  document.getElementById('nextDay').addEventListener('click', () => changeDate(1));
  document.getElementById('todayBtn').addEventListener('click', goToToday);
  document.getElementById('saveDiary').addEventListener('click', handleSaveDiary);

  // Settings
  document.getElementById('saveSettings').addEventListener('click', handleSaveSettings);
  document.getElementById('testConnection').addEventListener('click', handleTestConnection);
  document.getElementById('syncFromGithub').addEventListener('click', handleSyncFromGithub);
  document.getElementById('exportData').addEventListener('click', handleExportData);
  document.getElementById('generateShareUrl').addEventListener('click', handleGenerateShareUrl);
}

document.addEventListener('DOMContentLoaded', init);
