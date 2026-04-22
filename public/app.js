/* AI English Tutor - frontend app
 * Uses browser Web Speech API for STT/TTS (no extra API keys needed)
 * Chats with the Express backend which proxies to Claude
 */

(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    level: 'adult',
    lessonId: null,
    aiEnabled: false,
    muted: false,
    messages: [], // {role, content}
    listening: false,
    speaking: false,
    voices: [],
    preferredVoice: null,
    speechRate: 0.95,
  };

  // ---------- Voice setup (Text-to-Speech) ----------
  // Pick the most natural-sounding US English voice available.
  const PREFERRED_VOICES = [
    'Google US English',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Guy Online (Natural) - English (United States)',
    'Samantha',
    'Alex',
    'Microsoft Zira - English (United States)',
    'Microsoft David - English (United States)',
  ];

  function loadVoices() {
    const all = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    state.voices = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
    const byName = (name) => state.voices.find((v) => v.name === name);
    for (const name of PREFERRED_VOICES) {
      const v = byName(name);
      if (v) { state.preferredVoice = v; return; }
    }
    const fuzzy = state.voices.find((v) => /natural|neural|premium/i.test(v.name) && /en-US|en_US/i.test(v.lang));
    state.preferredVoice = fuzzy || state.voices.find((v) => v.lang === 'en-US') || state.voices[0] || null;
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function stripNativeTags(text) {
    return text.replace(/\[\[NATIVE\]\][\s\S]*?\[\[\/NATIVE\]\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function speak(text, { rate } = {}) {
    if (!window.speechSynthesis || state.muted) return;
    window.speechSynthesis.cancel();
    const clean = stripNativeTags(text);
    if (!clean) return;

    // Split long text into sentences for smoother speech
    const chunks = clean.match(/[^.!?]+[.!?]*/g) || [clean];
    let idx = 0;
    setTeacherState('speaking');

    const speakNext = () => {
      if (idx >= chunks.length) {
        setTeacherState('idle');
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[idx].trim());
      u.lang = 'en-US';
      u.rate = rate || state.speechRate;
      u.pitch = 1.05;
      u.volume = 1;
      if (state.preferredVoice) u.voice = state.preferredVoice;
      u.onend = () => { idx++; speakNext(); };
      u.onerror = () => { idx++; speakNext(); };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  }

  // Native-language TTS (Chinese) for translations
  function speakNative(text) {
    if (!window.speechSynthesis || state.muted) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1;
    const zh = state.voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh')) ||
               window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
    if (zh) u.voice = zh;
    window.speechSynthesis.speak(u);
  }

  // ---------- Speech-to-Text ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  function initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    return r;
  }

  function startListening() {
    if (!SR) {
      showToast('你的浏览器不支持语音识别，请使用最新版 Chrome 或 Edge。可以直接打字哦！');
      return;
    }
    if (state.listening) { stopListening(); return; }

    try { window.speechSynthesis.cancel(); } catch {}

    recognition = initRecognition();
    let finalText = '';
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      $('text-input').value = (finalText + ' ' + interim).trim();
    };
    recognition.onerror = (e) => {
      console.warn('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        showToast('请允许使用麦克风权限 🎤');
      } else if (e.error === 'no-speech') {
        showToast('没有听到声音，再试一次');
      }
      stopListening();
    };
    recognition.onend = () => {
      stopListening();
      const text = $('text-input').value.trim();
      if (text) sendMessage(text);
    };

    try {
      recognition.start();
      state.listening = true;
      setTeacherState('listening');
      $('mic-btn').classList.add('listening');
      $('mic-label').textContent = 'Listening... tap to stop';
    } catch (err) {
      console.warn(err);
    }
  }

  function stopListening() {
    state.listening = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    $('mic-btn').classList.remove('listening');
    $('mic-label').textContent = 'Tap to speak';
    if (!state.speaking) setTeacherState('idle');
  }

  // ---------- Teacher state (UI feedback) ----------
  function setTeacherState(s) {
    const el = $('teacher-avatar');
    const status = $('teacher-status');
    if (!el) return;
    el.classList.remove('speaking', 'listening');
    if (s === 'speaking') {
      el.classList.add('speaking');
      status.textContent = 'Speaking...';
      state.speaking = true;
    } else if (s === 'listening') {
      el.classList.add('listening');
      status.textContent = 'Listening...';
      state.speaking = false;
    } else {
      status.textContent = 'Your turn!';
      state.speaking = false;
    }
  }

  // ---------- Messages / chat ----------
  function renderTeacherMessage(text, { speakIt = true } = {}) {
    const container = $('messages');
    const el = document.createElement('div');
    el.className = 'msg teacher';

    // Render [[NATIVE]]...[[/NATIVE]] as highlighted spans
    const html = escapeHtml(text).replace(
      /\[\[NATIVE\]\]([\s\S]*?)\[\[\/NATIVE\]\]/g,
      (_, inner) => `<span class="native">${inner.trim()}</span>`,
    );
    el.innerHTML = html;

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const replayBtn = document.createElement('button');
    replayBtn.className = 'msg-action';
    replayBtn.textContent = '🔊 Replay';
    replayBtn.onclick = () => speak(text);
    const slowBtn = document.createElement('button');
    slowBtn.className = 'msg-action';
    slowBtn.textContent = '🐢 Slower';
    slowBtn.onclick = () => speak(text, { rate: 0.7 });
    actions.appendChild(replayBtn);
    actions.appendChild(slowBtn);
    el.appendChild(actions);

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    if (speakIt) speak(text);
  }

  function renderUserMessage(text) {
    const container = $('messages');
    const el = document.createElement('div');
    el.className = 'msg user';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function renderSystemMessage(text) {
    const container = $('messages');
    const el = document.createElement('div');
    el.className = 'msg system';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = $('messages');
    const el = document.createElement('div');
    el.className = 'msg teacher typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    el.id = 'typing-indicator';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }
  function hideTyping() {
    const el = $('typing-indicator');
    if (el) el.remove();
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Offline fallback (if AI API fails) ----------
  // Gives students something useful even with no backend access.
  function offlineReply(userText, lesson, level) {
    const t = (userText || '').toLowerCase();
    const isChinese = /[一-龥]/.test(userText);
    const phrase = lesson.phrases[Math.floor(Math.random() * lesson.phrases.length)];
    const word = lesson.vocab[Math.floor(Math.random() * lesson.vocab.length)];

    if (isChinese || /translate|don'?t understand|听不懂|不会/.test(t)) {
      return `No worries! [[NATIVE]]我们今天练习 ${lesson.topic}，试着跟我读这句：${phrase}[[/NATIVE]] Repeat after me: "${phrase}"`;
    }
    if (/hello|hi|hey/.test(t)) {
      return level === 'kid'
        ? `Hi there! I'm so happy to see you! Can you say "${word}"?`
        : `Hey! Great to meet you. Let's warm up - can you use "${word}" in a sentence?`;
    }
    if (t.includes(word.toLowerCase())) {
      return `Nice, you used "${word}"! Now try this one: "${phrase}" - your turn!`;
    }
    return `Cool! Let's try something new. Repeat after me: "${phrase}" Then tell me - how would YOU use the word "${word}"?`;
  }

  // ---------- Core: send message ----------
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    $('text-input').value = '';

    renderUserMessage(trimmed);
    state.messages.push({ role: 'user', content: trimmed });

    const lesson = currentLesson();
    showTyping();

    let reply = '';
    if (state.aiEnabled) {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: state.messages.slice(-12), // keep recent context
            lesson: {
              title: lesson.title,
              topic: lesson.topic,
              vocab: lesson.vocab,
              phrases: lesson.phrases,
            },
            level: state.level,
            nativeLanguage: 'Chinese',
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        reply = data.reply || '';
      } catch (err) {
        console.warn('API call failed, falling back to offline mode:', err);
        showToast('API 暂时不可用，已切换为离线练习模式');
        state.aiEnabled = false;
        reply = offlineReply(trimmed, lesson, state.level);
      }
    } else {
      reply = offlineReply(trimmed, lesson, state.level);
    }

    hideTyping();
    if (!reply) reply = "Hmm, can you say that again?";
    state.messages.push({ role: 'assistant', content: reply });
    renderTeacherMessage(reply);
  }

  // ---------- Lesson / setup ----------
  function currentLesson() {
    const list = window.LESSONS[state.level];
    return list.find((l) => l.id === state.lessonId) || list[0];
  }

  function renderLessonGrid() {
    const grid = $('lesson-grid');
    grid.innerHTML = '';
    const list = window.LESSONS[state.level];
    list.forEach((l, i) => {
      const btn = document.createElement('button');
      btn.className = 'lesson-card' + (l.id === state.lessonId ? ' active' : '');
      btn.dataset.id = l.id;
      btn.innerHTML = `<div>${escapeHtml(l.title)}</div><div style="color:var(--text-mute);font-size:11px;margin-top:4px;">${escapeHtml(l.topic)}</div>`;
      btn.onclick = () => {
        state.lessonId = l.id;
        renderLessonGrid();
      };
      grid.appendChild(btn);
      if (i === 0 && !state.lessonId) state.lessonId = l.id;
    });
  }

  function renderLessonSidebar() {
    const lesson = currentLesson();
    $('current-lesson-title').textContent = lesson.title;
    $('current-level-badge').textContent = state.level === 'kid' ? '🧒 Kid' : '🎓 Adult';
    const chips = $('vocab-chips');
    chips.innerHTML = '';
    lesson.vocab.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = w;
      b.onclick = () => speak(w, { rate: 0.85 });
      chips.appendChild(b);
    });
    const plist = $('phrase-list');
    plist.innerHTML = '';
    lesson.phrases.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = `"${p}"`;
      li.onclick = () => speak(p);
      plist.appendChild(li);
    });
  }

  async function checkHealth() {
    try {
      const r = await fetch('/api/health');
      const data = await r.json();
      state.aiEnabled = !!data.aiEnabled;
      $('status-line').textContent = data.aiEnabled
        ? '✓ AI 外教已就绪'
        : '⚠ 后端未配置 ANTHROPIC_API_KEY，将使用离线练习模式';
    } catch {
      state.aiEnabled = false;
      $('status-line').textContent = '⚠ 未检测到后端服务，将使用离线练习模式';
    }
  }

  function startClass() {
    const lesson = currentLesson();
    $('setup-screen').classList.add('hidden');
    $('class-screen').classList.remove('hidden');
    $('messages').innerHTML = '';
    state.messages = [];
    renderLessonSidebar();
    setTeacherState('idle');

    // First teacher greeting
    const greeting = state.aiEnabled
      ? null
      : (state.level === 'kid'
        ? `Hi friend! I'm Emma! Today we'll learn about ${lesson.topic}. Ready? Say "Hello Emma!"`
        : `Hey there! I'm Emma, your English tutor. Today's topic: ${lesson.topic}. Let's warm up - how are you doing today?`);

    if (greeting) {
      state.messages.push({ role: 'assistant', content: greeting });
      renderTeacherMessage(greeting);
    } else {
      // Ask the AI to kick things off with a topic-appropriate opener
      sendMessage('Hi Emma! Let\'s start today\'s lesson.');
    }
  }

  function goBackToSetup() {
    try { window.speechSynthesis.cancel(); } catch {}
    stopListening();
    $('setup-screen').classList.remove('hidden');
    $('class-screen').classList.add('hidden');
  }

  function showToast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ---------- Wire up events ----------
  function bindEvents() {
    // Level picker
    document.querySelectorAll('.level-btn').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.level-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.level = btn.dataset.level;
        state.lessonId = null;
        renderLessonGrid();
      };
    });

    $('start-btn').onclick = startClass;
    $('back-btn').onclick = goBackToSetup;

    $('mic-btn').onclick = startListening;
    $('send-btn').onclick = () => {
      const t = $('text-input').value.trim();
      if (t) sendMessage(t);
    };
    $('text-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const t = $('text-input').value.trim();
        if (t) sendMessage(t);
      }
    });

    $('mute-btn').onclick = () => {
      state.muted = !state.muted;
      $('mute-btn').textContent = state.muted ? '🔇' : '🔊';
      if (state.muted) {
        try { window.speechSynthesis.cancel(); } catch {}
        setTeacherState('idle');
      }
    };

    $('translate-btn').onclick = () => {
      sendMessage('Can you translate your last sentence into Chinese and explain what it means?');
    };
    $('repeat-btn').onclick = () => {
      const last = [...state.messages].reverse().find((m) => m.role === 'assistant');
      if (last) speak(last.content);
    };
    $('slower-btn').onclick = () => {
      const last = [...state.messages].reverse().find((m) => m.role === 'assistant');
      if (last) speak(last.content, { rate: 0.65 });
    };
  }

  // ---------- Boot ----------
  bindEvents();
  renderLessonGrid();
  checkHealth();
})();
