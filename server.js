'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 24 * 1024;
const SERPAPI_KEY = process.env.SERPAPI_API_KEY || loadLocalKey();
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};
const MARKETPLACES = {
  aliexpress: { label: 'AliExpress', domains: ['aliexpress.com'] },
  dhgate: { label: 'DHgate', domains: ['dhgate.com'] },
  alibaba: { label: 'Alibaba', domains: ['alibaba.com'] }
};

function loadLocalKey() {
  try {
    const source = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const row = source.split(/\r?\n/).find(line => /^\s*SERPAPI_API_KEY\s*=/.test(line));
    if (!row) return '';
    return row.replace(/^\s*SERPAPI_API_KEY\s*=\s*/, '').trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks, size)));
    req.on('error', reject);
  });
}

function parseMultipart(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundaryText = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]).trim();
  if (!boundaryText) throw Object.assign(new Error('Send the image as multipart form data.'), { statusCode: 400 });

  const boundary = Buffer.from(`--${boundaryText}`);
  const separator = Buffer.from(`\r\n--${boundaryText}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  const fields = {};
  let image = null;
  let cursor = 0;

  while (true) {
    const marker = body.indexOf(boundary, cursor);
    if (marker < 0) break;
    cursor = marker + boundary.length;
    if (body.subarray(cursor, cursor + 2).toString() === '--') break;
    if (body.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const headerEnd = body.indexOf(headerSeparator, cursor);
    if (headerEnd < 0) break;
    const headers = body.subarray(cursor, headerEnd).toString('utf8');
    const contentStart = headerEnd + headerSeparator.length;
    const contentEnd = body.indexOf(separator, contentStart);
    if (contentEnd < 0) break;
    const content = body.subarray(contentStart, contentEnd);
    const dispositionMatch = /content-disposition:\s*form-data\s*;([^\r\n]+)/i.exec(headers);
    const nameMatch = dispositionMatch && /\bname=(?:"([^"]+)"|([^;\s]+))/i.exec(dispositionMatch[1]);
    const name = nameMatch && (nameMatch[1] || nameMatch[2]);
    if (name === 'image') {
      const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
      image = { buffer: content, contentType: typeMatch ? typeMatch[1].trim().toLowerCase() : '' };
    } else if (name) {
      fields[name] = content.toString('utf8');
    }
    cursor = contentEnd + 2;
  }

  if (!image || !image.buffer.length) throw Object.assign(new Error('Choose a product photo first.'), { statusCode: 400 });
  if (image.buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('The optimized image must be 500 KB or smaller.'), { statusCode: 413 });
  if (!isSupportedImage(image.buffer, image.contentType)) {
    throw Object.assign(new Error('Use a JPEG, PNG, or WebP image.'), { statusCode: 415 });
  }
  return { image, fields };
}

function isSupportedImage(buffer, contentType) {
  if (contentType === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (contentType === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return true;
  if (contentType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
}

function selectedMarketplaceIds(raw) {
  let values;
  try { values = JSON.parse(raw || '[]'); } catch { values = []; }
  if (!Array.isArray(values)) values = [];
  return [...new Set(values.filter(id => Object.hasOwn(MARKETPLACES, id)))];
}

async function uploadImage(image) {
  const form = new FormData();
  form.append('image', new Blob([image.buffer], { type: image.contentType }), 'reference.jpg');
  form.append('api_key', SERPAPI_KEY);
  const response = await fetch('https://serpapi.com/image', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.image_id) {
    const error = new Error('The image search provider could not accept this photo. Please try another image.');
    error.statusCode = 502;
    throw error;
  }
  return result.image_id;
}

async function searchByImage(imageId) {
  const params = new URLSearchParams({
    engine: 'google_lens',
    image_id: imageId,
    type: 'visual_matches',
    auto_crop: 'true',
    hl: 'en',
    country: 'us',
    api_key: SERPAPI_KEY
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(60000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const error = new Error('The visual search could not be completed. Please try again in a moment.');
    error.statusCode = 502;
    throw error;
  }
  return result;
}

function httpsUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function marketplaceFor(urlValue, selected) {
  try {
    const host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./, '');
    return selected.find(id => MARKETPLACES[id].domains.some(domain => host === domain || host.endsWith(`.${domain}`))) || '';
  } catch {
    return '';
  }
}

function priceText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.value === 'string') return value.value;
  return '';
}

function mapVisualMatches(rawResults, selected) {
  const seen = new Set();
  const matches = [];
  for (const result of rawResults) {
    const link = httpsUrl(result.link);
    const marketplace = marketplaceFor(link, selected);
    if (!marketplace || seen.has(link)) continue;
    seen.add(link);
    matches.push({
      marketplace,
      title: String(result.title || MARKETPLACES[marketplace].label + ' listing').slice(0, 240),
      link,
      thumbnail: httpsUrl(result.thumbnail) || httpsUrl(result.image),
      source: String(result.source || MARKETPLACES[marketplace].label).slice(0, 100),
      price: priceText(result.price).slice(0, 80),
      rating: Number.isFinite(Number(result.rating)) ? Number(result.rating) : null,
      reviews: Number.isFinite(Number(result.reviews)) ? Number(result.reviews) : null,
      exact: result.exact_matches === true,
      position: Number.isFinite(Number(result.position)) ? Number(result.position) : matches.length + 1
    });
    if (matches.length >= 30) break;
  }
  return matches.sort((a, b) => Number(b.exact) - Number(a.exact) || a.position - b.position);
}
async function handleImageSearch(req, res) {
  if (!SERPAPI_KEY) {
    return sendJson(res, 503, { error: 'Visual search is not configured yet. Add your SerpApi key to the .env file, then restart SourceLens.' });
  }
  const body = await readBody(req, MAX_BODY_BYTES);
  const { image, fields } = parseMultipart(body, req.headers['content-type']);
  const selected = selectedMarketplaceIds(fields.platforms);
  if (!selected.length) return sendJson(res, 400, { error: 'Choose at least one marketplace.' });

  const imageId = await uploadImage(image);
  const lens = await searchByImage(imageId);
  const results = mapVisualMatches(Array.isArray(lens.visual_matches) ? lens.visual_matches : [], selected);
  const lensUrl = httpsUrl(lens.search_metadata && lens.search_metadata.google_lens_url);
  return sendJson(res, 200, {
    provider: 'Google Lens',
    results,
    exactCount: results.filter(item => item.exact).length,
    imageSearchUrl: lensUrl.startsWith('https://lens.google.com/') ? lensUrl : ''
  });
}

function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: 'Invalid path.' }); }
  if (decoded === '/') decoded = '/index.html';
  const absolute = path.resolve(ROOT, `.${decoded}`);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.stat(absolute, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(absolute).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(absolute).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ready: Boolean(SERPAPI_KEY), provider: 'Google Lens' });
  }
  if (requestUrl.pathname === '/api/search' && req.method === 'POST') {
    try { return await handleImageSearch(req, res); }
    catch (error) {
      if (!res.headersSent && !res.destroyed) return sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Image search failed. Check your connection and try again.' });
      return;
    }
  }
  if (requestUrl.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API route not found.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end('Method not allowed'); }
  serveStatic(req, res, requestUrl.pathname);
});

server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`SourceLens is running at http://127.0.0.1:${PORT}`);
  if (!SERPAPI_KEY) console.log('Add SERPAPI_API_KEY to .env to enable image matching.');
});






