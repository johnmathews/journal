import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import {
  applyUncertainOverlay,
  diffToSegments,
  mapUncertainToCorrected,
  segmentsToHtml,
  useDiffHighlight,
  type HighlightSegment,
} from '../useDiffHighlight'
import type { UncertainSpan } from '@/types/entry'

describe('diffToSegments', () => {
  it('returns one equal segment per panel when texts are identical', () => {
    const { originalSegments, correctedSegments } = diffToSegments(
      'hello world',
      'hello world',
    )
    expect(originalSegments).toEqual([{ kind: 'equal', text: 'hello world' }])
    expect(correctedSegments).toEqual([{ kind: 'equal', text: 'hello world' }])
  })

  it('marks removals only in the original panel', () => {
    const { originalSegments, correctedSegments } = diffToSegments(
      'hello big world',
      'hello world',
    )
    expect(originalSegments.some((s) => s.kind === 'diff-delete')).toBe(true)
    expect(correctedSegments.some((s) => s.kind === 'diff-delete')).toBe(false)
    // Reassembled text should match each side.
    expect(originalSegments.map((s) => s.text).join('')).toBe('hello big world')
    expect(correctedSegments.map((s) => s.text).join('')).toBe('hello world')
  })

  it('marks insertions only in the corrected panel', () => {
    const { originalSegments, correctedSegments } = diffToSegments(
      'hello world',
      'hello wonderful world',
    )
    expect(originalSegments.some((s) => s.kind === 'diff-insert')).toBe(false)
    expect(correctedSegments.some((s) => s.kind === 'diff-insert')).toBe(true)
    expect(correctedSegments.map((s) => s.text).join('')).toBe(
      'hello wonderful world',
    )
  })

  // Regression: diff-match-patch throws "Null input" for
  // null/undefined. When a malformed entry payload leaked through
  // (raw_text/final_text null) this used to take down the whole
  // <EntryDetailView> render and leave the user on a blank page.
  // Coercion here means we degrade to an empty diff instead.
  it('treats null inputs as empty strings instead of throwing', () => {
    expect(() =>
      diffToSegments(null as unknown as string, null as unknown as string),
    ).not.toThrow()
    const { originalSegments, correctedSegments } = diffToSegments(
      null as unknown as string,
      null as unknown as string,
    )
    expect(originalSegments.map((s) => s.text).join('')).toBe('')
    expect(correctedSegments.map((s) => s.text).join('')).toBe('')
  })

  it('treats undefined inputs as empty strings instead of throwing', () => {
    expect(() =>
      diffToSegments(undefined as unknown as string, 'hello'),
    ).not.toThrow()
    const { correctedSegments } = diffToSegments(
      undefined as unknown as string,
      'hello',
    )
    // "hello" all inserted because the original was "empty".
    expect(correctedSegments.map((s) => s.text).join('')).toBe('hello')
  })

  it('handles OCR-style typo corrections', () => {
    const { originalSegments, correctedSegments } = diffToSegments(
      'Absolutsntly hard',
      'Absolutely hard',
    )
    // Original reconstructs to the original text.
    expect(originalSegments.map((s) => s.text).join('')).toBe(
      'Absolutsntly hard',
    )
    // Corrected reconstructs to the corrected text.
    expect(correctedSegments.map((s) => s.text).join('')).toBe(
      'Absolutely hard',
    )
    // And we actually highlighted something (not one big equal span).
    expect(
      originalSegments.filter((s) => s.kind === 'diff-delete').length,
    ).toBeGreaterThan(0)
    expect(
      correctedSegments.filter((s) => s.kind === 'diff-insert').length,
    ).toBeGreaterThan(0)
  })
})

describe('segmentsToHtml', () => {
  it('escapes HTML special characters so user text is not interpreted as markup', () => {
    const html = segmentsToHtml([
      { kind: 'equal', text: 'a < b & c > "d" \'e\'' },
    ])
    expect(html).toBe('a &lt; b &amp; c &gt; &quot;d&quot; &#39;e&#39;')
  })

  it('wraps delete segments in a mark tag with the red class', () => {
    const html = segmentsToHtml([
      { kind: 'equal', text: 'hello ' },
      { kind: 'diff-delete', text: 'old' },
    ])
    expect(html).toContain('hello ')
    expect(html).toContain('<mark')
    expect(html).toContain('bg-red-100')
    expect(html).toContain('>old</mark>')
  })

  it('wraps insert segments in a mark tag with the emerald class', () => {
    const html = segmentsToHtml([
      { kind: 'equal', text: 'hello ' },
      { kind: 'diff-insert', text: 'new' },
    ])
    expect(html).toContain('bg-emerald-100')
    expect(html).toContain('>new</mark>')
  })

  it('drops empty segments', () => {
    const html = segmentsToHtml([
      { kind: 'equal', text: '' },
      { kind: 'diff-insert', text: '' },
      { kind: 'equal', text: 'ok' },
    ])
    expect(html).toBe('ok')
  })
})

describe('useDiffHighlight', () => {
  it('returns highlighted HTML for both panels when enabled', () => {
    const original = ref('hello world')
    const corrected = ref('hello brave world')
    const enabled = ref(true)
    const { originalHtml, correctedHtml } = useDiffHighlight(
      original,
      corrected,
      enabled,
    )
    expect(originalHtml.value).toContain('hello')
    expect(correctedHtml.value).toContain('brave')
    expect(correctedHtml.value).toContain('bg-emerald-100')
  })

  it('returns plain escaped text when disabled', () => {
    const original = ref('a < b')
    const corrected = ref('c & d')
    const enabled = ref(false)
    const { originalHtml, correctedHtml } = useDiffHighlight(
      original,
      corrected,
      enabled,
    )
    expect(originalHtml.value).toBe('a &lt; b')
    expect(correctedHtml.value).toBe('c &amp; d')
    expect(originalHtml.value).not.toContain('<mark')
    expect(correctedHtml.value).not.toContain('<mark')
  })

  it('reacts to changes in the corrected text', async () => {
    const original = ref('the quick fox')
    const corrected = ref('the quick fox')
    const enabled = ref(true)
    const { correctedHtml } = useDiffHighlight(original, corrected, enabled)

    expect(correctedHtml.value).not.toContain('<mark')
    corrected.value = 'the quick brown fox'
    await nextTick()
    expect(correctedHtml.value).toContain('brown')
    expect(correctedHtml.value).toContain('bg-emerald-100')
  })

  // Regression: useDiffHighlight is wired directly to the store
  // currentEntry's text fields, which can transiently be null while
  // an entry reloads. Forcing the computed to throw used to cascade
  // into a blank EntryDetailView.
  it('returns escaped empty strings when the source refs are null', () => {
    // Cast through unknown because the composable's public signature
    // says Ref<string>, but the regression we're guarding against is
    // exactly a runtime null leaking through from the store.
    const original = ref(null as unknown as string)
    const corrected = ref(null as unknown as string)
    const enabled = ref(true)
    const { originalHtml, correctedHtml } = useDiffHighlight(
      original,
      corrected,
      enabled,
    )
    expect(originalHtml.value).toBe('')
    expect(correctedHtml.value).toBe('')
  })

  it('reacts to toggling enabled on and off', async () => {
    const original = ref('hello world')
    const corrected = ref('hello there')
    const enabled = ref(true)
    const { correctedHtml } = useDiffHighlight(original, corrected, enabled)
    expect(correctedHtml.value).toContain('<mark')

    enabled.value = false
    await nextTick()
    expect(correctedHtml.value).toBe('hello there')

    enabled.value = true
    await nextTick()
    expect(correctedHtml.value).toContain('<mark')
  })
})

describe('applyUncertainOverlay', () => {
  const eq = (text: string): HighlightSegment => ({ kind: 'equal', text })
  const del = (text: string): HighlightSegment => ({
    kind: 'diff-delete',
    text,
  })
  const span = (char_start: number, char_end: number): UncertainSpan => ({
    char_start,
    char_end,
  })

  it('returns input unchanged when spans is empty', () => {
    const input = [eq('hello world')]
    expect(applyUncertainOverlay(input, [])).toBe(input)
  })

  it('promotes an uncertain region inside an equal segment', () => {
    // "hello world", span (6, 11) covers "world"
    const out = applyUncertainOverlay([eq('hello world')], [span(6, 11)])
    expect(out).toEqual([
      { kind: 'equal', text: 'hello ' },
      { kind: 'uncertain', text: 'world' },
    ])
    // Concatenation still equals the original text.
    expect(out.map((s) => s.text).join('')).toBe('hello world')
  })

  it('emits a leading equal portion and a trailing equal portion around a middle span', () => {
    // "foo bar baz", span (4, 7) covers "bar"
    const out = applyUncertainOverlay([eq('foo bar baz')], [span(4, 7)])
    expect(out).toEqual([
      { kind: 'equal', text: 'foo ' },
      { kind: 'uncertain', text: 'bar' },
      { kind: 'equal', text: ' baz' },
    ])
  })

  it('handles a span at the start of the text', () => {
    const out = applyUncertainOverlay([eq('foo bar')], [span(0, 3)])
    expect(out).toEqual([
      { kind: 'uncertain', text: 'foo' },
      { kind: 'equal', text: ' bar' },
    ])
  })

  it('handles a span at the end of the text', () => {
    const out = applyUncertainOverlay([eq('foo bar')], [span(4, 7)])
    expect(out).toEqual([
      { kind: 'equal', text: 'foo ' },
      { kind: 'uncertain', text: 'bar' },
    ])
  })

  it('handles multiple disjoint spans in a single segment', () => {
    const out = applyUncertainOverlay(
      [eq('foo plain bar baz end')],
      [span(0, 3), span(10, 17)], // "foo" and "bar baz"
    )
    expect(out).toEqual([
      { kind: 'uncertain', text: 'foo' },
      { kind: 'equal', text: ' plain ' },
      { kind: 'uncertain', text: 'bar baz' },
      { kind: 'equal', text: ' end' },
    ])
    expect(out.map((s) => s.text).join('')).toBe('foo plain bar baz end')
  })

  it('promotes a span inside a diff-delete to diff-delete-uncertain', () => {
    // Input: one equal "hello " segment (0..6) then a delete "world"
    // (6..11). Uncertain span (6, 11) sits exactly inside the delete.
    const out = applyUncertainOverlay(
      [eq('hello '), del('world')],
      [span(6, 11)],
    )
    expect(out).toEqual([
      { kind: 'equal', text: 'hello ' },
      { kind: 'diff-delete-uncertain', text: 'world' },
    ])
  })

  it('splits a span that straddles a segment boundary', () => {
    // "hello world" — equal "hello " (0..6), delete "world" (6..11).
    // Span (3, 9) crosses the boundary: 'l','o',' ' in equal and
    // 'w','o','r' in delete. Expect the equal portion to become
    // 'uncertain' and the delete portion 'diff-delete-uncertain'.
    const out = applyUncertainOverlay(
      [eq('hello '), del('world')],
      [span(3, 9)],
    )
    expect(out).toEqual([
      { kind: 'equal', text: 'hel' },
      { kind: 'uncertain', text: 'lo ' },
      { kind: 'diff-delete-uncertain', text: 'wor' },
      { kind: 'diff-delete', text: 'ld' },
    ])
    expect(out.map((s) => s.text).join('')).toBe('hello world')
  })

  it('normalises out-of-order input spans', () => {
    const out = applyUncertainOverlay(
      [eq('foo bar baz')],
      [span(8, 11), span(0, 3)], // "baz" first, then "foo"
    )
    expect(out).toEqual([
      { kind: 'uncertain', text: 'foo' },
      { kind: 'equal', text: ' bar ' },
      { kind: 'uncertain', text: 'baz' },
    ])
  })

  it('merges overlapping input spans before applying', () => {
    const out = applyUncertainOverlay(
      [eq('abcdefgh')],
      // (1..5) and (4..7) overlap — merged to (1..7)
      [span(1, 5), span(4, 7)],
    )
    expect(out).toEqual([
      { kind: 'equal', text: 'a' },
      { kind: 'uncertain', text: 'bcdefg' },
      { kind: 'equal', text: 'h' },
    ])
  })

  it('drops spans with zero or negative length', () => {
    const out = applyUncertainOverlay(
      [eq('hello')],
      [span(2, 2), span(3, 1) as UncertainSpan],
    )
    expect(out).toEqual([eq('hello')])
  })

  it('preserves the exact original text concatenation under any span mix', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const spans: UncertainSpan[] = [
      span(0, 3), // "The"
      span(10, 15), // "brown"
      span(20, 25), // "jumps"
      span(35, 39), // "lazy"
    ]
    // Guard that we got the offsets right before exercising the overlay.
    expect(text.slice(0, 3)).toBe('The')
    expect(text.slice(10, 15)).toBe('brown')
    expect(text.slice(20, 25)).toBe('jumps')
    expect(text.slice(35, 39)).toBe('lazy')
    const out = applyUncertainOverlay([eq(text)], spans)
    expect(out.map((s) => s.text).join('')).toBe(text)
    // And all four uncertain segments must be present.
    const uncertainTexts = out
      .filter((s) => s.kind === 'uncertain')
      .map((s) => s.text)
    expect(uncertainTexts).toEqual(['The', 'brown', 'jumps', 'lazy'])
  })
})

describe('diffToSegments with uncertain spans', () => {
  it('applies uncertainty overlay to both panels', () => {
    const { originalSegments, correctedSegments } = diffToSegments(
      'hello world',
      'hello world',
      [{ char_start: 6, char_end: 11 }],
    )
    expect(originalSegments).toEqual([
      { kind: 'equal', text: 'hello ' },
      { kind: 'uncertain', text: 'world' },
    ])
    // Corrected side also shows uncertainty via regex matching.
    expect(correctedSegments).toEqual([
      { kind: 'equal', text: 'hello ' },
      { kind: 'uncertain', text: 'world' },
    ])
  })

  it('overlay survives a diff with inserts on the corrected side', () => {
    // Original "hello world", corrected "hello brave world" — the
    // insert lives on the corrected side and should not interfere
    // with the original's uncertainty highlighting.
    const { originalSegments, correctedSegments } = diffToSegments(
      'hello world',
      'hello brave world',
      [{ char_start: 6, char_end: 11 }],
    )
    expect(originalSegments.some((s) => s.kind === 'uncertain')).toBe(true)
    expect(originalSegments.map((s) => s.text).join('')).toBe('hello world')
    expect(correctedSegments.some((s) => s.kind === 'diff-insert')).toBe(true)
    // Uncertainty also appears on corrected side via regex matching
    // (the word "world" still exists in corrected text).
    expect(correctedSegments.some((s) => s.kind === 'uncertain')).toBe(true)
  })
})

describe('useDiffHighlight with Review toggle', () => {
  it('suppresses uncertainty highlight when showReview is false', () => {
    const original = ref('hello world')
    const corrected = ref('hello world')
    const enabled = ref(true)
    const showReview = ref(false)
    const uncertainSpans = ref<UncertainSpan[]>([
      { char_start: 6, char_end: 11 },
    ])
    const { originalHtml } = useDiffHighlight(original, corrected, enabled, {
      showReview,
      uncertainSpans,
    })
    expect(originalHtml.value).not.toContain('bg-yellow')
  })

  it('applies uncertainty highlight when showReview is true', () => {
    const original = ref('hello world')
    const corrected = ref('hello world')
    const enabled = ref(true)
    const showReview = ref(true)
    const uncertainSpans = ref<UncertainSpan[]>([
      { char_start: 6, char_end: 11 },
    ])
    const { originalHtml, correctedHtml } = useDiffHighlight(
      original,
      corrected,
      enabled,
      { showReview, uncertainSpans },
    )
    // Original side shows the highlight.
    expect(originalHtml.value).toContain('bg-yellow-200')
    expect(originalHtml.value).toContain('>world</mark>')
    // Corrected side also shows uncertainty via regex matching.
    expect(correctedHtml.value).toContain('bg-yellow-200')
    expect(correctedHtml.value).toContain('>world</mark>')
  })

  it('reacts to toggling showReview on and off', async () => {
    const original = ref('hello world')
    const corrected = ref('hello world')
    const enabled = ref(true)
    const showReview = ref(false)
    const uncertainSpans = ref<UncertainSpan[]>([
      { char_start: 6, char_end: 11 },
    ])
    const { originalHtml } = useDiffHighlight(original, corrected, enabled, {
      showReview,
      uncertainSpans,
    })
    expect(originalHtml.value).not.toContain('bg-yellow')

    showReview.value = true
    await nextTick()
    expect(originalHtml.value).toContain('bg-yellow-200')

    showReview.value = false
    await nextTick()
    expect(originalHtml.value).not.toContain('bg-yellow')
  })

  it('applies uncertainty even when diff enabled is false', () => {
    // The Review toggle must work whether or not the diff overlay is
    // on — they are independent dimensions.
    const original = ref('hello world')
    const corrected = ref('hello world')
    const enabled = ref(false)
    const showReview = ref(true)
    const uncertainSpans = ref<UncertainSpan[]>([
      { char_start: 6, char_end: 11 },
    ])
    const { originalHtml } = useDiffHighlight(original, corrected, enabled, {
      showReview,
      uncertainSpans,
    })
    expect(originalHtml.value).toContain('bg-yellow-200')
    expect(originalHtml.value).toContain('>world</mark>')
  })

  it('renders composite style when an uncertain span falls inside a delete region', () => {
    // Original "hello world", corrected "hello" — "world" becomes a
    // delete. Uncertainty on (6, 11) exactly overlaps the delete.
    const original = ref('hello world')
    const corrected = ref('hello')
    const enabled = ref(true)
    const showReview = ref(true)
    const uncertainSpans = ref<UncertainSpan[]>([
      { char_start: 6, char_end: 11 },
    ])
    const { originalHtml } = useDiffHighlight(original, corrected, enabled, {
      showReview,
      uncertainSpans,
    })
    // The composite class should appear, carrying both the red
    // delete background and the yellow ring.
    expect(originalHtml.value).toContain('bg-red-100')
    expect(originalHtml.value).toContain('ring-yellow-500')
  })
})

describe('mapUncertainToCorrected', () => {
  it('maps uncertain spans by regex matching', () => {
    const spans = mapUncertainToCorrected(
      'hello Ritsya goodbye',
      'hello Ritsya goodbye',
      [{ char_start: 6, char_end: 12 }],
    )
    expect(spans).toEqual([{ char_start: 6, char_end: 12 }])
  })

  it('returns empty when corrected text differs', () => {
    const spans = mapUncertainToCorrected(
      'hello Ritsya goodbye',
      'hello Ritsa goodbye',
      [{ char_start: 6, char_end: 12 }],
    )
    // "Ritsya" doesn't appear in corrected text — it's been fixed
    expect(spans).toEqual([])
  })

  it('handles short spans with context', () => {
    const spans = mapUncertainToCorrected(
      'the cat sat on a mat',
      'the cat sat on a mat',
      [{ char_start: 4, char_end: 7 }], // "cat"
    )
    expect(spans).toEqual([{ char_start: 4, char_end: 7 }])
  })

  it('returns empty for empty inputs', () => {
    expect(mapUncertainToCorrected('', 'hello', [])).toEqual([])
    expect(
      mapUncertainToCorrected('hello', '', [{ char_start: 0, char_end: 5 }]),
    ).toEqual([])
  })

  it('finds multiple occurrences', () => {
    const spans = mapUncertainToCorrected(
      'the word appears once',
      'the word word appears word',
      [{ char_start: 4, char_end: 8 }], // "word"
    )
    expect(spans.length).toBe(3)
  })
})
