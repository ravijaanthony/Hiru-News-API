// Cloudflare Worker entry — runs Vercel-style api/*.js modules via synthetic req/res

const breakingNewsMod = require('./api/breaking-news.js');
const latestNewsMod = require('./api/latest-news.js');
const healthMod = require('./api/health.js');
const dateMod = require('./api/date.js');
const searchMod = require('./api/search.js');
const articleMod = require('./api/article/[id].js');
const categoryMod = require('./api/category/[name].js');

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

function buildSyntheticReq(request) {
  const url = new URL(request.url);
  const query = {};
  url.searchParams.forEach((v, k) => {
    // Vercel parses single values as strings; duplicates become arrays (not used here)
    query[k] = v;
  });

  const pathname = url.pathname;

  // Dynamic route injection (Vercel does this automatically for /api/article/440221, /api/category/sports)
  if (pathname.startsWith('/api/article/')) {
    query.id = pathname.replace('/api/article/', '');
  }
  if (pathname.startsWith('/api/category/')) {
    query.name = pathname.replace('/api/category/', '');
  }

  return {
    method: request.method,
    url: request.url,
    query: query,
    headers: {},
  };
}

function buildSyntheticRes() {
  let statusCode = 200;
  const headers = {};
  let body = null;

  const res = {
    setHeader: (k, v) => {
      headers[k.toLowerCase()] = v;
    },
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      body = JSON.stringify(data);
      headers['content-type'] = 'application/json';
      return res;
    },
    end: () => {
      return res;
    },
    // Internal access for wrapper
    __getState: () => ({ statusCode, headers, body }),
  };
  return res;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CORS preflight handled by module itself; pass through
  const req = buildSyntheticReq(request);
  const res = buildSyntheticRes();

  let mod = null;
  if (pathname === '/api/health') mod = healthMod;
  else if (pathname === '/api/breaking-news') mod = breakingNewsMod;
  else if (pathname === '/api/latest-news') mod = latestNewsMod;
  else if (pathname === '/api/date') mod = dateMod;
  else if (pathname === '/api/search') mod = searchMod;
  else if (pathname === '/api/test') { mod = require('./api/test.js'); }
  else if (pathname.startsWith('/api/article/')) mod = articleMod;
  else if (pathname.startsWith('/api/category/')) mod = categoryMod;

  if (!mod && pathname === '/') {
    return new Response(JSON.stringify({ service: 'hiru-news-api', status: 'ok', platform: 'cloudflare-workers', endpoints: ['/api/health', '/api/breaking-news', '/api/latest-news', '/api/article/{id}', '/api/category/{name}', '/api/date', '/api/search'] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  if (!mod) {
    return new Response(JSON.stringify({ error: 'Not found', path: pathname }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  try {
    await mod(req, res);
  } catch (err) {
    // If module throws, capture as 500
    const state = res.__getState();
    if (!state.body) {
      return new Response(JSON.stringify({ success: false, error: err.message, timestamp: new Date().toISOString() }), {
        status: 500,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
  }

  const state = res.__getState();
  const responseHeaders = new Headers();
  for (const [k, v] of Object.entries(state.headers)) {
    responseHeaders.set(k, v);
  }
  // Ensure CORS if module didn't set
  if (!responseHeaders.has('access-control-allow-origin')) {
    responseHeaders.set('access-control-allow-origin', '*');
  }

  return new Response(state.body !== null ? state.body : '', {
    status: state.statusCode,
    headers: responseHeaders,
  });
}
