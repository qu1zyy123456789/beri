const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const API_URL = 'https://polyester-inflation-unlike-limits.trycloudflare.com'; // потом заменим на публичный адрес
const BOT_USERNAME = 'beri_bot';          // замените на логин вашего бота
const PLAN_NAMES = { free: 'Free', pro: 'Pro', max: 'Max' };

// ---------- Запросы к серверу ----------
async function api(path, method = 'GET', body) {
  const res = await fetch(API_URL + path, {
    method: method,
    headers: { 'Content-Type': 'application/json', 'X-Init-Data': tg.initData || 'dev' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || 'Ошибка сервера');
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// ---------- Состояние ----------
let items = [];
let me = { user: { first_name: 'Гость', id: 0 }, plan: 'free', opens_left: 3, favs: [], orders: [] };
let category = 'Все';
let query = '';

async function refresh() {
  try {
    me = await api('/api/me');
    items = await api('/api/items');
  } catch (e) {
    alert('Нет связи с сервером: ' + e.message);
  }
  renderAll();
}

// ---------- Расчёты ----------
function discountOf(i) { return Math.round((1 - i.price / i.median) * 100); }
function profitOf(i) { return Math.round(i.median * 0.9 - i.price - 1000 - i.median * 0.03); }
function money(n) { return n.toLocaleString('ru-RU') + ' ₽'; }
function opensLeft() { return me.opens_left === null ? Infinity : me.opens_left; }

// ---------- Карточка ----------
function cardHTML(i) {
  const fav = me.favs.includes(i.id);
  return `
    <div class="card">
      <button class="star" data-action="fav" data-id="${i.id}">${fav ? '★' : '☆'}</button>
      <div class="title">${i.title}</div>
      <div class="row">
        <span class="price">${money(i.price)}</span>
        <span class="badge">−${discountOf(i)}%</span>
      </div>
      <div class="meta">Рынок: ${money(i.median)} · найдено ${i.minutesAgo} мин назад</div>
      <div class="meta">Ожидаемый навар: ~${money(profitOf(i))}</div>
      <button class="btn" data-action="open" data-id="${i.id}">Открыть объявление</button>
    </div>`;
}

// ---------- Лента ----------
function renderFeed() {
  const cats = ['Все', ...new Set(items.map(i => i.cat))];
  document.getElementById('chips').innerHTML = cats.map(c =>
    `<button class="chip ${c === category ? 'active' : ''}" data-action="cat" data-cat="${c}">${c}</button>`
  ).join('');

  const left = opensLeft();
  document.getElementById('limitInfo').textContent =
    left === Infinity ? 'Тариф Max: открытия без лимита' : `Открытий сегодня осталось: ${left}`;

  const shown = items.filter(i =>
    (category === 'Все' || i.cat === category) &&
    i.title.toLowerCase().includes(query.toLowerCase())
  ).sort((a, b) => discountOf(b) - discountOf(a));

  document.getElementById('list').innerHTML =
    shown.length ? shown.map(cardHTML).join('') : '<div class="empty">Ничего не найдено</div>';
}

// ---------- Избранное ----------
function renderFav() {
  const shown = items.filter(i => me.favs.includes(i.id));
  document.getElementById('favList').innerHTML =
    shown.length ? shown.map(cardHTML).join('') : '<div class="empty">Нажмите ☆ на карточке, чтобы сохранить лот</div>';
}

// ---------- Ордера ----------
function matches(order) {
  const words = order.query.toLowerCase().split(' ').filter(Boolean);
  return items.filter(i =>
    words.every(w => i.title.toLowerCase().includes(w)) &&
    (!order.maxPrice || i.price <= order.maxPrice) &&
    discountOf(i) >= order.minDisc
  );
}

function renderOrders() {
  const box = document.getElementById('orders');
  if (!me.orders.length) { box.innerHTML = '<div class="empty">Ордеров пока нет</div>'; return; }
  box.innerHTML = me.orders.map(o => {
    const found = matches(o);
    return `
      <div class="order">
        <div class="top"><b>${o.query}</b><span>${o.active ? '🟢 Активен' : '⚪ Пауза'}</span></div>
        <div class="meta">${o.maxPrice ? 'до ' + money(o.maxPrice) + ' · ' : ''}скидка от ${o.minDisc}%</div>
        <div class="meta">Подходит лотов сейчас: ${found.length}</div>
        ${found.map(f => `<div class="meta">• ${f.title} — ${money(f.price)} (−${discountOf(f)}%)</div>`).join('')}
        <div class="actions">
          <button class="btn small ghost" data-action="toggleOrder" data-id="${o.id}">${o.active ? 'Пауза' : 'Включить'}</button>
          <button class="btn small red" data-action="delOrder" data-id="${o.id}">Удалить</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('orderForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  try {
    await api('/api/orders', 'POST', {
      query: document.getElementById('oQuery').value.trim(),
      max_price: Number(document.getElementById('oPrice').value) || 0,
      min_disc: Number(document.getElementById('oDisc').value) || 0
    });
    this.reset();
    document.getElementById('oDisc').value = 20;
    await refresh();
  } catch (err) {
    alert(err.message);
    if (err.status === 403) document.querySelector('[data-target="profile"]').click();
  }
});

// ---------- Профиль ----------
function renderProfile() {
  const user = me.user;
  const left = opensLeft();
  document.getElementById('profileBox').innerHTML = `
    <div class="stat"><span>Имя</span><b>${user.first_name}</b></div>
    <div class="stat"><span>Тариф</span><b>${PLAN_NAMES[me.plan]}</b></div>
    <div class="stat"><span>Открытий осталось сегодня</span><b>${left === Infinity ? '∞' : left}</b></div>
    <div class="stat"><span>Ордеров</span><b>${me.orders.length}</b></div>
    <div class="stat"><span>В избранном</span><b>${me.favs.length}</b></div>
    <p class="hint">Реферальная ссылка (за друга +1 день Max):</p>
    <input class="field" readonly value="https://t.me/${BOT_USERNAME}?start=ref_${user.id}">
    <button class="btn" data-action="buy" data-plan="pro">Pro — 20 открытий в день</button>
    <button class="btn gold" data-action="buy" data-plan="max">Max — без лимита</button>
    <button class="btn ghost" data-action="buy" data-plan="free">Вернуть Free (для теста)</button>`;
}

function renderAll() { renderFeed(); renderFav(); renderOrders(); renderProfile(); }

// ---------- Обработка всех нажатий ----------
document.addEventListener('click', async function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = Number(el.dataset.id);

  try {
    if (action === 'cat') { category = el.dataset.cat; renderAll(); return; }
    if (action === 'close') { document.getElementById('modal').classList.add('hidden'); return; }

    if (action === 'fav') { await api('/api/fav/' + id, 'POST'); }

    if (action === 'open') {
      try {
        const r = await api('/api/open/' + id, 'POST');
        tg.openLink ? tg.openLink(r.url) : window.open(r.url);
      } catch (err) {
        if (err.status === 429) {
          document.getElementById('modal').classList.remove('hidden');
        } else { throw err; }
      }
    }

    if (action === 'toggleOrder') { await api('/api/orders/' + id + '/toggle', 'POST'); }
    if (action === 'delOrder') { await api('/api/orders/' + id, 'DELETE'); }

    if (action === 'buy') {
      // Демо: тариф включается сразу. Реальная оплата будет позже (Telegram Stars)
      await api('/api/plan', 'POST', { plan: el.dataset.plan });
      document.getElementById('modal').classList.add('hidden');
    }

    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('search').addEventListener('input', function () {
  query = this.value;
  renderFeed();
});

// ---------- Переключение вкладок ----------
const tabs = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');
tabs.forEach(function (tab) {
  tab.addEventListener('click', function () {
    tabs.forEach(t => t.classList.remove('active'));
    screens.forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
    renderAll();
  });
});

renderAll();
refresh();