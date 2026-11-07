import { describe, expect, it } from 'vitest';
import { renderMarkdown, extractMentions, escapeHtml } from '@mg/shared';

describe('safe markdown renderer', () => {
  it('escapes all raw HTML (XSS-proof by construction)', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
  });

  it('escapes html inside markdown wrappers too', () => {
    const out = renderMarkdown('**<b>bold</b>**');
    expect(out).toContain('<strong>');
    expect(out).not.toContain('<b>');
  });

  it('renders bold, italic, strike', () => {
    expect(renderMarkdown('**hi**')).toContain('<strong>hi</strong>');
    expect(renderMarkdown('*hi*')).toContain('<em>hi</em>');
    expect(renderMarkdown('~~hi~~')).toContain('<del>hi</del>');
  });

  it('renders inline code and fenced blocks', () => {
    expect(renderMarkdown('`code`')).toContain('class="md-code"');
    expect(renderMarkdown('```\nlet x = 1\n```')).toContain('<pre class="md-block">');
  });

  it('renders spoilers', () => {
    expect(renderMarkdown('||secret||')).toContain('md-spoiler');
  });

  it('renders only http(s) links with rel=noreferrer', () => {
    const out = renderMarkdown('visit https://example.com/a_b now.');
    expect(out).toContain('<a href="https://example.com/a_b"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(renderMarkdown('javascript:alert(1)')).not.toContain('<a');
  });

  it('link URLs are not mangled by emphasis', () => {
    const out = renderMarkdown('see https://ex.com/path_with_underscores end');
    expect(out).toContain('path_with_underscores</a>');
  });
});

describe('mention extraction', () => {
  it('finds @usernames at word boundaries', () => {
    expect(extractMentions('سلام @mahyar این یک تست است')).toEqual(['mahyar']);
    expect(extractMentions('hi @A_B and @c-d!')).toEqual(['a_b']);
  });
  it('ignores emails and non-boundary @', () => {
    expect(extractMentions('mail me a@b.com')).toEqual([]);
  });
});

describe('escapeHtml', () => {
  it('escapes the dangerous five', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
