/**
 * Safe markdown subset renderer: bold, italic, strikethrough, inline code,
 * fenced code blocks, links, spoilers. Everything is HTML-escaped first,
 * so the output is safe by construction (no user HTML can survive).
 */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

const MAX_LENGTH = 8000;

export function renderMarkdown(input: string): string {
  const raw = input.length > MAX_LENGTH ? input.slice(0, MAX_LENGTH) : input;

  // Split out fenced code blocks first
  const parts = raw.split(/```(?:[a-zA-Z0-9_-]*)\n?/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += `<pre class="md-block"><code>${escapeHtml(parts[i] ?? '').replace(/\n$/, '')}</code></pre>`;
    } else {
      out += renderInline(parts[i] ?? '');
    }
  }
  return out;
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  const stash: string[] = [];
  const stashHtml = (html: string): string => {
    stash.push(html);
    return `\u0000${stash.length - 1}\u0001`;
  };

  // Links first so URL punctuation is never interpreted as markup
  s = s.replace(/\bhttps?:\/\/[^\s<>"')\]]+/g, (m) => {
    let href = m;
    const trailing = /[.,;:!?…]+$/.exec(href);
    let after = '';
    if (trailing) {
      after = trailing[0];
      href = href.slice(0, href.length - after.length);
    }
    return stashHtml(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" dir="ltr">${href}</a>`) + after;
  });

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => stashHtml(`<code class="md-code">${code}</code>`));

  // Spoilers
  s = s.replace(/\|\|([^|\n]+)\|\|/g, (_m, body: string) => stashHtml(`<span class="md-spoiler" tabindex="0">${body}</span>`));

  // Bold, italic, strikethrough
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(（【>])\*([^*\n]+)\*(?=$|[\s.,!?)（】<])/g, '$1<em>$2</em>');
  s = s.replace(/(^|\s)_([^_\n]+)_(?=$|[\s.,!?)）/])/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // Newlines
  s = s.replace(/\r\n/g, '\n').replace(/\n/g, '<br/>');

  // Restore stashed HTML
  s = s.replace(/\u0000(\d+)\u0001/g, (_m, idx: string) => stash[Number(idx)] ?? '');

  return s;
}

/** Extract @mention usernames from raw message text. */
export function extractMentions(content: string, max = 10): string[] {
  const found = new Set<string>();
  const re = /(?:^|\s)@([a-zA-Z0-9_]{3,24})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null && found.size < max) {
    if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}
