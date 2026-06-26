package configrepo

import (
	"crypto/rand"
	"fmt"
	"regexp"

	"github.com/foundation50/classroom50-cli-shared/contract"
)

// SecretAlphabet is the character set for a generated capability-URL
// secret: lowercase letters and digits. Kept to a single safe URL path
// segment (no uppercase, no separators) so it composes cleanly into the
// published Pages path `<classroom>/<secret>/...`.
const SecretAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"

// DefaultSecretLength is the generated length when the teacher opts in
// without supplying their own value. 8 chars of [a-z0-9] is ~41 bits of
// entropy — ample for anti-discovery (this is friction, not crypto).
const DefaultSecretLength = 8

// SecretPattern bounds a capability-URL secret to a single safe path
// segment: 4-64 lowercase-alphanumeric chars. Compiled from the
// single-sourced contract.SecretPattern (see that constant for the full
// cross-language lockstep set).
var SecretPattern = regexp.MustCompile(contract.SecretPattern)

// SecretPatternDescription is the human-readable summary embedded in the
// "invalid secret" error.
const SecretPatternDescription = contract.SecretPatternDescription

// ValidateSecret checks a teacher-supplied (or generated) secret against
// SecretPattern. An empty secret is rejected here; callers that allow
// "no secret" must branch on emptiness before calling this.
func ValidateSecret(secret string) error {
	if !SecretPattern.MatchString(secret) {
		return fmt.Errorf("invalid secret %q: must be %s", secret, SecretPatternDescription)
	}
	return nil
}

// GenerateSecret returns a cryptographically random secret of n chars
// drawn from SecretAlphabet. Uses rejection sampling so the modulo bias
// that a naive `b % len(alphabet)` would introduce is eliminated.
func GenerateSecret(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("secret length must be positive, got %d", n)
	}
	out := make([]byte, n)
	// 256 % 36 == 4, so bytes >= 252 would bias the low residues; reject
	// them and redraw. max is the largest multiple of the alphabet size
	// that fits in a byte.
	max := byte(256 - (256 % len(SecretAlphabet)))
	buf := make([]byte, 1)
	for i := 0; i < n; {
		if _, err := rand.Read(buf); err != nil {
			return "", fmt.Errorf("read random bytes: %w", err)
		}
		if buf[0] >= max {
			continue
		}
		out[i] = SecretAlphabet[int(buf[0])%len(SecretAlphabet)]
		i++
	}
	return string(out), nil
}
