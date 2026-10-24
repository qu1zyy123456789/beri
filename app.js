const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const BOT_USERNAME = 'beri_bot'; // потом замените на имя своего бота
const LIMITS = { free: 3, pro: 20, max: Infinity };
const PLAN_NAMES = { free: 'Free', pro: 'Pro', max: 'Max' };

// ---------- Данные (потом заменим запросами к серверу) ----------
const items = [
  { id: 1, cat: 'Телефоны', title: 'iPhone 13 Pro, 128 ГБ', price: 17999, median: 27000, minutesAgo: 60 },
  { id: 2, cat: 'Ноутбуки', title: 'MacBook Air M1, 256 ГБ', price: 41000, median: 55000, minutesAgo: 12 },
  { id: 3, cat: 'Консоли', title: 'PlayStation 5, дисковод', price: 32000, median: 42000, minutesAgo: 35 },
  { id: 4, cat: 'Видеокарты', title: 'RTX 3070, 8 ГБ', price: 21000, median: 27500, minutesAgo: 5 },
  { id: 5, cat: 'Телефоны', title: 'iPhone 14, 128 ГБ', price: 39000, median: 48000, minutesAgo: 90 },
  { id: 6, cat: 'Ноутбуки', title: 'ASUS TUF F15, RTX 3050', price: 45000, median: 62000, minutesAgo: 22 }
];

// ---------- Состояние (хранится в телефоне пользователя) ----------
const today = new Date().toDateString();
let state = JSON.parse(localStorage.getItem('beri') || 'null') || {
  plan: 'free', favs: [], orders: [], opens: { date: today, count: 0 }
};
if (state.opens.date !== today) state.opens = { date: today, count: 0 };

function save() { localStorage.setItem('beri', JSON.stringify(state)); }

let category = 'Все';
let query = '';

// ---------- Расчёты ----------
function discountOf(i) { return Math.round((1 - i.price / i.median) * 100); }
function profitOf(i) { return Math.round(i.median * 0.9 - i.price - 1000 - i.median * 0.03); }
function money(n) { return n.toLocaleString('ru-RU') + ' ₽'; }
function opensLeft() {
  const limit = LIMITS[state.plan];
  return limit === Infinity ? Infinity : Math.max(0, limit - state.opens.count);
}

// ---------- Карточка ----------
function cardHTML(i) {
  const fav = state.favs.includes(i.id);
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
  const shown = items.filter(i => state.favs.includes(i.id));
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
  if (!state.orders.length) { box.innerHTML = '<div class="empty">Ордеров пока нет</div>'; return; }
  box.innerHTML = state.orders.map(o => {
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

document.getElementById('orderForm').addEventListener('submit', function (e) {
  e.preventDefault();
  if (state.plan === 'free' && state.orders.length >= 1) {
    alert('На Free доступен 1 ордер. Оформите тариф, чтобы создавать больше.');
    document.querySelector('[data-target="profile"]').click();
    return;
  }
  state.orders.push({
    id: Date.now(),
    query: document.getElementById('oQuery').value.trim(),
    maxPrice: Number(document.getElementById('oPrice').value) || 0,
    minDisc: Number(document.getElementById('oDisc').value) || 0,
    active: true
  });
  save();
  this.reset();
  document.getElementById('oDisc').value = 20;
  renderOrders();
});

// ---------- Профиль ----------
function renderProfile() {
  const user = (tg.initDataUnsafe && tg.initDataUnsafe.user) || { first_name: 'Гость', id: 0 };
  const left = opensLeft();
  document.getElementById('profileBox').innerHTML = `
    <div class="stat"><span>Имя</span><b>${user.first_name}</b></div>
    <div class="stat"><span>Тариф</span><b>${PLAN_NAMES[state.plan]}</b></div>
    <div class="stat"><span>Открытий осталось сегодня</span><b>${left === Infinity ? '∞' : left}</b></div>
    <div class="stat"><span>Ордеров</span><b>${state.orders.length}</b></div>
    <div class="stat"><span>В избранном</span><b>${state.favs.length}</b></div>
    <p class="hint">Реферальная ссылка (за друга +1 день Max):</p>
    <input class="field" readonly value="https://t.me/${BOT_USERNAME}?start=ref_${user.id}">
    <button class="btn" data-action="buy" data-plan="pro">Pro — 20 открытий в день</button>
    <button class="btn gold" data-action="buy" data-plan="max">Max — без лимита</button>
    <button class="btn ghost" data-action="buy" data-plan="free">Вернуть Free (для теста)</button>`;
}

// ---------- Общий перерисовщик ----------
function renderAll() { renderFeed(); renderFav(); renderOrders(); renderProfile(); }

// ---------- Обработка всех нажатий ----------
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = Number(el.dataset.id);

  if (action === 'cat') { category = el.dataset.cat; }

  if (action === 'fav') {
    state.favs = state.favs.includes(id) ? state.favs.filter(x => x !== id) : [...state.favs, id];
  }

  if (action === 'open') {
    if (opensLeft() === 0) {
      document.getElementById('modal').classList.remove('hidden');
      return;
    }
    state.opens.count++;
    // Здесь потом будет реальная ссылка на объявление
    tg.openLink ? tg.openLink('https://www.avito.ru') : window.open('https://www.avito.ru');
  }

  if (action === 'toggleOrder') {
    const o = state.orders.find(x => x.id === id);
    o.active = !o.active;
  }

  if (action === 'delOrder') { state.orders = state.orders.filter(x => x.id !== id); }

  if (action === 'buy') {
    // Демо: тариф включается сразу. Реальная оплата будет позже (Telegram Stars)
    state.plan = el.dataset.plan;
    document.getElementById('modal').classList.add('hidden');
  }

  if (action === 'close') { document.getElementById('modal').classList.add('hidden'); }

  save();
  renderAll();
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