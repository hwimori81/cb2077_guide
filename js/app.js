/* =========================================================================
 * 나이트 시티 공략집 — 앱 로직
 *  - 탭 전환 (PC 사이드바 / 모바일 하단 탭바, URL 해시 동기화)
 *  - 실시간 검색 + 빠른 필터
 *  - 체크리스트 localStorage 저장 + 진행률
 *  - 스포일러 블러 토글
 * ========================================================================= */
(function () {
  'use strict';

  const STORAGE_KEY = 'nc-guide:v1';
  const FILTERS = ['all', 'todo', 'missable', 'done'];

  const ICONS = {
    chip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    branch: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 4-6 3-11.3 7"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  };
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  /* ---------- 저장소 (사용 불가 환경 대비) ---------- */
  const store = {
    load() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
    },
    save(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 시 무시 */ }
    },
  };

  const saved = store.load();
  const state = {
    tab: GUIDE.tabs[0].id,
    filter: 'all',
    query: '',
    spoilerAll: !!saved.spoilerAll,
    checks: saved.checks || {},
    revealed: new Set(),
  };
  const hashTab = location.hash.slice(1);
  if (GUIDE.tabs.some(t => t.id === hashTab)) state.tab = hashTab;
  else if (saved.tab && GUIDE.tabs.some(t => t.id === saved.tab)) state.tab = saved.tab;

  function persist() {
    store.save({ checks: state.checks, tab: state.tab, spoilerAll: state.spoilerAll });
  }

  /* ---------- 유틸 ---------- */
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ');
  const tokens = (q) => q.toLowerCase().trim().split(/\s+/).filter(Boolean);

  function highlight(text, toks) {
    if (!toks.length) return esc(text);
    const pattern = toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return String(text).split(new RegExp('(' + pattern + ')', 'gi'))
      .map((part, i) => (i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part)))
      .join('');
  }

  /* 모든 체크 항목을 한 번만 수집 */
  const allItems = [];
  GUIDE.tabs.forEach(tab => tab.sections.forEach(sec => {
    if (sec.type === 'cards') sec.items.forEach(it => allItems.push({ ...it, tabId: tab.id }));
  }));
  const checkItems = allItems.filter(it => it.check);

  function searchText(item) {
    if (!item._text) {
      const meta = item.meta ? Object.entries(item.meta).map(([k, v]) => k + ' ' + stripHtml(v)).join(' ') : '';
      item._text = [item.title, item.sub, (item.tags || []).join(' '), meta, stripHtml(item.body)].join(' ').toLowerCase();
    }
    return item._text;
  }
  const matchesQuery = (text, toks) => toks.every(t => text.includes(t));

  function passesFilter(item) {
    const done = !!state.checks[item.id];
    switch (state.filter) {
      case 'todo': return !!item.check && !done;
      case 'done': return !!item.check && done;
      case 'missable': return !!item.missable;
      default: return true;
    }
  }

  function visibleItems(sec, toks) {
    if (sec.type === 'table') {
      if (state.filter !== 'all') return [];
      return sec.rows.filter(r => matchesQuery(stripHtml(r.join(' ') + ' ' + sec.title).toLowerCase(), toks));
    }
    return sec.items.filter(it => passesFilter(it) && matchesQuery(searchText(it), toks));
  }

  function countTabMatches(tab, toks) {
    return tab.sections.reduce((n, sec) => n + visibleItems(sec, toks).length, 0);
  }

  /* ---------- 네비게이션 ---------- */
  function renderNav() {
    const toks = tokens(state.query);
    const searching = toks.length > 0 || state.filter !== 'all';
    const side = GUIDE.tabs.map(t => {
      const n = countTabMatches(t, toks);
      const sel = t.id === state.tab;
      return `<button class="navbtn" role="tab" id="side-${t.id}" data-tab="${t.id}" aria-selected="${sel}" aria-controls="tabContent" tabindex="${sel ? 0 : -1}">
        ${ICONS[t.icon] || ''}<span>${esc(t.label)}</span>
        ${searching ? `<span class="navbtn__count ${n ? 'is-hit' : ''}">${n}</span>` : ''}
      </button>`;
    }).join('');
    const bottom = GUIDE.tabs.map(t => {
      const n = countTabMatches(t, toks);
      const sel = t.id === state.tab;
      return `<button class="tabbtn" role="tab" data-tab="${t.id}" aria-selected="${sel}" aria-controls="tabContent" aria-label="${esc(t.label)}">
        ${ICONS[t.icon] || ''}<span>${esc(t.short || t.label)}</span>
        ${searching && n && !sel ? `<span class="tabbtn__dot">${n > 99 ? '99+' : n}</span>` : ''}
      </button>`;
    }).join('');
    $('#sideNav').innerHTML = side;
    $('#bottomNav').innerHTML = bottom;
  }

  /* ---------- 진행률 ---------- */
  function groupStats(key, items = checkItems) {
    const list = items.filter(it => it.check === key);
    return { total: list.length, done: list.filter(it => state.checks[it.id]).length };
  }
  const pct = (d, t) => (t ? Math.round((d / t) * 100) : 0);

  function gpHTML(label, s) {
    return `<li class="gp ${s.total && s.done === s.total ? 'is-complete' : ''}">
      <div class="gp__row"><span>${esc(label)}</span><span class="gp__num"><b>${s.done}</b> / ${s.total}</span></div>
      <div class="bar bar--cyan" role="progressbar" aria-label="${esc(label)} 달성률" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.done}"><div class="bar__fill" style="width:${pct(s.done, s.total)}%"></div></div>
    </li>`;
  }

  function renderProgress() {
    const done = checkItems.filter(it => state.checks[it.id]).length;
    $('#overallDone').textContent = done;
    $('#overallTotal').textContent = checkItems.length;
    $('#overallBar').style.width = pct(done, checkItems.length) + '%';

    $('#groupProgress').innerHTML = GUIDE.checkGroups.map(g => gpHTML(g.label, groupStats(g.key))).join('');

    // 모바일: 현재 탭에 포함된 그룹만 표시
    const tabItems = checkItems.filter(it => it.tabId === state.tab);
    const groups = GUIDE.checkGroups.filter(g => tabItems.some(it => it.check === g.key));
    $('#mobileGroupProgress').innerHTML = groups.length
      ? groups.map(g => gpHTML(g.label, groupStats(g.key)).replace(/^<li/, '<div').replace(/<\/li>$/, '</div>')).join('')
      : '';

    // 섹션별 진행률
    document.querySelectorAll('[data-sec-progress]').forEach(el => {
      const sec = findSection(el.dataset.secProgress);
      if (!sec) return;
      const items = sec.items.filter(it => it.check);
      const d = items.filter(it => state.checks[it.id]).length;
      el.querySelector('.bar__fill').style.width = pct(d, items.length) + '%';
      el.querySelector('span').textContent = `${d} / ${items.length}`;
    });
  }

  function findSection(id) {
    for (const t of GUIDE.tabs) for (const s of t.sections) if (s.id === id) return s;
    return null;
  }

  /* ---------- 스포일러 ---------- */
  function spoilerWrap(id, inner) {
    const hidden = !state.spoilerAll && !state.revealed.has(id);
    return `<div class="spoiler ${hidden ? 'is-hidden' : ''}" data-spoiler="${esc(id)}">
      <div class="spoiler__content" ${hidden ? 'aria-hidden="true"' : ''}>${inner}</div>
      <button class="spoiler__btn" type="button" data-reveal="${esc(id)}">⚠ 스포일러 확인하기</button>
      <button class="spoiler__hide" type="button" data-conceal="${esc(id)}">다시 가리기</button>
    </div>`;
  }

  /* ---------- 카드 / 테이블 ---------- */
  function cardHTML(it, toks) {
    const done = !!state.checks[it.id];
    const meta = it.meta
      ? `<dl class="meta">${Object.entries(it.meta).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`
      : '';
    const body = it.body ? `<div class="card__body">${it.body}</div>` : '';
    const detail = meta + body;
    const badges = [
      it.missable ? '<span class="badge badge--red">놓치면 끝</span>' : '',
      it.spoiler ? '<span class="badge badge--yellow">스포일러</span>' : '',
    ].join('');
    const check = it.check
      ? `<label class="check" title="완료 체크">
          <input type="checkbox" data-check="${esc(it.id)}" ${done ? 'checked' : ''} aria-label="${esc(it.title)} 완료">
          <span class="check__box">${CHECK_SVG}</span>
        </label>`
      : '';
    const tags = (it.tags || []).length
      ? `<div class="card__tags">${it.tags.map(t => `<button type="button" class="tag" data-tagsearch="${esc(t)}">#${highlight(t, toks)}</button>`).join('')}</div>`
      : '';
    return `<article class="card ${it.missable ? 'is-missable' : ''} ${done ? 'is-done' : ''}" data-card="${esc(it.id)}">
      <div class="card__top">
        <div class="card__heading">
          <h3 class="card__title">${highlight(it.title, toks)}</h3>
          ${it.sub ? `<p class="card__sub">${highlight(it.sub, toks)}</p>` : ''}
        </div>
        ${check}
      </div>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      ${detail ? (it.spoiler ? spoilerWrap(it.id, detail) : detail) : ''}
      ${tags}
    </article>`;
  }

  function tableHTML(sec, rows) {
    const table = `<table class="data">
      <thead><tr>${sec.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((cell, i) => `<td data-label="${esc(sec.columns[i])}">${cell}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
    return `<div class="table-wrap">${sec.spoiler ? spoilerWrap('sec-' + sec.id, table) : table}</div>`;
  }

  function renderContent() {
    const tab = GUIDE.tabs.find(t => t.id === state.tab);
    const toks = tokens(state.query);
    let shown = 0;

    const html = tab.sections.map(sec => {
      const items = visibleItems(sec, toks);
      if (!items.length) return '';
      shown += items.length;
      const checkable = sec.type === 'cards' ? sec.items.filter(it => it.check) : [];
      const d = checkable.filter(it => state.checks[it.id]).length;
      const progress = checkable.length
        ? `<div class="section__progress" data-sec-progress="${sec.id}"><div class="bar"><div class="bar__fill" style="width:${pct(d, checkable.length)}%"></div></div><span>${d} / ${checkable.length}</span></div>`
        : '';
      const inner = sec.type === 'table'
        ? tableHTML(sec, items)
        : `<div class="grid">${items.map(it => cardHTML(it, toks)).join('')}</div>`;
      return `<section class="section" id="sec-${sec.id}" aria-labelledby="h-${sec.id}">
        <div class="section__head">
          <h2 class="section__title" id="h-${sec.id}">${esc(sec.title)}</h2>
          ${sec.desc ? `<p class="section__desc">${esc(sec.desc)}</p>` : ''}
          ${progress}
        </div>
        ${inner}
      </section>`;
    }).join('');

    $('#tabContent').innerHTML = html;
    $('#tabContent').setAttribute('aria-labelledby', 'side-' + tab.id);

    const empty = $('#emptyState');
    if (shown) { empty.hidden = true; return; }
    const others = GUIDE.tabs
      .filter(t => t.id !== tab.id)
      .map(t => ({ t, n: countTabMatches(t, toks) }))
      .filter(x => x.n);
    empty.innerHTML = `조건에 맞는 항목이 <b>${esc(tab.label)}</b> 탭에 없습니다.` +
      (others.length
        ? `<br>다른 탭 결과: ${others.map(x => `<button type="button" class="tag" data-tab="${x.t.id}">${esc(x.t.label)} (${x.n})</button>`).join(' ')}`
        : (state.query ? '<br>다른 검색어를 입력해 보세요.' : ''));
    empty.hidden = false;
  }

  function render() {
    renderNav();
    renderContent();
    renderProgress();
  }

  /* ---------- 이벤트 ---------- */
  function setTab(id, focus) {
    if (!GUIDE.tabs.some(t => t.id === id)) return;
    state.tab = id;
    persist();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    render();
    window.scrollTo({ top: 0 });
    if (focus) document.querySelector(`.navbtn[data-tab="${id}"]`)?.focus();
  }

  function onNavClick(e) {
    const btn = e.target.closest('[data-tab]');
    if (btn) setTab(btn.dataset.tab);
  }
  $('#sideNav').addEventListener('click', onNavClick);
  $('#bottomNav').addEventListener('click', onNavClick);
  $('#emptyState').addEventListener('click', onNavClick);

  // 사이드 탭 키보드 이동 (위/아래 화살표)
  $('#sideNav').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = GUIDE.tabs.findIndex(t => t.id === state.tab);
    const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + GUIDE.tabs.length) % GUIDE.tabs.length;
    setTab(GUIDE.tabs[next].id, true);
  });

  // 검색
  const searchInput = $('#searchInput');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = searchInput.value;
      // 현재 탭에 결과가 없고 다른 탭에 있으면 자동 이동
      const toks = tokens(state.query);
      const cur = GUIDE.tabs.find(t => t.id === state.tab);
      if (toks.length && !countTabMatches(cur, toks)) {
        const hit = GUIDE.tabs.find(t => countTabMatches(t, toks));
        if (hit) state.tab = hit.id;
      }
      render();
    }, 120);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape' && document.activeElement === searchInput && searchInput.value) {
      searchInput.value = '';
      state.query = '';
      render();
    }
  });

  // 빠른 필터
  document.querySelector('.filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn || !FILTERS.includes(btn.dataset.filter)) return;
    state.filter = btn.dataset.filter;
    document.querySelectorAll('.filters .chip').forEach(c => {
      const on = c === btn;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on);
    });
    render();
  });
  document.querySelectorAll('.filters .chip').forEach(c => c.setAttribute('aria-pressed', c.classList.contains('is-active')));

  // 스포일러 전체 토글
  const spoilerAll = $('#spoilerAll');
  spoilerAll.checked = state.spoilerAll;
  spoilerAll.addEventListener('change', () => {
    state.spoilerAll = spoilerAll.checked;
    if (!state.spoilerAll) state.revealed.clear();
    persist();
    renderContent();
    renderProgress();
  });

  // 카드 내부: 체크박스 / 스포일러 / 태그
  const content = $('#tabContent');
  content.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-check]');
    if (!cb) return;
    const id = cb.dataset.check;
    if (cb.checked) state.checks[id] = Date.now();
    else delete state.checks[id];
    persist();
    if (state.filter === 'todo' || state.filter === 'done') {
      // 필터 결과에서 빠지는 카드는 짧게 보여준 뒤 다시 그림
      setTimeout(render, 250);
    } else {
      cb.closest('.card')?.classList.toggle('is-done', cb.checked);
      renderProgress();
    }
  });

  content.addEventListener('click', (e) => {
    const reveal = e.target.closest('[data-reveal]');
    const conceal = e.target.closest('[data-conceal]');
    const tag = e.target.closest('[data-tagsearch]');
    if (reveal || conceal) {
      const id = (reveal || conceal).dataset.reveal || (reveal || conceal).dataset.conceal;
      const box = content.querySelector(`[data-spoiler="${CSS.escape(id)}"]`);
      if (reveal) state.revealed.add(id); else state.revealed.delete(id);
      if (box) {
        box.classList.toggle('is-hidden', !!conceal);
        const c = box.querySelector('.spoiler__content');
        if (conceal) c.setAttribute('aria-hidden', 'true'); else c.removeAttribute('aria-hidden');
        (reveal ? box.querySelector('.spoiler__hide') : box.querySelector('.spoiler__btn'))?.focus();
      }
    } else if (tag) {
      searchInput.value = tag.dataset.tagsearch;
      state.query = tag.dataset.tagsearch;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // 체크 초기화
  $('#resetBtn').addEventListener('click', () => {
    if (!Object.keys(state.checks).length) return;
    if (!confirm('모든 체크 기록을 초기화할까요? 되돌릴 수 없습니다.')) return;
    state.checks = {};
    persist();
    render();
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id !== state.tab) setTab(id);
  });

  /* ---------- 시작 ---------- */
  $('#guideVersion').textContent = GUIDE.version;
  if (location.hash.slice(1) !== state.tab) history.replaceState(null, '', '#' + state.tab);
  render();
})();
