/* =========================================================
   Система заметок — чистый JS без библиотек.
   ========================================================= */

/* ---------- Помощники ---------- */

function $(selector) {
  return document.querySelector(selector);
}

function loadData(key, fallback) {
  var raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDate(timestamp) {
  var d = new Date(timestamp);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function makeId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function colorIndex(id) {
  var sum = 0;
  for (var i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum % 5;
}

/* ---------- Глобальное состояние ---------- */

var currentUser = null;
var notes = [];
var view = 'notes';
var authMode = 'login';
var searchQuery = '';
var sortMode = 'updated-desc';

/* =========================================================
   АВТОРИЗАЦИЯ
   ========================================================= */

function onAuthSubmit(event) {
  event.preventDefault();

  var login = $('#auth-login').value.trim();
  var pass = $('#auth-pass').value.trim();
  var users = loadData('users', []);

  if (authMode === 'register') {
    var exists = users.some(function (u) { return u.login === login; });
    if (exists) {
      $('#auth-error').textContent = 'Такой логин уже занят';
      return;
    }
    users.push({ login: login, pass: pass });
    saveData('users', users);
  } else {
    var found = users.some(function (u) { return u.login === login && u.pass === pass; });
    if (!found) {
      $('#auth-error').textContent = 'Неверный логин или пароль';
      return;
    }
  }

  currentUser = login;
  saveData('session', login);
  enterApp();
}

function toggleAuthMode() {
  if (authMode === 'login') {
    authMode = 'register';
    $('#auth-btn').textContent = 'Зарегистрироваться';
    $('#auth-toggle').textContent = 'Уже есть аккаунт? Войти';
    $('#auth-hint').textContent = 'Придумайте логин и пароль';
  } else {
    authMode = 'login';
    $('#auth-btn').textContent = 'Войти';
    $('#auth-toggle').textContent = 'Создать аккаунт';
    $('#auth-hint').textContent = 'Войдите, чтобы продолжить';
  }
  $('#auth-error').textContent = '';
}

function enterApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-name').textContent = '👤 ' + currentUser;
  notes = loadData('notes_' + currentUser, []);
  render();
}

function logout() {
  localStorage.removeItem('session');
  location.reload();
}

/* =========================================================
   РЕНДЕР
   ========================================================= */

function render() {
  var navButtons = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < navButtons.length; i++) {
    navButtons[i].classList.toggle('active', navButtons[i].dataset.view === view);
  }

  $('#view-title').textContent = (view === 'notes') ? 'Заметки' : 'Черновики';
  $('#new-note-btn').classList.toggle('hidden', view !== 'notes');

  var list = notes.filter(function (n) {
    return view === 'trash' ? n.deleted : !n.deleted;
  });

  if (view === 'notes' && searchQuery !== '') {
    var q = searchQuery.toLowerCase();
    list = list.filter(function (n) {
      return n.title.toLowerCase().indexOf(q) !== -1 ||
             n.text.toLowerCase().indexOf(q) !== -1;
    });
  }

  // --- Сортировка ---
list.sort(function (a, b) {
  switch (sortMode) {
    case 'updated-desc': return b.updatedAt - a.updatedAt;
    case 'updated-asc':  return a.updatedAt - b.updatedAt;
    case 'created-desc': return b.createdAt - a.createdAt;
    case 'created-asc':  return a.createdAt - b.createdAt;

    case 'title-asc': {
      var ta = (a.title || '').toLowerCase();
      var tb = (b.title || '').toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    case 'title-desc': {
      var ta2 = (a.title || '').toLowerCase();
      var tb2 = (b.title || '').toLowerCase();
      if (ta2 > tb2) return -1;
      if (ta2 < tb2) return 1;
      return 0;
    }
    default: return 0;
  }
});

  if (list.length === 0) {
    $('#empty-msg').textContent = (view === 'notes')
      ? (searchQuery ? 'Ничего не найдено' : 'Заметок нет. Создайте первую!')
      : 'Корзина пуста';
  } else {
    $('#empty-msg').textContent = '';
  }

  var grid = $('#notes-grid');
  grid.innerHTML = '';
  for (var j = 0; j < list.length; j++) {
    grid.appendChild(makeCard(list[j]));
  }
}

function makeCard(note) {
  var card = document.createElement('div');
  card.className = 'note-card color' + colorIndex(note.id);
  card.innerHTML =
    '<h3>' + (escapeHtml(note.title) || 'Без названия') + '</h3>' +
    '<p>' + (escapeHtml(note.text) || '<i>Пусто</i>') + '</p>' +
    '<div class="note-dates">' +
      'Создана: ' + formatDate(note.createdAt) + '<br>' +
      'Изменена: ' + formatDate(note.updatedAt) +
    '</div>';

  card.addEventListener('click', function () { openEditor(note.id); });

  // Drag & drop работает и в «Заметках», и в «Черновиках»
  setupDragAndDrop(card, note.id);

  return card;
}

/* =========================================================
   DRAG & DROP
   ========================================================= */

var draggedId = null;

function setupDragAndDrop(card, noteId) {
  card.draggable = true;

  card.addEventListener('dragstart', function (e) {
    draggedId = noteId;
    card.classList.add('dragging');
    // Чтобы Firefox начал drag
    e.dataTransfer.setData('text/plain', noteId);
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', function () {
    draggedId = null;
    card.classList.remove('dragging');

    var all = document.querySelectorAll('.note-card');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('drag-over');

    // Убираем подсветку с пунктов сайдбара
    var navs = document.querySelectorAll('.nav-btn');
    for (var j = 0; j < navs.length; j++) navs[j].classList.remove('drop-target');
  });

  card.addEventListener('dragover', function (event) {
    if (draggedId === null || draggedId === noteId) return;
    event.preventDefault();
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', function () {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', function (event) {
    event.preventDefault();
    card.classList.remove('drag-over');
    if (draggedId === null || draggedId === noteId) return;
    moveNote(draggedId, noteId);
  });
}

// Перестановка местами внутри одного раздела
function moveNote(fromId, toId) {
  var fromIndex = -1;
  var toIndex = -1;

  for (var i = 0; i < notes.length; i++){
    if (notes[i].id === fromId) fromIndex = i;
    if (notes[i].id === toId) toIndex = i;
  }

  if (fromIndex === -1 || toIndex === -1) return;

  var moved = notes.splice(fromIndex, 1)[0];
  notes.splice(toIndex, 0, moved);

  saveNotes();
  render();
}

/* =========================================================
   РЕДАКТОР
   ========================================================= */

var editingId = null;

function openEditor(noteId) {
  editingId = noteId;
  var note = null;
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].id === noteId) note = notes[i];
  }

  var isTrash = (view === 'trash');

  $('#note-title').value = note ? note.title : '';
  $('#note-text').value = note ? note.text : '';
  $('#editor-meta').textContent = note
    ? 'Создана: ' + formatDate(note.createdAt) + ' · Изменена: ' + formatDate(note.updatedAt)
    : 'Новая заметка';

  $('#note-title').disabled = isTrash;
  $('#note-text').disabled = isTrash;
  $('#editor-save').classList.toggle('hidden', isTrash);
  $('#editor-restore').classList.toggle('hidden', !isTrash);
  $('#editor-restore').textContent = '♻ Восстановить';

  var delBtn = $('#editor-delete');
  if (isTrash) {
    delBtn.textContent = 'Удалить навсегда';
    delBtn.onclick = function () { deleteForever(noteId); };
  } else {
    delBtn.textContent = 'В корзину';
    delBtn.onclick = function () { moveToTrash(noteId); };
  }

  $('#editor-overlay').classList.remove('hidden');
}

function closeEditor() {
  $('#editor-overlay').classList.add('hidden');
  editingId = null;
}

function saveEditor() {
  var title = $('#note-title').value.trim();
  var text = $('#note-text').value.trim();

  if (editingId) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === editingId) {
        notes[i].title = title;
        notes[i].text = text;
        notes[i].updatedAt = Date.now();
      }
    }
  } else {
    notes.unshift({
      id: makeId(),
      title: title,
      text: text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false
    });
  }

  saveNotes();
  render();
  closeEditor();
}

/* =========================================================
   КОРЗИНА
   ========================================================= */

function moveToTrash(noteId) {
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].id === noteId) notes[i].deleted = true;
  }
  saveNotes();
  render();
  closeEditor();
}

function restoreNote(noteId) {
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].id === noteId) notes[i].deleted = false;
  }
  saveNotes();
  render();
  closeEditor();
}

function deleteForever(noteId) {
  if (!confirm('Удалить заметку безвозвратно?')) return;
  notes = notes.filter(function (n) { return n.id !== noteId; });
  saveNotes();
  render();
  closeEditor();
}

function saveNotes() {
  saveData('notes_' + currentUser, notes);
}

/* =========================================================
   ПРИВЯЗКА СОБЫТИЙ
   ========================================================= */



// Переключение разделов
var navButtons = document.querySelectorAll('.nav-btn');
for (var i = 0; i < navButtons.length; i++) {
  navButtons[i].addEventListener('click', function () {
    view = this.dataset.view;
    render();
  });
}

// Drag & drop НА пункты сайдбара
(function bindSidebarDrop() {
  var btns = document.querySelectorAll('.nav-btn');

  for (var k = 0; k < btns.length; k++) {
    (function (btn) {
      var targetView = btn.dataset.view;

      btn.addEventListener('dragover', function (e) {
        if (!draggedId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drop-target');
      });

      btn.addEventListener('dragleave', function () {
        btn.classList.remove('drop-target');
      });

      btn.addEventListener('drop', function (e) {
        e.preventDefault();
        btn.classList.remove('drop-target');

        if (!draggedId) return;

        var note = null;
        for (var i = 0; i < notes.length; i++) {
          if (notes[i].id === draggedId) note = notes[i];
        }
        if (!note) return;

        var shouldBeDeleted = (targetView === 'trash');

        // Уже там, где надо — ничего не делаем
        if (note.deleted === shouldBeDeleted) return;

        note.deleted = shouldBeDeleted;
        note.updatedAt = Date.now();
        saveNotes();
        render();

        draggedId = null;
      });
    })(btns[k]);
  }
})();

$('#auth-form').addEventListener('submit', onAuthSubmit);
$('#auth-toggle').addEventListener('click', toggleAuthMode);
$('#logout-btn').addEventListener('click', logout);
$('#new-note-btn').addEventListener('click', function () { openEditor(null); });
$('#editor-save').addEventListener('click', saveEditor);
$('#editor-cancel').addEventListener('click', closeEditor);
$('#editor-restore').addEventListener('click', function () {
  if (editingId) restoreNote(editingId);
});

$('#search-input').addEventListener('input', function () {
  searchQuery = this.value.trim();
  render();
});

$('#sort-select').addEventListener('change', function () {
  sortMode = this.value;
  render();
});

$('#editor-overlay').addEventListener('click', function (event) {
  if (event.target === this) closeEditor();
});

/* =========================================================
   АНИМИРОВАННЫЙ ФОН — точки + линии к курсору
   ========================================================= */

(function initBackground() {
  var canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var width, height;
  var particles = [];

  var PARTICLE_COUNT  = 110;
  var MAX_DISTANCE    = 200;
  var PARTICLE_SPEED  = 0.4;

  var mouse = { x: null, y: null };

  function resize() {
    width  = canvas.width  = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', function () {
    mouse.x = null;
    mouse.y = null;
  });

  function Particle() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * PARTICLE_SPEED * 2;
    this.vy = (Math.random() - 0.5) * PARTICLE_SPEED * 2;
    this.radius = Math.random() * 1.5 + 1;
  }

  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > width)  this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
  };

  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  };

  for (var i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (var i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    if (mouse.x !== null) {
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAX_DISTANCE) {
          var opacity = 1 - dist / MAX_DISTANCE;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = 'rgba(255, 255, 255, ' + (opacity * 0.9) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
})();

/* =========================================================
   ЗАПУСК
   ========================================================= */

currentUser = loadData('session', null);
if (currentUser) {
  enterApp();
}