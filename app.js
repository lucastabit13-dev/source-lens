
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const preview = document.getElementById('preview');
    const description = document.getElementById('description');
    const searchButton = document.getElementById('searchButton');
    const results = document.getElementById('results');
    const historyList = document.getElementById('historyList');
    const siteMenu = document.getElementById('siteMenu');
    const characterCount = document.getElementById('characterCount');
    const storageKey = 'sourcelens-workspace-v1';
    let imageUrl = null;
    let activeView = 'recent';
    let currentSearchId = null;
    let toastTimer;
    let searches = readSearches();

    const platforms = {
      aliexpress: { name: 'AliExpress', short: 'A', color: '#f6efea', text: '#a95639', url: q => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`, note: 'Browse current listings' },
      dhgate: { name: 'DHgate', short: 'D', color: '#f6eeee', text: '#a44f49', url: q => `https://www.dhgate.com/wholesale/search.do?searchkey=${encodeURIComponent(q)}`, note: 'Browse current listings' },
      alibaba: { name: 'Alibaba', short: '阿', color: '#f5f0e8', text: '#936c3b', url: q => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`, note: 'Browse supplier listings' }
    };

    function readSearches() {
      try { return JSON.parse(localStorage.getItem('sourcelens-workspace-v1') || '[]').filter(item => item && item.id && item.query); }
      catch { return []; }
    }
    function persistSearches() {
      try { localStorage.setItem(storageKey, JSON.stringify(searches)); }
      catch { showToast('Browser storage is unavailable; this session will not be saved.'); }
    }
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
    }
    function selectedPlatforms() {
      return [...document.querySelectorAll('.switch:checked')].map(input => input.value);
    }
    function selectedPreferences() {
      return [...document.querySelectorAll('.chip.active')].map(chip => chip.dataset.term);
    }
    function updatePhrasePreview() {
      const terms = [description.value.trim(), ...selectedPreferences()].filter(Boolean);
      document.getElementById('phrasePreview').textContent = terms.length ? terms.join(' · ') : 'Add a description to build your search phrase.';
      const count = selectedPlatforms().length;
      document.getElementById('selectedCount').textContent = count;
      characterCount.textContent = `${description.value.length} / 120`;
      const selectedSummary = document.querySelector('.selected-summary');
      if (selectedSummary) selectedSummary.setAttribute('aria-label', `${count} marketplaces selected`);
    }
    function renderHistory() {
      const savedCount = searches.filter(item => item.saved).length;
      document.getElementById('savedCount').textContent = savedCount;
      document.getElementById('historySavedCount').textContent = savedCount;
      document.getElementById('activityCount').textContent = `${searches.length} ${searches.length === 1 ? 'search' : 'searches'}`;
      document.querySelectorAll('[data-history-view]').forEach(tab => {
        const active = tab.dataset.historyView === activeView;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      historyList.setAttribute('aria-labelledby', activeView === 'saved' ? 'tab-saved' : 'tab-recent');
      historyList.replaceChildren();
      const items = searches.filter(item => activeView === 'saved' ? item.saved : true).sort((a,b) => b.createdAt - a.createdAt);
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.innerHTML = `<span class="empty-mark">${activeView === 'saved' ? '☆' : '↗'}</span><div><strong>${activeView === 'saved' ? 'No saved searches yet' : 'Your searches will appear here'}</strong><p>${activeView === 'saved' ? 'Save a search to keep it close at hand.' : 'Run a marketplace search to start a history.'}</p></div>`;
        historyList.append(empty);
        return;
      }
      items.slice(0,8).forEach(item => {
        const row = document.createElement('article');
        row.className = 'history-item';
        const load = document.createElement('button');
        load.className = 'history-load';
        load.type = 'button';
        load.setAttribute('aria-label', `Load search: ${item.query}`);
        const icon = document.createElement('span');
        icon.className = 'history-kind';
        icon.textContent = '⌕';
        const text = document.createElement('span');
        text.style.minWidth = '0';
        const query = document.createElement('span');
        query.className = 'history-query';
        query.textContent = item.query;
        const meta = document.createElement('span');
        meta.className = 'history-meta';
        const date = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        meta.textContent = `${item.platformIds.length} ${item.platformIds.length === 1 ? 'market' : 'markets'} · ${date}`;
        text.append(query, meta);
        load.append(icon, text);
        load.addEventListener('click', () => loadSearch(item));
        row.append(load);
        const action = document.createElement('button');
        action.type = 'button';
        if (activeView === 'saved') {
          action.className = 'history-remove';
          action.textContent = '×';
          action.setAttribute('aria-label', `Remove saved search: ${item.query}`);
          action.addEventListener('click', () => setSaved(item.id, false));
        } else {
          action.className = `history-save${item.saved ? ' active' : ''}`;
          action.textContent = item.saved ? '★' : '☆';
          action.setAttribute('aria-label', `${item.saved ? 'Unsave' : 'Save'} search: ${item.query}`);
          action.addEventListener('click', () => setSaved(item.id, !item.saved));
        }
        row.append(action);
        historyList.append(row);
      });
    }
    function setSaved(id, saved) {
      searches = searches.map(item => item.id === id ? { ...item, saved } : item);
      persistSearches();
      renderHistory();
      const current = searches.find(item => item.id === currentSearchId);
      const saveButton = document.getElementById('saveSearchButton');
      if (current && saveButton) {
        saveButton.classList.toggle('saved', current.saved);
        saveButton.innerHTML = current.saved ? '★&nbsp; Saved' : '☆&nbsp; Save search';
      }
      showToast(saved ? 'Search saved to this browser.' : 'Search removed from saved.');
    }
    function showSearchResults(item) {
      const grid = document.getElementById('resultGrid');
      grid.replaceChildren();
      item.platformIds.forEach(id => {
        const platform = platforms[id];
        if (!platform) return;
        const card = document.createElement('article');
        card.className = 'result-card';
        card.innerHTML = `<div class="result-card-top"><span class="mini-logo" style="background:${platform.color};color:${platform.text}">${platform.short}</span><span><h3>${platform.name}</h3><div class="market-desc">${platform.note}</div></span></div><p>Search phrase <strong></strong></p><a target="_blank" rel="noopener noreferrer">Open marketplace<svg viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5m0-5-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a></article>`;
        card.querySelector('strong').textContent = `“${item.query}”`;
        card.querySelector('a').href = platform.url(item.query);
        grid.append(card);
      });
      document.getElementById('resultCount').textContent = `${item.platformIds.length} ${item.platformIds.length === 1 ? 'market' : 'markets'}`;
      document.getElementById('resultSummary').textContent = `Search phrase: “${item.query}”. Open a marketplace to browse live listings.`;
      const saveButton = document.getElementById('saveSearchButton');
      saveButton.classList.toggle('saved', Boolean(item.saved));
      saveButton.innerHTML = item.saved ? '★&nbsp; Saved' : '☆&nbsp; Save search';
      results.classList.add('show');
    }
    function loadSearch(item) {
      description.value = item.description || item.query;
      document.querySelectorAll('.switch').forEach(input => { input.checked = item.platformIds.includes(input.value); });
      document.querySelectorAll('.chip').forEach(chip => {
        const active = (item.preferences || []).includes(chip.dataset.term);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      updatePhrasePreview();
      currentSearchId = item.id;
      showSearchResults(item);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function prepareSearch() {
      const platformIds = selectedPlatforms();
      const basePhrase = description.value.trim();
      const preferences = selectedPreferences();
      if (!platformIds.length) { showToast('Select at least one marketplace.'); return; }
      if (!imageUrl && !basePhrase) { showToast('Add a reference image or describe the item first.'); fileInput.click(); return; }
      if (!basePhrase) { showToast('Add a few words to create a marketplace search.'); description.focus(); return; }
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, description: basePhrase, preferences, query: [basePhrase, ...preferences].join(' '), platformIds, createdAt: Date.now(), saved: false };
      currentSearchId = item.id;
      searches = [item, ...searches].slice(0,12);
      persistSearches();
      renderHistory();
      showSearchResults(item);
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Marketplace searches are ready.');
    }
    function setImage(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) { showToast('Choose an image file to continue.'); return; }
      if (file.size > 10 * 1024 * 1024) { showToast('That image is over 10 MB. Choose a smaller photo.'); return; }
      if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(file);
      preview.src = imageUrl;
      preview.style.display = 'block';
      dropzone.classList.add('has-image');
      document.getElementById('imageCaption').textContent = `${file.name} · Click to change`;
      document.getElementById('imageCaption').style.display = 'block';
      updatePhrasePreview();
      showToast('Reference image added.');
    }

    document.getElementById('trySample').addEventListener('click', () => {
      if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
      imageUrl = 'assets/sneaker.svg';
      preview.src = imageUrl;
      preview.style.display = 'block';
      dropzone.classList.add('has-image');
      document.getElementById('imageCaption').textContent = 'Sample reference · cream retro runner';
      document.getElementById('imageCaption').style.display = 'block';
      if (!description.value.trim()) description.value = 'Cream retro runner with suede panels';
      updatePhrasePreview();
      showToast('Sample reference added.');
    });

    fileInput.addEventListener('change', event => setImage(event.target.files[0]));
    for (const eventName of ['dragenter','dragover']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add('dragover'); });
    for (const eventName of ['dragleave','drop']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', event => setImage(event.dataTransfer.files[0]));
    description.addEventListener('input', updatePhrasePreview);
    description.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); prepareSearch(); } });
    document.querySelectorAll('.chip').forEach(chip => {
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        chip.setAttribute('aria-pressed', String(chip.classList.contains('active')));
        updatePhrasePreview();
      });
    });
    document.querySelectorAll('.switch').forEach(input => input.addEventListener('change', updatePhrasePreview));
    searchButton.addEventListener('click', prepareSearch);
    document.getElementById('saveSearchButton').addEventListener('click', () => {
      const current = searches.find(item => item.id === currentSearchId);
      if (current) setSaved(current.id, !current.saved);
    });
    document.querySelectorAll('[data-history-view]').forEach(tab => tab.addEventListener('click', () => { activeView = tab.dataset.historyView; renderHistory(); }));
    document.querySelectorAll('[data-nav]').forEach(nav => nav.addEventListener('click', () => {
      document.querySelectorAll('.nav-button').forEach(item => item.classList.toggle('active', item === nav));
      if (nav.dataset.nav === 'saved') { activeView = 'saved'; renderHistory(); document.getElementById('activityPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else if (nav.dataset.nav === 'help') document.getElementById('helpModal').hidden = false;
      else { document.getElementById('description').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }));
    document.getElementById('closeHelp').addEventListener('click', () => { document.getElementById('helpModal').hidden = true; });
    document.getElementById('understandHelp').addEventListener('click', () => { document.getElementById('helpModal').hidden = true; });
    document.getElementById('helpModal').addEventListener('click', event => { if (event.target.id === 'helpModal') event.currentTarget.hidden = true; });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.getElementById('helpModal').hidden = true;
      if (siteMenu.open) { siteMenu.open = false; siteMenu.querySelector('summary').focus(); }
    });
    document.addEventListener('click', event => { if (siteMenu.open && !siteMenu.contains(event.target)) siteMenu.open = false; });
    siteMenu.querySelectorAll('a, button').forEach(item => item.addEventListener('click', () => { siteMenu.open = false; }));
    updatePhrasePreview();
    renderHistory();
  
