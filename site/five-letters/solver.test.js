import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ALL_GREEN,
  createIndex,
  decodePattern,
  encodePattern,
  feedback,
  filterCandidates,
  normalize,
  parseDictionary,
  rankGuesses,
} from "./solver.js";

const p = (s) => encodePattern([...s].map(Number)); // "02100" → число

test("feedback: всё совпало", () => {
  assert.equal(feedback("норка", "норка"), ALL_GREEN);
});

test("feedback: цвета без повторов", () => {
  // загадано «норка», названо «ларек»: л — нет, а — есть не там, р — на месте, е — нет, к — есть не там
  assert.deepEqual(decodePattern(feedback("ларек", "норка")), [0, 1, 2, 0, 1]);
  assert.equal(feedback("ларек", "норка"), p("01201"));
});

test("feedback: повтор в попытке, одна такая буква в слове", () => {
  // загадано «барин», названо «банан»: б, а — на месте; н (3-я) и а (4-я) — серые; н (5-я) — на месте
  assert.deepEqual(decodePattern(feedback("банан", "барин")), [2, 2, 0, 0, 2]);
  // все «н», кроме последней (она на месте и единственная в слове), серые
  assert.deepEqual(decodePattern(feedback("ннннн", "барин")), [0, 0, 0, 0, 2]);
});

test("feedback: две буквы в слове, обе не на месте", () => {
  // загадано «мамка», названо «аббат»: обе «а» жёлтые (в слове их две), остальные серые
  assert.deepEqual(decodePattern(feedback("аббат", "мамка")), [1, 0, 0, 1, 0]);
});

test("normalize: регистр и ё", () => {
  assert.equal(normalize("  ЖЁЛОБ "), "желоб");
});

test("parseDictionary: фильтрует и убирает дубли", () => {
  assert.deepEqual(parseDictionary("норка\nНОРКА\nжёлоб\nкот\nabcde\nслова-\n"), ["норка", "желоб"]);
});

test("filterCandidates: повторы учитываются точно", () => {
  const index = createIndex(["барин", "кабан", "банан", "дача"]);
  // из этих слов подсказке «банан» при ответе «барин» удовлетворяет только «барин»
  const pat = feedback("банан", "барин");
  const idx = filterCandidates(index, [{ word: "банан", pattern: pat }]);
  assert.deepEqual(
    idx.map((i) => index.words[i]),
    ["барин"],
  );
});

test("filterCandidates: без попыток подходят все слова", () => {
  const index = createIndex(["норка", "желоб"]);
  assert.equal(filterCandidates(index, []).length, 2);
});

test("rankGuesses: на встроенном словаре лучший первый ход — норка", async () => {
  const words = parseDictionary(readFileSync(new URL("./words.txt", import.meta.url), "utf8"));
  const index = createIndex(words);
  const all = words.map((_, i) => i);
  const [best] = await rankGuesses(index, all, { top: 1 });
  assert.equal(best.word, "норка");
  assert.ok(Math.abs(best.expected - 101.45) < 0.1, `expected ≈101.45, получили ${best.expected}`);
});

test("rankGuesses: один кандидат — он и ответ", async () => {
  const index = createIndex(["норка", "желоб"]);
  const [r] = await rankGuesses(index, [1]);
  assert.equal(r.word, "желоб");
});

test("rankGuesses: отмена", async () => {
  const words = parseDictionary(readFileSync(new URL("./words.txt", import.meta.url), "utf8"));
  const index = createIndex(words);
  const out = await rankGuesses(index, words.map((_, i) => i), { shouldCancel: () => true });
  assert.equal(out, null);
});
