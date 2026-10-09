'use strict';

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const preview = document.getElementById('preview');
const searchButton = document.getElementById('searchButton');
const results = document.getElementById('results');
const historyList = document.getElementById('historyList');
const siteMenu = document.getElementById('siteMenu');
const storageKey = 'sourcelens-visual-search-v1';
let selectedImage = null;
let imageUrl = null;
let activeView = 'recent';
let currentSearchId = null;
let toastTimer;
let searches = readSearches();

const platforms = {
  aliexpress: { name: 'AliExpress', short: 'A', color: '#f6efea', text: '#a95639' },
  dhgate: { name: 'DHgate', short: 'D', color: '#f6eeee', text: '#a44f49' },
  alibaba: { name: 'Alibaba', short: '阿', color: '#f5f0e8', text: '#936c3b' }
};

function readSearches() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(stored) ? stored.filter(item => item && item.id && Array.isArray(item.results)) : [];
  } catch { return []; }
}
function persistSearches() {
  try { localStorage.setItem(storageKey, JSON.stringify(searches)); }
  catch { showToast('Browser storage is full; this search was not saved.'); }
}
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function selectedPlatforms() {
  return [...document.querySelectorAll('.switch:checked')].map(input => input.value);
}
function updateSelectionCount() {
  const count = selectedPlatforms().length;
  document.getElementById('selectedCount').textContent = count;
  document.querySelector('.selected-summary').setAttribute('aria-label', `${count} marketplaces selected`);
}
function platformIdsFor(item) {
  return Array.isArray(item.platformIds) ? item.platformIds : [];
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
  const items = searches.filter(item => activeView === 'saved' ? item.saved : true).sort((a, b) => b.createdAt - a.createdAt);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.innerHTML = `<span class="empty-mark">${activeView === 'saved' ? '☆' : '↗'}</span><div><strong>${activeView === 'saved' ? 'No saved searches yet' : 'Your searches will appear here'}</strong><p>${activeView === 'saved' ? 'Save an image search to keep its matches.' : 'Search a product photo to start a history.'}</p></div>`;
    historyList.append(empty);
    return;
  }
  items.slice(0, 8).forEach(item => {
    const row = document.createElement('article');
    row.className = 'history-item';
    const load = document.createElement('button');
    load.className = 'history-load';
    load.type = 'button';
    load.setAttribute('aria-label', `View image search from ${new Date(item.createdAt).toLocaleDateString()}`);
    const icon = document.createElement('span');
    icon.className = 'history-kind';
    icon.textContent = '▧';
    const text = document.createElement('span');
    text.style.minWidth = '0';
    const label = document.createElement('span');
    label.className = 'history-query';
    label.textContent = 'Visual image search';
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    const date = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const marketCount = platformIdsFor(item).length;
    meta.textContent = `${marketCount} ${marketCount === 1 ? 'market' : 'markets'} · ${date}`;
    text.append(label, meta);
    load.append(icon, text);
    load.addEventListener('click', () => loadSearch(item));
    row.append(load);
    const action = document.createElement('button');
    action.type = 'button';
    if (activeView === 'saved') {
      action.className = 'history-remove';
      action.textContent = '×';
      action.setAttribute('aria-label', 'Remove saved image search');
      action.addEventListener('click', () => setSaved(item.id, false));
    } else {
      action.className = `history-save${item.saved ? ' active' : ''}`;
      action.textContent = item.saved ? '★' : '☆';
      action.setAttribute('aria-label', `${item.saved ? 'Unsave' : 'Save'} image search`);
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
  showToast(saved ? 'Image search saved in this browser.' : 'Image search removed from saved.');
}
function showSearchResults(item) {
  const grid = document.getElementById('resultGrid');
  grid.replaceChildren();
  const matches = Array.isArray(item.results) ? item.results : [];
  for (const match of matches) {
    const platform = platforms[match.marketplace];
    if (!platform) continue;
    const card = document.createElement('article');
    card.className = 'visual-result-card';
    const photo = document.createElement('img');
    photo.className = 'visual-result-photo';
    photo.alt = `Product result from ${platform.name}`;
    photo.loading = 'lazy';
    photo.referrerPolicy = 'no-referrer';
    if (match.thumbnail) {
      photo.src = match.thumbnail;
      photo.addEventListener('error', () => { photo.hidden = true; }, { once: true });
    } else {
      photo.hidden = true;
    }
    const content = document.createElement('div');
    content.className = 'visual-result-content';
    const top = document.createElement('div');
    top.className = 'visual-result-top';
    const logo = document.createElement('span');
    logo.className = 'mini-logo';
    logo.style.background = platform.color;
    logo.style.color = platform.text;
    logo.textContent = platform.short;
    const brand = document.createElement('span');
    brand.className = 'visual-result-brand';
    brand.textContent = platform.name;
    const badge = document.createElement('span');
    badge.className = `match-badge${match.exact ? ' exact' : ''}`;
    badge.textContent = match.exact ? 'Exact visual match' : 'Similar item';
    top.append(logo, brand, badge);
    const title = document.createElement('h3');
    title.textContent = match.title || 'Marketplace listing';
    const details = document.createElement('div');
    details.className = 'visual-result-details';
    details.textContent = [match.price, match.source].filter(Boolean).join(' · ') || 'Open listing for details';
    const link = document.createElement('a');
    link.className = 'visual-result-link';
    link.href = match.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View listing ↗';
    top.append(badge);
    content.append(top, title, details, link);
    card.append(photo, content);
    grid.append(card);
  }
  if (!grid.children.length) {
    const empty = document.createElement('div');
    empty.className = 'match-empty';
    const heading = document.createElement('strong');
    heading.textContent = 'No selected marketplace matches yet';
    const copy = document.createElement('p');
    copy.textContent = 'Try a well-lit photo of one item, with the product filling most of the frame.';
    empty.append(heading, copy);
    if (item.imageSearchUrl) {
      const link = document.createElement('a');
      link.href = item.imageSearchUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open the full Google Lens results ↗';
      empty.append(link);
    }
    grid.append(empty);
  }
  const exactCount = Number(item.exactCount) || 0;
  document.getElementById('resultCount').textContent = `${matches.length} ${matches.length === 1 ? 'listing' : 'listings'}`;
  document.getElementById('resultSummary').textContent = matches.length
    ? `${exactCount} provider-marked exact ${exactCount === 1 ? 'match' : 'matches'} and ${matches.length - exactCount} similar ${matches.length - exactCount === 1 ? 'listing' : 'listings'}, found from the photo.`
    : 'The photo search returned no results on the selected marketplaces.';
  const saveButton = document.getElementById('saveSearchButton');
  saveButton.classList.toggle('saved', Boolean(item.saved));
  saveButton.innerHTML = item.saved ? '★&nbsp; Saved' : '☆&nbsp; Save search';
  results.classList.add('show');
}
function loadSearch(item) {
  document.querySelectorAll('.switch').forEach(input => { input.checked = platformIdsFor(item).includes(input.value); });
  updateSelectionCount();
  currentSearchId = item.id;
  showSearchResults(item);
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function optimizeImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    let quality = 0.9;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('This photo could not be processed. Try a JPG, PNG, or WebP image.');
      if (blob.size <= 450 * 1024) return new File([blob], 'reference.jpg', { type: 'image/jpeg' });
      if (quality > 0.58) quality -= 0.08;
      else { width = Math.max(1, Math.round(width * 0.82)); height = Math.max(1, Math.round(height * 0.82)); quality = 0.82; }
    }
    throw new Error('This photo could not be reduced enough for visual search. Try a smaller image.');
  } finally {
    if (bitmap.close) bitmap.close();
  }
}
async function prepareSearch() {
  const platformIds = selectedPlatforms();
  if (!platformIds.length) { showToast('Select at least one marketplace.'); return; }
  if (!selectedImage) { showToast('Add a product photo first.'); fileInput.click(); return; }
  const buttonLabel = searchButton.querySelector('span:first-child');
  searchButton.disabled = true;
  searchButton.setAttribute('aria-busy', 'true');
  buttonLabel.textContent = 'Finding visual matches…';
  try {
    const image = await optimizeImage(selectedImage);
    const form = new FormData();
    form.append('image', image, image.name);
    form.append('platforms', JSON.stringify(platformIds));
    const response = await fetch('/api/search', { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Image search failed. Try again.');
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      searchLabel: 'Visual image search',
      platformIds,
      createdAt: Date.now(),
      saved: false,
      results: Array.isArray(data.results) ? data.results.slice(0, 30) : [],
      exactCount: Number(data.exactCount) || 0,
      imageSearchUrl: data.imageSearchUrl || ''
    };
    currentSearchId = item.id;
    searches = [item, ...searches].slice(0, 8);
    persistSearches();
    renderHistory();
    showSearchResults(item);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`${item.results.length} visual ${item.results.length === 1 ? 'match' : 'matches'} found.`);
  } catch (error) {
    showToast(error.message || 'Image search failed. Check your connection and try again.');
  } finally {
    searchButton.disabled = false;
    searchButton.removeAttribute('aria-busy');
    buttonLabel.textContent = 'Find visual matches';
  }
}
function setImage(file, sample = false) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type) && !(sample && file.type === 'image/svg+xml')) {
    showToast('Choose a JPG, PNG, or WebP photo.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) { showToast('That image is over 10 MB. Choose a smaller photo.'); return; }
  if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
  selectedImage = file;
  imageUrl = URL.createObjectURL(file);
  preview.src = imageUrl;
  preview.style.display = 'block';
  dropzone.classList.add('has-image');
  document.getElementById('imageCaption').textContent = sample ? 'Sample illustration · cream retro runner' : `${file.name} · Click to change`;
  document.getElementById('imageCaption').style.display = 'block';
  showToast('Reference image added.');
}
async function addSampleImage() {
  try {
    const response = await fetch('assets/sneaker.svg');
    if (!response.ok) throw new Error('Could not load the sample image.');
    const blob = await response.blob();
    setImage(new File([blob], 'sample-sneaker.svg', { type: 'image/svg+xml' }), true);
  } catch {
    showToast('Start SourceLens with npm start to load the sample image.');
  }
}
async function checkProvider() {
  const status = document.getElementById('providerStatus');
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    if (data.ready) {
      status.textContent = 'Google Lens visual matching is ready';
      status.classList.add('ready');
    } else {
      status.textContent = 'Add a SerpApi key to .env to enable visual matching';
      status.classList.add('needs-config');
    }
  } catch {
    status.textContent = 'Start SourceLens with npm start to use image search';
    status.classList.add('needs-config');
  }
}

fileInput.addEventListener('change', event => {
  setImage(event.target.files[0]);
  event.target.value = '';
});
document.getElementById('trySample').addEventListener('click', addSampleImage);
for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add('dragover'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('dragover'); });
dropzone.addEventListener('drop', event => setImage(event.dataTransfer.files[0]));
document.querySelectorAll('.switch').forEach(input => input.addEventListener('change', updateSelectionCount));
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
updateSelectionCount();
renderHistory();
checkProvider();