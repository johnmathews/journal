import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import {
  diffToSegments,
  segmentsToHtml,
  useDiffHighlight,
} from '../useDiffHighlight'

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
