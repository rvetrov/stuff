package main

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

const wordLen = 5

// Constraints is what is known about the hidden word after previous tries.
type Constraints struct {
	green   [wordLen]rune          // letter at a known position, 0 if unknown
	present []rune                 // letters in the word whose position is unknown
	absent  map[rune]bool          // letters not in the word at all
	notAt   [wordLen]map[rune]bool // letters that can't be at the position
}

// normalize lowercases s and treats ё as е, as the game does.
func normalize(s string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(s)), "ё", "е")
}

func isLetter(r rune) bool {
	return r >= 'а' && r <= 'я'
}

// parseWord returns the letters of s if it is a word of wordLen Cyrillic letters.
func parseWord(s string) ([]rune, bool) {
	rs := []rune(normalize(s))
	if len(rs) != wordLen {
		return nil, false
	}
	for _, r := range rs {
		if !isLetter(r) {
			return nil, false
		}
	}
	return rs, true
}

// LoadWords reads one word per line and keeps unique words of wordLen Cyrillic letters in input order.
func LoadWords(r io.Reader) ([]string, error) {
	var words []string
	seen := make(map[string]bool)
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		rs, ok := parseWord(sc.Text())
		if !ok {
			continue
		}
		w := string(rs)
		if !seen[w] {
			seen[w] = true
			words = append(words, w)
		}
	}
	return words, sc.Err()
}

// ParseConstraints builds constraints from the mask of known positions ('.', '_' or '*' for unknown),
// letters known to be in the word but misplaced, and previous tries.
// Letters of the tries that are neither in the mask nor misplaced are absent from the word.
// A letter of a try that isn't green at its position can't be at that position.
func ParseConstraints(mask, wrong string, tries []string) (Constraints, error) {
	c := Constraints{absent: make(map[rune]bool)}
	for i := range c.notAt {
		c.notAt[i] = make(map[rune]bool)
	}

	known := make(map[rune]bool)

	m := []rune(normalize(mask))
	if len(m) != wordLen {
		return c, fmt.Errorf("маска %q: нужно %d символов, а не %d", mask, wordLen, len(m))
	}
	for i, r := range m {
		switch {
		case r == '.' || r == '_' || r == '*':
		case isLetter(r):
			c.green[i] = r
			known[r] = true
		default:
			return c, fmt.Errorf("маска %q: недопустимый символ %q", mask, r)
		}
	}

	for _, r := range normalize(wrong) {
		if !isLetter(r) {
			return c, fmt.Errorf("буквы не на месте %q: недопустимый символ %q", wrong, r)
		}
		if !known[r] {
			c.present = append(c.present, r)
		}
		known[r] = true
	}

	for _, t := range tries {
		rs, ok := parseWord(t)
		if !ok {
			return c, fmt.Errorf("попытка %q: нужно слово из %d русских букв", t, wordLen)
		}
		for i, r := range rs {
			if c.green[i] != r {
				c.notAt[i][r] = true
			}
			if !known[r] {
				c.absent[r] = true
			}
		}
	}

	return c, nil
}

// Match reports whether word satisfies the constraints. The word must be normalized.
func (c Constraints) Match(word string) bool {
	rs := []rune(word)
	if len(rs) != wordLen {
		return false
	}
	for i, r := range rs {
		if c.green[i] != 0 && c.green[i] != r {
			return false
		}
		if c.absent[r] || c.notAt[i][r] {
			return false
		}
	}
	for _, p := range c.present {
		if !strings.ContainsRune(word, p) {
			return false
		}
	}
	return true
}

// Filter returns the words that satisfy the constraints, keeping their order.
func Filter(words []string, c Constraints) []string {
	var out []string
	for _, w := range words {
		if c.Match(w) {
			out = append(out, w)
		}
	}
	return out
}
