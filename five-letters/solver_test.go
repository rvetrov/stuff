package main

import (
	"slices"
	"strings"
	"testing"
)

func TestLoadWords(t *testing.T) {
	input := strings.Join([]string{
		"абажур",    // 6 letters
		"пирог",     // ok
		"Ёлка",      // 4 letters
		"Ёжики",     // ok after normalization
		"ежики",     // duplicate of the previous one after ё→е
		"агар-агар", // hyphen
		"  котик ",  // spaces around
		"house",     // Latin
		"",
	}, "\n")

	got, err := LoadWords(strings.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"пирог", "ежики", "котик"}
	if !slices.Equal(got, want) {
		t.Errorf("LoadWords() = %v, want %v", got, want)
	}
}

func TestEmbeddedWords(t *testing.T) {
	words, err := LoadWords(strings.NewReader(embeddedWords))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(words), strings.Count(embeddedWords, "\n"); got != want {
		t.Errorf("embedded dictionary: %d words after filtering, %d lines", got, want)
	}
}

func TestParseConstraintsErrors(t *testing.T) {
	tests := []struct {
		name  string
		mask  string
		wrong string
		tries []string
	}{
		{"short mask", "п...", "", nil},
		{"long mask", "п.....", "", nil},
		{"latin in mask", "p....", "", nil},
		{"digit in mask", "1....", "", nil},
		{"latin in wrong", ".....", "a", nil},
		{"short try", ".....", "", []string{"пир"}},
		{"latin try", ".....", "", []string{"house"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ParseConstraints(tt.mask, tt.wrong, tt.tries); err == nil {
				t.Error("want error, got nil")
			}
		})
	}
}

func TestParseConstraints(t *testing.T) {
	// The hidden word is "пачка", the try is "папка": everything is green except the second п, which is gray.
	c, err := ParseConstraints("па.ка", "", []string{"папка"})
	if err != nil {
		t.Fatal(err)
	}
	if c.green != [wordLen]rune{'п', 'а', 0, 'к', 'а'} {
		t.Errorf("green = %q", c.green)
	}
	if len(c.absent) != 0 {
		t.Errorf("absent = %v, want none: п is in the mask", c.absent)
	}
	if !c.notAt[2]['п'] {
		t.Error("п must be excluded from position 2")
	}
	if c.notAt[0]['п'] {
		t.Error("п is green at position 0 and must not be excluded there")
	}
}

func TestMatch(t *testing.T) {
	tests := []struct {
		name  string
		mask  string
		wrong string
		tries []string
		word  string
		want  bool
	}{
		{"no constraints", ".....", "", nil, "пирог", true},
		{"green fits", "п...г", "", nil, "пирог", true},
		{"green differs", "п...к", "", nil, "пирог", false},
		{"mask with _ and *", "п_*.г", "", nil, "пирог", true},
		{"mask in upper case", "П...Г", "", nil, "пирог", true},
		{"yellow present", ".....", "ор", nil, "пирог", true},
		{"yellow missing", ".....", "ам", nil, "пирог", false},
		{"gray letters elsewhere", ".....", "", []string{"мышка"}, "пирог", true},
		{"gray letter hit", ".....", "", []string{"сырок"}, "пирог", false},
		{"yellow at the same position", ".....", "р", []string{"барыш"}, "пирог", false},
		{"yellow at another position", ".....", "о", []string{"осень"}, "пирог", true},
		{"ё in mask", "ё....", "", nil, "ежики", true},
		{"ё in wrong", ".....", "ё", nil, "ежики", true},
		{"repeated letter gray at another position", "па.ка", "", []string{"папка"}, "пачка", true},
		{"repeated letter excluded", "па.ка", "", []string{"папка"}, "папка", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := ParseConstraints(tt.mask, tt.wrong, tt.tries)
			if err != nil {
				t.Fatal(err)
			}
			if got := c.Match(tt.word); got != tt.want {
				t.Errorf("Match(%q) = %v, want %v", tt.word, got, tt.want)
			}
		})
	}
}

func TestRun(t *testing.T) {
	var sb strings.Builder
	if err := run(&sb, "п....", "р", "сырок", 3, ""); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(sb.String()), "\n")
	if !strings.HasPrefix(lines[0], "Подходящих слов: ") {
		t.Fatalf("first line = %q", lines[0])
	}
	if len(lines) > 4 {
		t.Errorf("printed %d words, want at most 3", len(lines)-1)
	}
	for _, w := range lines[1:] {
		if !strings.HasPrefix(w, "п") || !strings.Contains(w, "р") || strings.ContainsAny(w, "сыок") {
			t.Errorf("word %q doesn't fit", w)
		}
	}
}
