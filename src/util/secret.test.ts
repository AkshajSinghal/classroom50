import { describe, expect, it } from "vitest"
import {
  DEFAULT_SECRET_LENGTH,
  SECRET_PATTERN,
  generateSecret,
  isValidSecret,
} from "./secret"

describe("generateSecret", () => {
  it("produces a value matching the pattern at the requested length", () => {
    for (const n of [4, 8, 16, 64]) {
      const s = generateSecret(n)
      expect(s).toHaveLength(n)
      expect(SECRET_PATTERN.test(s)).toBe(true)
      expect(isValidSecret(s)).toBe(true)
    }
  })

  it("defaults to DEFAULT_SECRET_LENGTH", () => {
    expect(generateSecret()).toHaveLength(DEFAULT_SECRET_LENGTH)
  })

  it("throws on a non-positive length", () => {
    expect(() => generateSecret(0)).toThrow()
    expect(() => generateSecret(-2)).toThrow()
  })

  it("is random across draws", () => {
    expect(generateSecret(12)).not.toBe(generateSecret(12))
  })
})

describe("isValidSecret", () => {
  it("accepts safe path segments", () => {
    for (const s of ["abcd", "abc123", "0a0a0a0a", "zzzz9999"]) {
      expect(isValidSecret(s)).toBe(true)
    }
  })

  it("rejects empty, too-short, uppercase, or separator-bearing values", () => {
    for (const s of [
      "",
      "abc",
      "ABC123",
      "abc-123",
      "abc/123",
      "abc 123",
      "abc.123",
    ]) {
      expect(isValidSecret(s)).toBe(false)
    }
  })
})
