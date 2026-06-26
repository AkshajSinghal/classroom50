package configrepo

import "testing"

func TestGenerateSecret_MatchesPatternAndLength(t *testing.T) {
	for _, n := range []int{4, 8, 16, 64} {
		s, err := GenerateSecret(n)
		if err != nil {
			t.Fatalf("GenerateSecret(%d) error: %v", n, err)
		}
		if len(s) != n {
			t.Errorf("GenerateSecret(%d) length = %d, want %d", n, len(s), n)
		}
		if !SecretPattern.MatchString(s) {
			t.Errorf("GenerateSecret(%d) = %q does not match SecretPattern", n, s)
		}
		if err := ValidateSecret(s); err != nil {
			t.Errorf("generated secret %q failed ValidateSecret: %v", s, err)
		}
	}
}

func TestGenerateSecret_RejectsNonPositiveLength(t *testing.T) {
	if _, err := GenerateSecret(0); err == nil {
		t.Error("GenerateSecret(0) = nil error, want error")
	}
	if _, err := GenerateSecret(-3); err == nil {
		t.Error("GenerateSecret(-3) = nil error, want error")
	}
}

func TestGenerateSecret_IsRandom(t *testing.T) {
	// Two draws of a reasonable length should differ with overwhelming
	// probability; a constant generator would be a real bug.
	a, _ := GenerateSecret(DefaultSecretLength)
	b, _ := GenerateSecret(DefaultSecretLength)
	if a == b {
		t.Errorf("two GenerateSecret(%d) draws were identical (%q) — not random", DefaultSecretLength, a)
	}
}

func TestValidateSecret(t *testing.T) {
	valid := []string{"abcd", "abc123", "0a0a0a0a", "zzzz9999"}
	for _, s := range valid {
		if err := ValidateSecret(s); err != nil {
			t.Errorf("ValidateSecret(%q) = %v, want nil", s, err)
		}
	}

	invalid := []string{
		"",        // empty
		"abc",     // too short (< 4)
		"ABC123",  // uppercase
		"abc-123", // hyphen (would split the path segment)
		"abc/123", // slash (path traversal vector)
		"abc 123", // space
		"abc.123", // dot
	}
	for _, s := range invalid {
		if err := ValidateSecret(s); err == nil {
			t.Errorf("ValidateSecret(%q) = nil, want error", s)
		}
	}
}
