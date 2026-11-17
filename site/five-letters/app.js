import {
  WORD_LEN,
  createIndex,
  encodePattern,
  filterCandidates,
  isWord,
  normalize,
  parseDictionary,
  rankGuesses,
} from "./solver.js";

const MAX_SHOWN = 100; // сколько подходящих слов показывать
const MAX_SUGGESTIONS = 8;
const COLOR_NAMES = ["серая", "жёлтая", "зелёная"];

const el = {
  form: document.getElementById("guess-form"),
  input: document.getElementById("guess-input"),
  error: document.getElementById("form-error"),
  rows: document.getElementById("rows"),
  suggestions: document.getElementById("suggestions"),
  count: document.getElementById("count"),
  candidates: document.getElementById("candidates"),
  dictStatus: document.getElementById("dict-status"),
  dictFile: document.getElementById("dict-file"),
  dictRestore: document.getElementById("dict-restore"),
};

let index = null; // словарь
let rows = []; // [{ word, colors: [0|1|2 × 5] }]
let runId = 0; // номер последнего расчёта подсказок: старые расчёты отбрасываются

// ---- Состояние в адресе: #норка.01200,силон.00000 ----

function saveHash() {
  const hash = rows.map((r) => `${r.word}.${r.colors.join("")}`).join(",");
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}

function loadHash() {
  const text = decodeURIComponent(location.hash.slice(1));
  const parsed = [];
  for (const part of text.split(",")) {
    const [word, digits] = part.split(".");
    if (word && isWord(normalize(word)) && /^[012]{5}$/.test(digits ?? "")) {
      parsed.push({ word: normalize(word), colors: [...digits].map(Number) });
    }
  }
  return parsed;
}

// ---- Отрисовка ----

function renderRows() {
  el.rows.replaceChildren(
    ...rows.map((row, r) => {
      const div = document.createElement("div");
      div.className = "row";
      row.colors.forEach((state, i) => {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tile";
        tile.dataset.state = state;
        tile.textContent = row.word[i];
        tile.setAttribute("aria-label", `${row.word[i]}, ${COLOR_NAMES[state]}. Нажми, чтобы сменить цвет`);
        tile.addEventListener("click", () => {
          row.colors[i] = (row.colors[i] + 1) % 3;
          update();
        });
        div.append(tile);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Убрать попытку ${row.word}`);
      remove.addEventListener("click", () => {
        rows.splice(r, 1);
        update();
      });
      div.append(remove);
      return div;
    }),
  );
}

function wordButton(word) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "word";
  b.textContent = word;
  b.title = "Добавить в попытки";
  b.addEventListener("click", () => addRow(word));
  return b;
}

function formatExpected(x) {
  return x < 10 ? x.toFixed(2) : String(Math.round(x));
}

// Строка списка: слово и (если посчитано) сколько слов в среднем останется.
function listItem(word, expected, mark) {
  const li = document.createElement("li");
  li.append(wordButton(word));
  if (expected != null) {
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = (mark ? "✓ " : "") + formatExpected(expected);
    li.append(meta);
  }
  return li;
}

function note(text) {
  const li = document.createElement("li");
  li.className = "meta";
  li.textContent = text;
  return li;
}

// items — [{ word, expected? }], уже отсортированные.
function renderCandidates(items) {
  el.count.textContent = items.length;
  const nodes = items.slice(0, MAX_SHOWN).map((c) => listItem(c.word, c.expected));
  if (items.length > MAX_SHOWN) nodes.push(note(`…и ещё ${items.length - MAX_SHOWN}`));
  if (items.length === 0 && rows.length > 0) nodes.push(note("Ничего не подходит. Проверь цвета."));
  el.candidates.replaceChildren(...nodes);
}

function renderSuggestions(list) {
  el.suggestions.replaceChildren(...list.map((s) => listItem(s.word, s.expected, s.isCandidate)));
}

// Считает силу каждого слова и обновляет оба списка. Устаревшие расчёты отбрасываются.
async function updateRanking(candidates) {
  const my = ++runId;
  if (candidates.length === 0) {
    el.suggestions.replaceChildren();
    return;
  }
  el.suggestions.replaceChildren(note("Считаю…"));
  const ranked = await rankGuesses(index, candidates, { shouldCancel: () => my !== runId });
  if (!ranked || my !== runId) return;
  renderSuggestions(ranked.slice(0, MAX_SUGGESTIONS));
  renderCandidates(ranked.filter((r) => r.isCandidate));
}

function update() {
  saveHash();
  renderRows();
  const tries = rows.map((r) => ({ word: r.word, pattern: encodePattern(r.colors) }));
  const candidates = filterCandidates(index, tries);
  // Пока идёт расчёт, показываем кандидатов в порядке словаря.
  renderCandidates(candidates.map((i) => ({ word: index.words[i] })));
  updateRanking(candidates);
}

function addRow(word) {
  rows.push({ word, colors: Array(WORD_LEN).fill(0) });
  update();
}

// ---- Ввод ----

function showError(msg) {
  el.error.hidden = !msg;
  el.error.textContent = msg ?? "";
}

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!index) return;
  const word = normalize(el.input.value);
  if (!isWord(word)) {
    showError(`Нужно слово из ${WORD_LEN} русских букв.`);
    return;
  }
  showError(null);
  el.input.value = "";
  addRow(word);
});

el.input.addEventListener("input", () => showError(null));

// ---- Словарь ----

let builtin = null; // слова из words.txt, чтобы можно было вернуться к ним после своего словаря

function setDictionary(words, source) {
  index = createIndex(words);
  el.dictStatus.textContent = `Словарь: ${words.length} слов, ${source}`;
  el.dictRestore.hidden = words === builtin;
  update();
}

el.dictRestore.addEventListener("click", () => {
  el.dictFile.value = "";
  setDictionary(builtin, "words.txt");
});

el.dictFile.addEventListener("change", async () => {
  const file = el.dictFile.files[0];
  if (!file) return;
  const words = parseDictionary(await file.text());
  if (words.length === 0) {
    el.dictStatus.textContent = "В файле нет слов из 5 русских букв, оставил прежний словарь.";
    return;
  }
  setDictionary(words, file.name);
});

async function init() {
  rows = loadHash();
  try {
    const response = await fetch("words.txt");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    builtin = parseDictionary(await response.text());
    setDictionary(builtin, "words.txt");
  } catch (err) {
    el.dictStatus.textContent = `Не удалось загрузить словарь (${err.message}). Выбери файл ниже.`;
  }
}

init();
