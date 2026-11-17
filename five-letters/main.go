// Command five-letters lists dictionary words that fit what is known in the game "5 букв" (Russian Wordle).
package main

import (
	_ "embed"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

// Five-letter nouns from russian_nouns.txt, normalized; see README.md for how it is generated.
//
//go:embed words.txt
var embeddedWords string

func main() {
	mask := flag.String("mask", ".....", "known letters at known positions, '.' for unknown")
	wrong := flag.String("wrong", "", "letters in the word but at wrong positions")
	tries := flag.String("tries", "", "previous tries, comma-separated")
	n := flag.Int("n", 20, "how many words to print")
	dict := flag.String("dict", "", "dictionary file, one word per line (default: built-in nouns)")
	flag.Parse()

	if err := run(os.Stdout, *mask, *wrong, *tries, *n, *dict); err != nil {
		fmt.Fprintln(os.Stderr, "ошибка:", err)
		os.Exit(2)
	}
}

func run(w io.Writer, mask, wrong, tries string, n int, dict string) error {
	c, err := ParseConstraints(mask, wrong, splitTries(tries))
	if err != nil {
		return err
	}

	words, err := loadDict(dict)
	if err != nil {
		return err
	}

	matched := Filter(words, c)
	fmt.Fprintf(w, "Подходящих слов: %d\n", len(matched))
	for _, m := range matched[:min(max(n, 0), len(matched))] {
		fmt.Fprintln(w, m)
	}
	return nil
}

func splitTries(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' })
}

func loadDict(path string) ([]string, error) {
	if path == "" {
		return LoadWords(strings.NewReader(embeddedWords))
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return LoadWords(f)
}
