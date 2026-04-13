import { describe, it, expect } from 'vitest'
import { displayName, displayAliases } from '../entityName'

describe('displayName', () => {
  // --- basic title-casing ---
  it('title-cases a lowercase multi-word name', () => {
    expect(displayName('after school club')).toBe('After School Club')
  })

  it('title-cases a single lowercase word', () => {
    expect(displayName('prayer')).toBe('Prayer')
  })

  it('title-cases a name with only first word capitalised', () => {
    expect(displayName('Data modelling')).toBe('Data Modelling')
  })

  it('preserves already correct title-case', () => {
    expect(displayName('Job Search')).toBe('Job Search')
  })

  // --- hyphens and underscores ---
  it('replaces hyphens with spaces and title-cases', () => {
    expect(displayName('blue-bottle')).toBe('Blue Bottle')
  })

  it('replaces underscores with spaces and title-cases', () => {
    expect(displayName('john_smith')).toBe('John Smith')
  })

  it('replaces mixed separators', () => {
    expect(displayName('my-cool_thing')).toBe('My Cool Thing')
  })

  // --- whitespace handling ---
  it('collapses multiple spaces', () => {
    expect(displayName('too   many  spaces')).toBe('Too Many Spaces')
  })

  it('trims leading and trailing whitespace', () => {
    expect(displayName('  padded name  ')).toBe('Padded Name')
  })

  // --- acronyms ---
  it('preserves a known acronym (SQL)', () => {
    expect(displayName('SQL')).toBe('SQL')
  })

  it('uppercases a known acronym even if stored lowercase', () => {
    expect(displayName('sql')).toBe('SQL')
  })

  it('handles acronym in a phrase', () => {
    expect(displayName('rest api design')).toBe('REST API Design')
  })

  it('preserves unknown all-caps words as acronyms', () => {
    expect(displayName('ACME corp')).toBe('ACME Corp')
  })

  it('does not treat single uppercase letter as acronym needing preservation', () => {
    // Single letters get title-cased (which is the same as uppercase for one char)
    expect(displayName('A')).toBe('A')
  })

  // --- special words ---
  it('handles iPhone', () => {
    expect(displayName('iphone')).toBe('iPhone')
  })

  it('handles GitHub', () => {
    expect(displayName('github')).toBe('GitHub')
  })

  it('handles macOS', () => {
    expect(displayName('macos')).toBe('macOS')
  })

  it('handles DevOps', () => {
    expect(displayName('devops')).toBe('DevOps')
  })

  it("handles McDonald's", () => {
    expect(displayName("mcdonald's")).toBe("McDonald's")
  })

  it('handles ChatGPT', () => {
    expect(displayName('chatgpt')).toBe('ChatGPT')
  })

  it('handles JavaScript', () => {
    expect(displayName('javascript')).toBe('JavaScript')
  })

  // --- mixed scenarios ---
  it('handles a phrase with an acronym and regular words', () => {
    expect(displayName('learning sql basics')).toBe('Learning SQL Basics')
  })

  it('handles a phrase with special word and regular words', () => {
    expect(displayName('iphone repair shop')).toBe('iPhone Repair Shop')
  })

  it('handles all-caps input', () => {
    expect(displayName('RUNNING')).toBe('RUNNING')
    // All-caps words longer than 1 char are preserved as potential acronyms
  })

  // --- edge cases ---
  it('returns empty string for empty input', () => {
    expect(displayName('')).toBe('')
  })

  it('returns whitespace-only string unchanged', () => {
    expect(displayName('   ')).toBe('   ')
  })

  it('handles a single character', () => {
    expect(displayName('a')).toBe('A')
  })

  it('handles numeric content', () => {
    expect(displayName('matthew 6:19')).toBe('Matthew 6:19')
  })

  it('handles name with apostrophe', () => {
    expect(displayName("john's diary")).toBe("John's Diary")
  })
})

describe('displayAliases', () => {
  it('normalises and joins multiple aliases', () => {
    expect(displayAliases(['after school club', 'sql', 'iphone'])).toBe(
      'After School Club, SQL, iPhone',
    )
  })

  it('returns empty string for empty array', () => {
    expect(displayAliases([])).toBe('')
  })

  it('handles single alias', () => {
    expect(displayAliases(['data modelling'])).toBe('Data Modelling')
  })
})
