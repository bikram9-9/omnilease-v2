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

  let sessionId = localStorage.getItem(SESSION_KEY);
  let property = { name: 'Chat', brandColor: '#111827', welcomeMessage: 'Hi there!' };
  let messagesEl = null;
  let inputEl = null;
  let panelOpen = false;

  async function initSession() {
    const res = await fetch(origin + '/api/widget/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    property = data.property ?? property;
    applyBranding();
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
        <div id="omnilease-messages" style="
          flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;
          font-size:14px;color:#111827;"></div>
        <form id="omnilease-form" style="
          border-top:1px solid #e5e7eb;padding:12px;display:flex;gap:8px;">
          <input id="omnilease-input" type="text" placeholder="Type a message..." style="
            flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;
            font-size:14px;outline:none;"/>
          <button type="submit" style="
            padding:8px 16px;background:#111827;color:white;border:none;border-radius:8px;
            cursor:pointer;font-size:14px;">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    messagesEl = document.getElementById('omnilease-messages');
    inputEl = document.getElementById('omnilease-input');
    const bubble = document.getElementById('omnilease-bubble');
    const panel = document.getElementById('omnilease-panel');
    const form = document.getElementById('omnilease-form');

    bubble.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen && messagesEl.childElementCount === 0) {
        addBubble('assistant', property.welcomeMessage);
      }
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
    const el = document.createElement('div');
    el.textContent = text;
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

  async function streamReply(text, replyEl) {
    let res;
    try {
      res = await fetch(origin + '/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetId, sessionId, text }),
      });
    } catch (err) {
      replyEl.textContent = 'Sorry, the chat is offline right now.';
      return;
    }
    if (!res.ok || !res.body) {
      replyEl.textContent = 'Sorry, the chat is offline right now.';
      return;
    }

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
            replyEl.textContent += frame.delta;
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
