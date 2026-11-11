import { describe, it, expect } from 'vitest'
import { renderSnippetHtml } from '../searchSnippet'

describe('renderSnippetHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(renderSnippetHtml('')).toBe('')
  })

  it('escapes plain text with no markers', () => {
    expect(renderSnippetHtml('plain & <text>')).toBe('plain &amp; &lt;text&gt;')
  })

  it('wraps a single marked term in a <mark> tag', () => {
    const html = renderSnippetHtml('walked through \x02Vienna\x03 with Atlas')
    expect(html).toContain('<mark')
    expect(html).toContain('Vienna</mark>')
    expect(html.startsWith('walked through ')).toBe(true)
    expect(html.endsWith(' with Atlas')).toBe(true)
  })

  it('handles multiple marked terms in one snippet', () => {
    const html = renderSnippetHtml('\x02Vienna\x03 and then \x02Atlas\x03 met')
    const markCount = (html.match(/<mark/g) || []).length
    expect(markCount).toBe(2)
    expect(html).toContain('Vienna</mark>')
    expect(html).toContain('Atlas</mark>')
  })

  it('escapes HTML inside marked terms', () => {
    const html = renderSnippetHtml('\x02<script>\x03')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('escapes HTML in the tail after the last close marker', () => {
    const html = renderSnippetHtml('\x02Vienna\x03 <raw> tail')
    expect(html).toContain('&lt;raw&gt;')
    expect(html).toContain('Vienna</mark>')
  })

  it('gracefully degrades when a close marker is missing', () => {
    // Unbalanced open marker — treat everything after the STX as
    // highlighted to end-of-string. This can happen if FTS5 truncates
    // a snippet mid-highlight at the configured window boundary.
    const html = renderSnippetHtml('lead \x02Vienna and the rest')
    expect(html.startsWith('lead ')).toBe(true)
    expect(html).toContain('<mark')
    expect(html).toContain('Vienna and the rest</mark>')
  })

  it('skips empty highlight spans (zero-width markers)', () => {
    const html = renderSnippetHtml('before \x02\x03 after')
    expect(html).not.toContain('<mark')
    expect(html).toContain('before ')
    expect(html).toContain(' after')
  })

  it('escapes ellipsis and other non-ASCII passthrough', () => {
    const html = renderSnippetHtml('…\x02Vienna\x03…')
    expect(html.startsWith('…')).toBe(true)
    expect(html.endsWith('…')).toBe(true)
    expect(html).toContain('Vienna</mark>')
  })
})
