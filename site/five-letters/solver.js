// Логика подбора слов. Без DOM, работает и в браузере, и в Node (для тестов).
//
// Цвета подсказок: 0 — серый (буквы нет или лишний повтор), 1 — жёлтый (буква есть, но не здесь),
// 2 — зелёный (буква на месте). Подсказка кодируется числом в троичной системе, первая буква — старшая.

export const WORD_LEN = 5;
export const PATTERNS = 3 ** WORD_LEN; // 243
export const ALL_GREEN = PATTERNS - 1;

const A_CODE = "а".charCodeAt(0);
const ALPHABET = 32; // а..я

/** Приводит слово к нижнему регистру, «ё» считает за «е» — как это делает игра. */
export function normalize(s) {
  return s.trim().toLowerCase().replaceAll("ё", "е");
}

export function isWord(s) {
  return /^[а-я]{5}$/.test(s);
}

/** Из текста (одно слово в строке) оставляет уникальные слова из 5 русских букв в исходном порядке. */
export function parseDictionary(text) {
  const seen = new Set();
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const w = normalize(line);
    if (isWord(w) && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  return words;
}

function encodeWords(words) {
  const codes = new Uint8Array(words.length * WORD_LEN);
  words.forEach((w, i) => {
    for (let k = 0; k < WORD_LEN; k++) codes[i * WORD_LEN + k] = w.charCodeAt(k) - A_CODE;
  });
  return codes;
}

/** Словарь, подготовленный для быстрых вычислений. */
export function createIndex(words) {
  return { words, codes: encodeWords(words) };
}

const res = new Uint8Array(WORD_LEN);

// Подсказка для попытки g при загаданном слове a (индексы в codes) по правилам Wordle с учётом повторов.
// cnt — рабочий массив из нулей; к выходу из функции он снова заполнен нулями.
function patternAt(codes, g, a, cnt) {
  const gb = g * WORD_LEN;
  const ab = a * WORD_LEN;
  for (let i = 0; i < WORD_LEN; i++) {
    if (codes[gb + i] === codes[ab + i]) {
      res[i] = 2;
    } else {
      res[i] = 0;
      cnt[codes[ab + i]]++;
    }
  }
  let p = 0;
  for (let i = 0; i < WORD_LEN; i++) {
    const c = codes[gb + i];
    if (res[i] === 0 && cnt[c] > 0) {
      res[i] = 1;
      cnt[c]--;
    }
    p = p * 3 + res[i];
  }
  for (let i = 0; i < WORD_LEN; i++) cnt[codes[ab + i]] = 0;
  return p;
}

/** Подсказка игры, если загадано `answer`, а названо `guess`. Оба слова нормализованы. */
export function feedback(guess, answer) {
  const codes = encodeWords([guess, answer]);
  return patternAt(codes, 0, 1, new Int8Array(ALPHABET));
}

/** [0,1,2,0,0] → число. */
export function encodePattern(colors) {
  return colors.reduce((p, c) => p * 3 + c, 0);
}

/** Число → [0,1,2,0,0]. */
export function decodePattern(p) {
  const colors = new Array(WORD_LEN);
  for (let i = WORD_LEN - 1; i >= 0; i--) {
    colors[i] = p % 3;
    p = Math.floor(p / 3);
  }
  return colors;
}

/**
 * Индексы слов, согласных со всеми попытками.
 * tries — [{ word, pattern }], pattern — число из encodePattern.
 */
export function filterCandidates(index, tries) {
  const { words, codes } = index;
  const cnt = new Int8Array(ALPHABET);
  const tryCodes = encodeWords(tries.map((t) => t.word));
  const out = [];
  // Попытки кладём в конец общего массива кодов, чтобы использовать один patternAt.
  const all = new Uint8Array(codes.length + tryCodes.length);
  all.set(codes);
  all.set(tryCodes, codes.length);
  outer: for (let a = 0; a < words.length; a++) {
    for (let t = 0; t < tries.length; t++) {
      if (patternAt(all, words.length + t, a, cnt) !== tries[t].pattern) continue outer;
    }
    out.push(a);
  }
  return out;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Лучшие следующие ходы. Для каждого слова словаря считается, на сколько групп оно разбивает кандидатов
 * и сколько кандидатов в среднем останется (сумма квадратов размеров групп / число кандидатов).
 * Чем меньше, тем лучше. При равенстве предпочитаются слова, которые сами могут быть ответом.
 * Возвращает null, если shouldCancel() стал true по ходу вычислений.
 */
export async function rankGuesses(index, candidates, { top = 8, shouldCancel = () => false } = {}) {
  const { words, codes } = index;
  const total = candidates.length;
  if (total === 0) return [];
  if (total === 1) return [{ word: words[candidates[0]], expected: 1, groups: 1, isCandidate: true }];

  const isCandidate = new Uint8Array(words.length);
  for (const a of candidates) isCandidate[a] = 1;

  const cnt = new Int8Array(ALPHABET);
  const buckets = new Int32Array(PATTERNS);
  const scored = [];

  for (let g = 0; g < words.length; g++) {
    buckets.fill(0);
    for (let k = 0; k < total; k++) buckets[patternAt(codes, g, candidates[k], cnt)]++;
    let sum = 0;
    let groups = 0;
    for (let p = 0; p < PATTERNS; p++) {
      const c = buckets[p];
      if (c) {
        sum += c * c;
        groups++;
      }
    }
    scored.push({ word: words[g], expected: sum / total, groups, isCandidate: isCandidate[g] === 1 });

    if (g % 50 === 49) {
      await tick();
      if (shouldCancel()) return null;
    }
  }

  scored.sort((x, y) => x.expected - y.expected || Number(y.isCandidate) - Number(x.isCandidate));
  return scored.slice(0, top);
}
