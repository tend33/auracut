/* Presentation only: keeps the existing editor nodes, handlers and media alive. */
(() => {
  const messages = window.AuracutMessages;
  const records = new Map();
  const attributes = new Map();
  const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, values]) => {
    const slots = [];
    const regex = '^' + key.split(/(\{\d+\})/).map(part => {
      if (/^\{\d+\}$/.test(part)) { slots.push(part); return '([\\s\\S]*?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('') + '$';
    return {key, regex: new RegExp(regex), slots, values};
  });
  const privateContent = '#project-title,#project-song,#story-markers,#transcript-words,#caption-editor,#plan-report,#director-report,.shot-name,.shot-reason,.shot-story,.project-row strong,.footage-item strong,.footage-result>strong,.footage-result p';
  let language = 'en', layout = 'clean', panel = 'edit', account = null, chosen = false;
  const get = id => document.getElementById(id);
  const preferenceKey = () => 'auracut.ui.' + (account || 'pending');
  function storageRead() {
    try { return JSON.parse(localStorage.getItem(preferenceKey()) || '{}'); } catch { return {}; }
  }
  function storageWrite() {
    if (!account) return;
    try { localStorage.setItem(preferenceKey(), JSON.stringify({language, layout})); } catch { /* Editing works with storage blocked. */ }
  }
  function text(source, locale = language) {
    if (locale === 'en') return source;
    const index = locale === 'zh-hant' ? 1 : 0;
    const splitAt = source.indexOf(' Musical-change preference enabled');
    if (splitAt >= 0) return text(source.slice(0, splitAt), locale) + text(source.slice(splitAt), locale);
    const trimmed = source.trim();
    let result = messages[trimmed]?.[index];
    if (result === undefined) {
      for (const entry of patterns) {
        const match = trimmed.match(entry.regex);
        if (!match) continue;
        const parameters = Object.fromEntries(entry.slots.map((slot, i) => [slot, match[i + 1]]));
        if (entry.key === '{0} · {1} shots · {2}') parameters['{2}'] = text(parameters['{2}'], locale);
        result = entry.values[index].replace(/\{\d+\}/g, slot => parameters[slot]);
        break;
      }
    }
    // Service errors and generated content remain verbatim unless a known UI message matches.
    if (result === undefined) return source;
    return source.slice(0, source.length - source.trimStart().length) + result + source.slice(source.trimEnd().length);
  }
  function isPrivate(element) {
    return !element || element.closest(privateContent + ',script,style,[translate="no"]');
  }
  function collect(root) {
    if (root.nodeType === 3) { collectText(root); return; }
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) collectText(node);
    for (const element of [root, ...root.querySelectorAll('[title],[aria-label],[placeholder]')]) {
      if (isPrivate(element)) continue;
      for (const key of ['title','aria-label','placeholder']) {
        if (!element.hasAttribute(key)) continue;
        let entry = attributes.get(element);
        if (!entry) { entry = {}; attributes.set(element, entry); }
        const value = element.getAttribute(key);
        if (!entry[key] || value !== entry[key].rendered) entry[key] = {source:value, rendered:value};
      }
    }
  }
  function collectText(node) {
    if (node.parentElement?.id === 'project-title') {
      if (node.parentElement.dataset.userContent === 'true') { records.delete(node); return; }
      if (node.data === 'Your timeline starts here') records.set(node, {source:node.data, rendered:node.data});
      else if (node.data !== records.get(node)?.rendered) records.delete(node);
      return;
    }
    if (isPrivate(node.parentElement) || !node.data.trim()) return;
    const entry = records.get(node);
    if (!entry || node.data !== entry.rendered) records.set(node, {source:node.data, rendered:node.data});
  }
  const watchOptions = {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','open']};
  const observer = new MutationObserver(changes => {
    observer.disconnect();
    for (const change of changes) {
      if (change.type === 'characterData') collectText(change.target);
      else if (change.type === 'childList') change.addedNodes.forEach(collect);
      else if (change.attributeName !== 'open') collect(change.target);
      else if (change.target.id === 'studio-panel' && change.target.open && layout === 'clean') setPanel('speech');
    }
    renderMessages();
    observer.observe(document.body, watchOptions);
  });
  function renderMessages() {
    for (const [node, entry] of records) {
      if (!node.isConnected) { records.delete(node); continue; }
      entry.rendered = text(entry.source); if (node.data !== entry.rendered) node.data = entry.rendered;
    }
    for (const [element, entry] of attributes) {
      if (!element.isConnected) { attributes.delete(element); continue; }
      for (const [key, value] of Object.entries(entry)) {
        value.rendered = text(value.source); if (element.getAttribute(key) !== value.rendered) element.setAttribute(key, value.rendered);
      }
    }
  }
  function setPanel(value) {
    panel = ['edit','media','speech'].includes(value) ? value : 'edit';
    document.body.dataset.panel = panel;
    for (const button of document.querySelectorAll('.editor-tabs button')) button.setAttribute('aria-pressed', String(button.dataset.panel === panel));
    if (layout === 'clean') {
      if (panel === 'media') get('media-panel').open = true;
      if (panel === 'speech') get('studio-panel').open = true;
    }
  }
  function applyPreferences() {
    observer.disconnect();
    // Capture app updates queued immediately before the language/layout change.
    collect(document.body);
    document.documentElement.lang = {en:'en','zh-hans':'zh-Hans','zh-hant':'zh-Hant'}[language];
    document.body.dataset.layout = layout;
    if (layout === 'classic') document.querySelector('.music-options').open = true;
    get('ui-language').value = language; get('ui-layout').value = layout;
    setPanel(panel); renderMessages(); storageWrite();
    observer.observe(document.body, watchOptions);
  }
  get('ui-language').addEventListener('change', event => { language = event.target.value; chosen = true; applyPreferences(); });
  get('ui-layout').addEventListener('change', event => { layout = event.target.value; chosen = true; applyPreferences(); });
  for (const button of document.querySelectorAll('.editor-tabs button')) button.addEventListener('click', () => {
    observer.disconnect(); setPanel(button.dataset.panel); observer.observe(document.body, watchOptions);
  });
  window.AuracutUI = Object.freeze({text, setAccount(id) {
    account = id;
    if (!chosen) {
      const saved = storageRead();
      language = ['en','zh-hans','zh-hant'].includes(saved.language) ? saved.language : 'en';
      layout = ['clean','classic'].includes(saved.layout) ? saved.layout : 'clean';
    }
    applyPreferences();
  }});
  collect(document.body); applyPreferences();
})();
