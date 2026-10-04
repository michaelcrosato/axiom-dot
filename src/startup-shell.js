/* Deliberately plain JavaScript: injected into HTML before all module/CSS requests. */
(function () {
  'use strict';
  const w = window, d = document, root = d.getElementById('startup');
  const started = performance.now(), timers = new Map(), cleanups = [], stages = [], events = [];
  const controller = new AbortController();
  let phase = 'loading', last = 'HTML diagnostic shell', error = null, reloading = false, finishTime = null;
  const get = id => d.getElementById(id);
  const build = { version: 'Experimental startup v1', source: '__AXIOM_SOURCE__', built: '__AXIOM_BUILT__' };
  function safe(value, limit = 1400) {
    let s;
    try { s = typeof value === 'string' ? value : value instanceof Error ? value.message : 'Non-text error (payload omitted)'; } catch { s = 'Unreadable error'; }
    return s.replace(/(?:https?|wss?|file|blob|data):[^\s<>"')]+/gi, match => {
      if (/^https?:/.test(match)) { try { const u = new URL(match); const asset = u.pathname.match(/\/(?:assets\/)?([a-z0-9_.-]+\.(?:js|css|wasm))(?:$|:)/i); const position = u.pathname.match(/:\d+(?::\d+)?$/)?.[0] || ''; return asset ? '[asset]/' + asset[1] + position : '[URL removed]'; } catch {} }
      return '[URL removed]';
    }).replace(/(?:^|[\s(])\/(?!\[)[^\s<>"')]+/g, ' [path removed]').replace(/\b(?:access|refresh|auth|session)[_-]?token\s*[:=]\s*[^\s,;]+/gi, '[credential removed]').replace(/\broom\s+(?:code|id|token)\s+[^\s,;]+/gi, '[room removed]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
      .replace(/\b(?:Bearer\s+)[^\s]+/gi, 'Bearer [removed]')
      .replace(/\b(?:token|secret|password|authorization|cookie|api[_-]?key|room(?:Id|Code|Token)?|invite|save(?:game)?|payload)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[private value removed]')
      .replace(/\b(?:sk-|eyJ)[A-Za-z0-9_.-]{12,}/g, '[credential removed]')
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[long identifier removed]')
      .replace(/\{[\s\S]*\}/g, '[object payload omitted]').slice(0, limit);
  }
  const ua = navigator.userAgent || '';
  const browser = ua.match(/(?:Firefox|Edg|Chrome|Version)\/[\d.]+/g)?.join(' ') || 'Browser version not reported';
  const platform = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS/iPadOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const capability = { browser, platform, secureContext: w.isSecureContext === true, webgpuAPI: !!navigator.gpu, workerAPI: typeof Worker !== 'undefined', wasmAPI: typeof WebAssembly !== 'undefined', online: navigator.onLine !== false, viewport: `${w.innerWidth} × ${w.innerHeight}`, pixelRatio: Math.min(8, Number(w.devicePixelRatio) || 1), touchPoints: Math.min(20, navigator.maxTouchPoints || 0) };
  const attempts = [];
  let selected = 'Not selected', overlayHandler = null, previousFocus = null;
  const allowedTests = ['module-fail', 'renderer-fail', 'webgpu-fallback', 'slow-shaders', 'optional-font-fail', 'timeout'];
  let test = 'none';
  try { const url = new URL(location.href); const choice = url.searchParams.get('startupTest'); if (allowedTests.includes(choice)) test = choice; if (url.searchParams.has('startupTest')) { url.searchParams.delete('startupTest'); history.replaceState(history.state, '', url.pathname + url.search + url.hash); } } catch {}
  const elapsed = () => Math.max(0, Math.round((finishTime ?? performance.now()) - started));
  function note(message) { events.push({ ms: Math.round(performance.now() - started), text: safe(message, 500) }); if (events.length > 32) events.shift(); }
  function report() {
    return ['AXIOM STARTUP REPORT · ' + build.version, 'Source: ' + build.source, 'Built UTC: ' + build.built, 'Status: ' + phase + ' · elapsed ' + elapsed() + ' ms', 'Last completed: ' + last, 'Current: ' + stages.filter(s => s.status === 'running').map(s => s.label).join(' + '), 'Renderer: ' + selected, 'Test mode: ' + test + (test === 'none' ? '' : ' (simulated, one navigation only)'), ...Object.entries(capability).map(([k,v]) => k + ': ' + v), '', 'BACKEND ATTEMPTS', ...attempts.map(a => `${a.name}: ${a.status} · ${a.ms} ms · ${a.detail}`), '', 'STAGES (counts are work units, not download percent)', ...stages.map(s => `${s.label}: ${s.status} · ${Math.round((s.end ?? performance.now()) - s.start)} ms${s.total !== undefined ? ` · ${s.done}/${s.total}` : ''} · ${s.detail}`), '', ...(error ? ['ERROR · ' + error.category, error.message, error.location, error.stack, ''] : []), 'BREADCRUMBS', ...events.map(e => `${e.ms} ms · ${e.text}`), '', 'Privacy: no save bytes, account identity, room codes or private URLs are collected. Error text is bounded and redacted; review before sharing.', 'Scope: loaded spawn only; distant terrain streams later. Compilation/first-frame timings are startup wall time, not FPS or a GPU benchmark.', 'Limits: no in-page report is possible if HTML itself never arrives, JavaScript is disabled/blocked, or the browser/GPU process terminates.'].join('\n').slice(0, 18000);
  }
  function paint() {
    get('startup-build').textContent = `${build.version} · ${build.source.slice(0, 12)} · ${build.built}`;
    get('startup-status').textContent = phase === 'failed' ? 'Startup / runtime stopped' : phase === 'ready' ? 'Ready to play' : 'Preparing your frontier';
    get('startup-summary').textContent = `${elapsed()} ms · ${stages.filter(s => ['done','degraded'].includes(s.status)).length} stages finished · ${selected}`;
    get('startup-current').textContent = 'Current: ' + (stages.filter(s => s.status === 'running').map(s => s.label).join(' + ') || (phase === 'failed' ? error?.category : phase === 'ready' ? 'Complete' : 'Loading game modules'));
    get('startup-last').textContent = 'Last completed: ' + last;
    get('startup-capability').textContent = `${platform} · ${browser} · ${capability.viewport} · WebGPU API ${capability.webgpuAPI ? 'present (not proof of support)' : 'absent'} · ${navigator.onLine === false ? 'offline reported' : 'network status online'}`;
    get('startup-stages').textContent = stages.map(s => `${s.status === 'done' ? '✓' : s.status === 'failed' ? '!' : s.status === 'degraded' ? '~' : '·'} ${s.label}${s.total !== undefined ? ` ${s.done}/${s.total}` : ''} · ${Math.round((s.end ?? performance.now()) - s.start)} ms\n  ${s.detail}`).join('\n');
    const issue = get('startup-error'); issue.hidden = !error; issue.textContent = error ? `${error.category}\n${error.message}\n${error.location}\n${error.stack}` : '';
    get('startup-backends').textContent = attempts.map(a => `${a.name}: ${a.status}${a.detail ? ' · ' + a.detail : ''}`).join('\n') || 'Renderer not attempted yet';
    get('startup-report').value = report();
    get('startup-stop').hidden = phase !== 'loading';
    get('startup-reload').hidden = phase === 'loading'; get('startup-webgl').hidden = phase === 'loading';
    get('startup-close').hidden = phase !== 'ready';
    get('startup-test').textContent = test === 'none' ? '' : `DIAGNOSTIC TEST: ${test}. Simulated for this navigation only.`;
    root.dataset.state = phase;
  }
  function assertAlive() { if (phase === 'failed' || controller.signal.aborted) throw Object.assign(Error('Startup stopped; reload required'), { name: 'AbortError' }); }
  function fail(category, value, locationText = '') {
    if (phase === 'failed') { note('Additional issue: ' + category + ' · ' + safe(value)); return; }
    let stack = ''; try { if (typeof value?.stack === 'string') stack = value.stack; } catch {}
    error = { category: safe(category, 100), message: safe(value), location: safe(locationText, 350), stack: safe(stack, 2500) };
    phase = 'failed'; finishTime = performance.now();
    for (const s of stages) if (s.status === 'running') { s.status = 'failed'; s.end = performance.now(); }
    for (const t of timers.values()) clearTimeout(t); timers.clear();
    controller.abort(); note('Stopped: ' + category); root.hidden = false; d.documentElement.dataset.bootState = 'failed';
    const app = get('app'); if (app) app.inert = true;
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch { note('A cleanup handler could not finish; a full reload is required'); } }
    paint(); get('startup-status').focus?.({ preventScroll: true });
  }
  function begin(id, label, timeoutMs = 30000, optional = false) {
    assertAlive(); if (stages.some(s => s.id === id)) throw Error('Duplicate startup stage: ' + id);
    const s = { id, label: safe(label, 100), optional, timeoutMs, start: performance.now(), status: 'running', detail: '' }; stages.push(s); note('Started ' + s.label);
    timers.set(id, setTimeout(() => { if (s.status !== 'running') return; if (optional) end(id, 'Optional deadline reached; default presentation retained', 'degraded'); else fail('Timeout · ' + s.label, Error(`No completion within ${timeoutMs} ms. Reload to retry; your last saved checkpoint is retained.`)); }, timeoutMs)); paint();
  }
  function detail(id, text, done, total) { const s = stages.find(s => s.id === id); if (!s || s.status !== 'running') return; s.detail = safe(text, 600); if (Number.isFinite(done) && Number.isFinite(total) && done >= 0 && total >= done && total <= 10000) { s.done = done; s.total = total; } paint(); }
  function end(id, text = '', status = 'done') { assertAlive(); const s = stages.find(s => s.id === id); if (!s || s.status !== 'running') return; if (status === 'done' && performance.now() - s.start >= s.timeoutMs) { if (s.optional) { status = 'degraded'; text = 'Optional deadline exceeded; fallback retained'; } else { fail('Timeout · ' + s.label, Error('This stage exceeded its ' + s.timeoutMs + ' ms budget, including synchronous work. Reload to retry.')); assertAlive(); } } clearTimeout(timers.get(id)); timers.delete(id); s.end = performance.now(); s.status = status; if(text)s.detail = safe(text, 600); last = s.label; note('Finished ' + s.label + ': ' + s.detail); paint(); }
  async function run(id, label, job, timeoutMs = 30000, optional = false) {
    begin(id, label, timeoutMs, optional);
    let timer, abort;
    try {
      const result = await Promise.race([Promise.resolve().then(() => { assertAlive(); return job(); }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Stage deadline reached')), timeoutMs); abort = () => reject(Object.assign(Error('Startup cancelled'), { name: 'AbortError' })); controller.signal.addEventListener('abort', abort, { once: true }); })]);
      assertAlive(); end(id); return result;
    } catch (e) { if (optional && phase !== 'failed') { end(id, safe(e), 'degraded'); return undefined; } fail('Initialization · ' + label, e); throw e; }
    finally { clearTimeout(timer); if (abort) controller.signal.removeEventListener('abort', abort); }
  }
  function attempt(name, status, value = '') { attempts.push({ name: safe(name, 80), status: safe(status, 60), detail: safe(value, 500), ms: Math.round(performance.now() - started) }); if (attempts.length > 12) attempts.shift(); if (status === 'selected') selected = name; note(name + ' ' + status + ' ' + safe(value, 180)); paint(); }
  function cleanup(fn) { if (phase === 'failed') { try { fn(); } catch {} } else cleanups.push(fn); }
  function show() { previousFocus = d.activeElement; root.hidden = false; const app=get('app'); if(app)app.inert=true; overlayHandler?.(); paint(); get('startup-status').focus?.({preventScroll:true}); }
  function ready() { assertAlive(); if (stages.some(s => !s.optional && s.status === 'running')) throw Error('Critical startup work is still running'); phase = 'ready'; finishTime = performance.now(); d.documentElement.dataset.bootState = 'ready'; const app = get('app'); if (app) app.inert = false; note('Critical gate released; first frame submitted, no gameplay tick used for warmup'); paint(); root.hidden = true; }
  function reload(webgl = false) { if (reloading) return; reloading = true; if (phase !== 'failed') fail('Reload requested', 'Returning to the last saved checkpoint.'); get('startup-reload').disabled = true; get('startup-webgl').disabled = true; try { const url = new URL(location.href); url.searchParams.delete('startupTest'); if (webgl) url.searchParams.set('backend', 'webgl'); location.replace(url.href); } catch { location.reload(); } }
  get('startup-stop').onclick = () => fail('Cancelled by player', 'Startup was cancelled safely. Reload to try again.');
  get('startup-reload').onclick = () => reload(false); get('startup-webgl').onclick = () => reload(true);
  get('startup-close').onclick = () => { if (phase === 'ready') { root.hidden = true; const app=get('app'); if(app)app.inert=false; overlayHandler?.(); previousFocus?.focus?.({preventScroll:true}); } };
  get('startup-copy').onclick = async () => { const box = get('startup-report'); box.value = report(); get('startup-details').open = true; try { if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable'); await navigator.clipboard.writeText(box.value); get('startup-action-status').textContent = 'Report copied. Review it before sharing.'; } catch { box.focus(); box.select(); get('startup-action-status').textContent = 'Copy was blocked. Select and copy the report text below, or take a screenshot.'; } };
  get('startup-download').onclick = () => { get('startup-details').open = true; get('startup-report').value = report(); try { const url = URL.createObjectURL(new Blob([report()], { type: 'text/plain;charset=utf-8' })); const a = d.createElement('a'); a.href = url; a.download = 'axiom-startup-report.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); get('startup-action-status').textContent = 'Download requested. If nothing appeared, copy the report below.'; } catch { get('startup-action-status').textContent = 'Download unavailable. Copy the report below or take a screenshot.'; } };
  w.addEventListener('error', event => { if (event.target && event.target !== w) { const el = event.target; if (el.dataset?.startupOptional !== undefined || el.tagName === 'IMG' || el.rel === 'icon') { note('Optional resource unavailable'); paint(); return; } fail('Resource load failure', 'Required ' + (el.tagName || 'resource') + ' failed to load', el.src || el.href || 'Location unavailable'); } else fail('Uncaught JavaScript error', event.error || event.message, (event.filename || '') + ':' + (event.lineno || 0) + ':' + (event.colno || 0)); }, true);
  w.addEventListener('unhandledrejection', event => fail('Unhandled promise rejection', event.reason));
  w.addEventListener('offline', () => { capability.online = false; note('Browser reports offline; cached resources may still work'); paint(); });
  w.addEventListener('online', () => { capability.online = true; note('Browser reports online'); paint(); });
  w.addEventListener('resize', () => { capability.viewport = `${w.innerWidth} × ${w.innerHeight}`; if (!root.hidden) paint(); });
  w.addEventListener('pagehide', () => { if (phase === 'loading') fail('Navigation interrupted startup', 'This startup was cancelled. Reload after returning to retry safely.'); });
  w.addEventListener('pageshow', () => { if (phase === 'failed') show(); });
  // Capture input before any game listener. Diagnostic controls remain usable.
  for (const type of ['keydown','keyup','pointerdown','pointermove','pointerup','wheel']) w.addEventListener(type, event => { if (!root.hidden && root.contains(event.target) && (type === 'keydown' || type === 'keyup')) { if(type === 'keydown' && event.key === 'Tab' && root.querySelectorAll) { const items=Array.from(root.querySelectorAll('button:not([hidden]):not(:disabled),summary,textarea')).filter(el=>el.getClientRects().length); const first=items[0],last=items[items.length-1]; if(first && last && (event.shiftKey && (event.target===first || event.target===get('startup-status')) || !event.shiftKey && event.target===last)) { event.preventDefault(); (event.shiftKey?last:first).focus(); } } event.stopImmediatePropagation(); return; } if ((phase !== 'ready' || !root.hidden) && !root.contains(event.target)) { event.stopImmediatePropagation(); if (event.cancelable) event.preventDefault(); } }, { capture: true, passive: false });
  w.axiomStartup = { build, test, signal: controller.signal, begin, detail, end, run, fail, attempt, cleanup, assertAlive, report, show, ready, note, safe, setOverlayHandler(fn) { overlayHandler=fn; }, get initialized() { return phase === 'ready'; }, get playing() { return phase === 'ready' && root.hidden; }, get failed() { return phase === 'failed'; } };
  d.documentElement.dataset.bootState = 'loading';
  begin('module', 'Game modules & critical CSS', 60000); detail('module', 'Loading the game, Three renderer and physics transport. No game UI or input is active.');
  const ticker = setInterval(() => { if (phase !== 'loading') { clearInterval(ticker); return; } paint(); }, 250);
  cleanup(() => clearInterval(ticker));
  paint();get('startup-status').focus?.({preventScroll:true});
})();
