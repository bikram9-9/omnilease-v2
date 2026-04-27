/* Omnilease embeddable chat widget (Phase 1b, vanilla JS).
 *
 * Usage:
 *   <script src="https://your-app.vercel.app/widget.js" data-widget-id="abc123" defer></script>
 *
 * Responsibilities:
 *   - Render a floating bubble + panel bottom-right
 *   - Init a session via POST /api/widget/session
 *   - Send user messages via POST /api/widget/chat, stream SSE tokens back
 *   - Preserve sessionId in localStorage for conversation continuity
 */
(() => {
  const script = document.currentScript;
  if (!script) return;
  const widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) return;

  // Derive the app origin from the script's own src.
  const origin = new URL(script.src).origin;

  const SESSION_KEY = `omnilease:session:${widgetId}`;
  const TRANSCRIPT_KEY = `omnilease:transcript:${widgetId}`;

  let sessionId = localStorage.getItem(SESSION_KEY);
  let property = {
    name: 'Chat',
    brandColor: '#111827',
    welcomeMessage: 'Hi there!',
    initialAssistantMessage: "I'm an AI assistant. How can I help?",
  };
  let disclosure = {
    aiDisclosure: "I'm an AI assistant.",
    initialAssistantMessage: "I'm an AI assistant. How can I help?",
    privacyNoticeUrl: null,
    termsUrl: null,
    privacyDisclosureText: null,
    contactFallbackLabel: null,
    contactFallbackUrl: null,
    contactFallbackText: null,
  };
  let transcript = loadTranscript();
  let messagesEl = null;
  let disclosureEl = null;
  let inputEl = null;
  let statusEl = null;
  let sendButtonEl = null;
  let panelOpen = false;
  let sessionReady = false;

  async function initSession() {
    setReady(false, 'Connecting...');
    try {
      const res = await fetch(origin + '/api/widget/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetId, sessionId, pageUrl: location.href, referrer: document.referrer }),
      });
      if (!res.ok) {
        setReady(false, 'Chat is unavailable. Please try again in a moment.');
        return;
      }
      const data = await res.json();
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
      property = data.property ?? property;
      disclosure = data.disclosure ?? disclosure;
      applyBranding();
      renderDisclosure();
      sessionReady = true;
      setReady(true, 'Connected');
      ensureInitialAssistantMessage();
    } catch {
      setReady(false, 'Chat is offline. Check your connection and retry.');
    }
  }

  function loadTranscript() {
    try {
      const raw = localStorage.getItem(TRANSCRIPT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => ({
          role: message.role,
          text: typeof message.text === 'string' ? message.text : '',
        }))
        .slice(-50);
    } catch {
      return [];
    }
  }

  function saveTranscript() {
    localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript.slice(-50)));
  }

  function setReady(ready, text) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = ready ? '#4b5563' : '#b91c1c';
    }
    if (inputEl) inputEl.disabled = !ready;
    if (sendButtonEl) sendButtonEl.disabled = !ready;
  }

  function applyBranding() {
    const bubble = document.getElementById('omnilease-bubble');
    if (bubble) bubble.style.background = property.brandColor;
    const header = document.getElementById('omnilease-header');
    if (header) {
      header.style.background = property.brandColor;
      header.textContent = property.name;
    }
  }

  function render() {
    const root = document.createElement('div');
    root.id = 'omnilease-root';
    root.innerHTML = `
      <button id="omnilease-bubble" aria-label="Open chat" style="
        position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;
        background:#111827;color:white;border:none;cursor:pointer;z-index:2147483647;
        box-shadow:0 4px 12px rgba(0,0,0,0.2);font-size:24px;">
        💬
      </button>
      <div id="omnilease-panel" style="
        position:fixed;bottom:90px;right:20px;width:360px;height:520px;background:white;
        border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.3);z-index:2147483647;
        display:none;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;">
        <div id="omnilease-header" style="
          padding:16px;background:#111827;color:white;border-radius:12px 12px 0 0;
          font-weight:600;">Chat</div>
        <div id="omnilease-status" style="
          border-bottom:1px solid #e5e7eb;padding:8px 16px;font-size:12px;color:#4b5563;">
          Connecting...
        </div>
        <div id="omnilease-disclosure" style="
          border-bottom:1px solid #e5e7eb;padding:10px 16px;font-size:12px;color:#374151;
          line-height:1.45;background:#f9fafb;display:none;"></div>
        <div id="omnilease-messages" style="
          flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;
          font-size:14px;color:#111827;"></div>
        <form id="omnilease-form" style="
          border-top:1px solid #e5e7eb;padding:12px;display:flex;gap:8px;">
          <input id="omnilease-input" type="text" placeholder="Type a message..." style="
            flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;
            font-size:14px;outline:none;"/>
          <button id="omnilease-send" type="submit" style="
            padding:8px 16px;background:#111827;color:white;border:none;border-radius:8px;
            cursor:pointer;font-size:14px;">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    messagesEl = document.getElementById('omnilease-messages');
    disclosureEl = document.getElementById('omnilease-disclosure');
    inputEl = document.getElementById('omnilease-input');
    statusEl = document.getElementById('omnilease-status');
    sendButtonEl = document.getElementById('omnilease-send');
    const bubble = document.getElementById('omnilease-bubble');
    const panel = document.getElementById('omnilease-panel');
    const form = document.getElementById('omnilease-form');
    setReady(false, 'Connecting...');

    bubble.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen && messagesEl.childElementCount === 0 && transcript.length > 0) {
        transcript.forEach((message, index) => {
          renderBubble(message.role, message.text, index);
        });
      }
      ensureInitialAssistantMessage();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text || !sessionId) return;
      inputEl.value = '';
      addBubble('user', text);
      const replyEl = addBubble('assistant', '');
      await streamReply(text, replyEl);
    });
  }

  function addBubble(role, text) {
    const index = transcript.push({ role, text }) - 1;
    saveTranscript();
    return renderBubble(role, text, index);
  }

  function ensureInitialAssistantMessage() {
    if (!panelOpen || !sessionReady || transcript.length > 0 || messagesEl.childElementCount > 0) return;
    addBubble('assistant', disclosure.initialAssistantMessage || property.initialAssistantMessage || property.welcomeMessage);
  }

  function renderDisclosure() {
    if (!disclosureEl) return;
    disclosureEl.textContent = '';

    const copy = document.createElement('div');
    copy.textContent = disclosure.aiDisclosure || property.initialAssistantMessage || property.welcomeMessage;
    disclosureEl.appendChild(copy);

    if (disclosure.privacyDisclosureText) {
      const privacyCopy = document.createElement('div');
      privacyCopy.textContent = disclosure.privacyDisclosureText;
      privacyCopy.style.marginTop = '6px';
      disclosureEl.appendChild(privacyCopy);
    }

    const links = [];
    if (disclosure.privacyNoticeUrl) {
      links.push({ label: 'Privacy', url: disclosure.privacyNoticeUrl });
    }
    if (disclosure.termsUrl) {
      links.push({ label: 'Terms', url: disclosure.termsUrl });
    }
    if (disclosure.contactFallbackUrl) {
      links.push({
        label: disclosure.contactFallbackLabel || 'Contact property',
        url: disclosure.contactFallbackUrl,
      });
    }

    if (links.length > 0) {
      const row = document.createElement('div');
      row.style.marginTop = '6px';
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.gap = '8px';
      links.forEach((item) => {
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.label;
        link.style.color = property.brandColor || '#111827';
        link.style.fontWeight = '600';
        row.appendChild(link);
      });
      disclosureEl.appendChild(row);
    }

    if (disclosure.contactFallbackText) {
      const fallback = document.createElement('div');
      fallback.textContent = disclosure.contactFallbackText;
      fallback.style.marginTop = '6px';
      disclosureEl.appendChild(fallback);
    }

    disclosureEl.style.display = 'block';
  }

  function renderBubble(role, text, transcriptIndex) {
    const el = document.createElement('div');
    el.textContent = text;
    el.dataset.transcriptIndex = String(transcriptIndex);
    el.style.alignSelf = role === 'user' ? 'flex-end' : 'flex-start';
    el.style.maxWidth = '80%';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '12px';
    el.style.background = role === 'user' ? '#111827' : '#f3f4f6';
    el.style.color = role === 'user' ? 'white' : '#111827';
    el.style.wordWrap = 'break-word';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function updateBubble(el, text) {
    el.textContent = text;
    const transcriptIndex = Number(el.dataset.transcriptIndex);
    if (Number.isInteger(transcriptIndex) && transcript[transcriptIndex]) {
      transcript[transcriptIndex].text = text;
      saveTranscript();
    }
  }

  async function streamReply(text, replyEl) {
    let res;
    try {
      res = await fetch(origin + '/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId,
          text,
          pageUrl: location.href,
          referrer: document.referrer,
          userAgent: navigator.userAgent,
        }),
      });
    } catch {
      updateBubble(replyEl, 'Sorry, the chat is offline right now. Please retry in a moment.');
      setReady(false, 'Message failed. Check your connection and retry.');
      return;
    }
    if (!res.ok || !res.body) {
      updateBubble(replyEl, 'Sorry, the chat is unavailable right now. Please retry in a moment.');
      setReady(false, `Message failed (${res.status}). Please retry.`);
      return;
    }
    setReady(true, 'Connected');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // AI SDK toUIMessageStreamResponse() uses a line-delimited protocol with
    // prefixed chunks. For Phase 1 we concatenate every text-delta frame naively.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        try {
          const frame = JSON.parse(line.replace(/^data: ?/, ''));
          if (frame.type === 'text-delta' && typeof frame.delta === 'string') {
            updateBubble(replyEl, replyEl.textContent + frame.delta);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } catch {
          // Ignore non-JSON frames
        }
      }
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      render();
      initSession();
    });
  } else {
    render();
    initSession();
  }
})();
