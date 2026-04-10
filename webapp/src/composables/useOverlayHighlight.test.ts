import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import type { Chunk, TokenSpan } from '@/types/entry'
import {
  buildChunkSegments,
  buildTokenSegments,
  segmentsToHtml,
  useOverlayHighlight,
  type OverlayMode,
} from './useOverlayHighlight'

const chunk = (
  index: number,
  char_start: number,
  char_end: number,
  token_count = 5,
  text = 'x',
): Chunk => ({ index, text, char_start, char_end, token_count })

const token = (
  index: number,
  char_start: number,
  char_end: number,
  token_id = 0,
  text = 'x',
): TokenSpan => ({ index, token_id, text, char_start, char_end })

describe('buildChunkSegments', () => {
  it('returns a single plain segment when no chunks are provided', () => {
    const segs = buildChunkSegments('hello world', [])
    expect(segs).toEqual([{ kind: 'plain', text: 'hello world' }])
  })

  it('returns an empty array for empty text', () => {
    expect(buildChunkSegments('', [chunk(0, 0, 0)])).toEqual([])
  })

  it('splits text at a single chunk boundary', () => {
    // Text: "Hello world", chunk covers "Hello"
    const segs = buildChunkSegments('Hello world', [chunk(0, 0, 5)])
    // Expect: chunk-a for "Hello", plain for " world"
    expect(segs).toHaveLength(2)
    expect(segs[0].kind).toBe('chunk-a')
    expect(segs[0].text).toBe('Hello')
    expect(segs[1].kind).toBe('plain')
    expect(segs[1].text).toBe(' world')
  })

  it('alternates chunk-a and chunk-b by chunk index', () => {
    // Two contiguous chunks covering the whole text.
    const text = 'aaaabbbb'
    const segs = buildChunkSegments(text, [chunk(0, 0, 4), chunk(1, 4, 8)])
    expect(segs).toHaveLength(2)
    expect(segs[0].kind).toBe('chunk-a')
    expect(segs[0].text).toBe('aaaa')
    expect(segs[1].kind).toBe('chunk-b')
    expect(segs[1].text).toBe('bbbb')
  })

  it('renders overlap regions with chunk-overlap kind', () => {
    // Two chunks overlapping in the middle:
    //   chunk 0: [0, 6)  "aaaabb"
    //   chunk 1: [4, 10) "bbcccc"
    // Overlap is [4, 6) = "bb"
    const text = 'aaaabbcccc'
    const segs = buildChunkSegments(text, [chunk(0, 0, 6), chunk(1, 4, 10)])
    expect(segs).toHaveLength(3)
    expect(segs[0].text).toBe('aaaa')
    expect(segs[0].kind).toBe('chunk-a')
    expect(segs[1].text).toBe('bb')
    expect(segs[1].kind).toBe('chunk-overlap')
    expect(segs[2].text).toBe('cccc')
    expect(segs[2].kind).toBe('chunk-b')
  })

  it('clamps out-of-range offsets without crashing', () => {
    // chunk claims to cover [0, 100) but text is only 5 chars.
    const segs = buildChunkSegments('short', [chunk(0, 0, 100)])
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('short')
    expect(segs[0].kind).toBe('chunk-a')
  })

  it('renders gaps between non-contiguous chunks as plain', () => {
    // chunk 0 at [0, 3), chunk 1 at [6, 9), gap [3, 6) is plain.
    const text = 'aaaxxxbbb'
    const segs = buildChunkSegments(text, [chunk(0, 0, 3), chunk(1, 6, 9)])
    expect(segs).toHaveLength(3)
    expect(segs[0].kind).toBe('chunk-a')
    expect(segs[1].kind).toBe('plain')
    expect(segs[1].text).toBe('xxx')
    expect(segs[2].kind).toBe('chunk-b')
  })

  it('attaches hover titles with chunk metadata', () => {
    const segs = buildChunkSegments('hello', [chunk(0, 0, 5, 7)])
    expect(segs[0].title).toBe('chunk 0 — 7 tokens')
  })
})

describe('buildTokenSegments', () => {
  it('returns plain for empty token list', () => {
    expect(buildTokenSegments('hi', [])).toEqual([
      { kind: 'plain', text: 'hi' },
    ])
  })

  it('alternates token-a and token-b', () => {
    const text = 'abcd'
    const segs = buildTokenSegments(text, [token(0, 0, 2), token(1, 2, 4)])
    expect(segs).toHaveLength(2)
    expect(segs[0].kind).toBe('token-a')
    expect(segs[0].text).toBe('ab')
    expect(segs[1].kind).toBe('token-b')
    expect(segs[1].text).toBe('cd')
  })

  it('reconstructs text from tokens that partition it', () => {
    const text = 'Hello world!'
    const tokens: TokenSpan[] = [
      token(0, 0, 5),
      token(1, 5, 11),
      token(2, 11, 12),
    ]
    const segs = buildTokenSegments(text, tokens)
    const reconstructed = segs.map((s) => s.text).join('')
    expect(reconstructed).toBe(text)
  })

  it('renders trailing text after last token as plain', () => {
    const segs = buildTokenSegments('Hello world', [token(0, 0, 5)])
    expect(segs).toHaveLength(2)
    expect(segs[0].kind).toBe('token-a')
    expect(segs[1].kind).toBe('plain')
    expect(segs[1].text).toBe(' world')
  })

  it('attaches token id on hover', () => {
    const segs = buildTokenSegments('hi', [token(0, 0, 2, 9906)])
    expect(segs[0].title).toBe('token 0 — id 9906')
  })
})

describe('segmentsToHtml', () => {
  it('wraps kinded segments in mark tags with the expected class', () => {
    const html = segmentsToHtml([
      { kind: 'chunk-a', text: 'hello', title: 'chunk 0 — 3 tokens' },
    ])
    expect(html).toContain('<mark')
    expect(html).toContain('bg-sky-100')
    expect(html).toContain('title="chunk 0 — 3 tokens"')
    expect(html).toContain('hello')
  })

  it('emits plain segments unwrapped (escaped only)', () => {
    const html = segmentsToHtml([{ kind: 'plain', text: 'plain text' }])
    expect(html).toBe('plain text')
  })

  it('escapes HTML special characters', () => {
    const html = segmentsToHtml([
      { kind: 'plain', text: '<script>alert("x")</script>' },
    ])
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script')
  })

  it('drops empty segments', () => {
    const html = segmentsToHtml([
      { kind: 'chunk-a', text: '' },
      { kind: 'plain', text: 'kept' },
    ])
    expect(html).toBe('kept')
  })
})

describe('useOverlayHighlight', () => {
  it('renders plain text in off mode', () => {
    const { overlayHtml } = useOverlayHighlight({
      text: ref('hello'),
      mode: ref<OverlayMode>('off'),
      chunks: ref(null),
      tokens: ref(null),
    })
    expect(overlayHtml.value).toBe('hello')
  })

  it('renders plain text in chunks mode when chunks are still loading', () => {
    const { overlayHtml } = useOverlayHighlight({
      text: ref('hello'),
      mode: ref<OverlayMode>('chunks'),
      chunks: ref(null),
      tokens: ref(null),
    })
    expect(overlayHtml.value).toBe('hello')
  })

  it('renders chunk overlay when chunks are loaded', () => {
    const { overlayHtml } = useOverlayHighlight({
      text: ref('Hello world'),
      mode: ref<OverlayMode>('chunks'),
      chunks: ref([chunk(0, 0, 5)]),
      tokens: ref(null),
    })
    expect(overlayHtml.value).toContain('bg-sky-100')
    expect(overlayHtml.value).toContain('Hello')
    expect(overlayHtml.value).toContain(' world')
  })

  it('renders token overlay when tokens are loaded', () => {
    const { overlayHtml } = useOverlayHighlight({
      text: ref('ab'),
      mode: ref<OverlayMode>('tokens'),
      chunks: ref(null),
      tokens: ref([token(0, 0, 1), token(1, 1, 2)]),
    })
    expect(overlayHtml.value).toContain('token-a'.split('-')[0]) // sanity: sky
    expect(overlayHtml.value).toContain('bg-green-100')
  })

  it('reacts to mode changes', () => {
    const mode = ref<OverlayMode>('off')
    const { overlayHtml } = useOverlayHighlight({
      text: ref('hello'),
      mode,
      chunks: ref([chunk(0, 0, 5)]),
      tokens: ref(null),
    })
    expect(overlayHtml.value).toBe('hello')
    mode.value = 'chunks'
    expect(overlayHtml.value).toContain('bg-sky-100')
  })
})
