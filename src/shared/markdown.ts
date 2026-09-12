/**
 * Minimal Markdown subset → HTML for chat rendering. Pure (no deps, no node imports).
 *
 * Supported: fenced code blocks, ATX headings, blockquotes, ordered/unordered
 * lists (one nesting level), tables, hr, paragraphs, inline code, bold,
 * italic, strikethrough, links.
 *
 * XSS safety by construction: all input is HTML-escaped first; only this
 * module's own tags are emitted; link hrefs allow http(s) only.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeLang(lang: string): string {
  return /^[a-zA-Z0-9_-]{1,20}$/.test(lang) ? lang : '';
}

function styleInline(escaped: string): string {
  const linked = escaped.replace(
    /\[([^\]\n]{1,200})\]\(([^)\s\n]{1,500})\)/g,
    (_m, text: string, url: string) =>
      /^https?:\/\//.test(url)
        ? `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>`
        : `${text} (${url})`,
  );
  return linked
    .replace(/\*\*([^*][\s\S]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~][\s\S]*?)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
}

function renderInline(src: string): string {
  // Split out code spans first so no other rule fires inside them.
  // With a capturing group, odd indices are the spans themselves.
  return escapeHtml(src)
    .split(/(`[^`\n]+`)/g)
    .map((part, i) => (i % 2 === 1 ? `<code>${part.slice(1, -1)}</code>` : styleInline(part)))
    .join('');
}

interface ListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

function renderList(items: ListItem[]): string {
  // Single-level nesting: indent 0 = top, indent > 0 = nested under previous top item.
  let html = '';
  let open = '';
  let nestedOpen = false;
  const closeNested = () => {
    if (nestedOpen) {
      html += '</li></ul>';
      nestedOpen = false;
    }
  };
  for (const item of items) {
    const tag = item.ordered ? 'ol' : 'ul';
    if (item.indent === 0) {
      closeNested();
      if (open && open !== tag) html += `</li></${open}>`;
      if (!open || open !== tag) {
        html += `<${tag}>`;
        open = tag;
      } else {
        html += '</li>';
      }
      html += `<li>${renderInline(item.text)}`;
    } else {
      if (!nestedOpen) {
        html += '<ul>';
        nestedOpen = true;
      } else {
        html += '</li>';
      }
      html += `<li>${renderInline(item.text)}`;
    }
  }
  closeNested();
  if (open) html += `</li></${open}>`;
  return html;
}

function isTableDelimiter(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function splitRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith('|') && t.endsWith('|') ? t.slice(1, -1) : t;
  return inner.split('|');
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length > 0) html.push(`<p>${buf.map(renderInline).join('<br>')}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const lang = sanitizeLang(fence[1] ?? '');
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // consume closing fence (or EOF)
      const cls = lang ? ` class="language-${lang}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // ATX heading.
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // Table (header + delimiter + body rows).
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableDelimiter(splitRow(lines[i + 1])) &&
      splitRow(line).length === splitRow(lines[i + 1]).length
    ) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${head.map((c) => `<th>${renderInline(c.trim())}</th>`).join('')}</tr></thead>`;
      const tbody =
        rows.length > 0
          ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline((c ?? '').trim())}</td>`).join('')}</tr>`).join('')}</tbody>`
          : '';
      html.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Blockquote.
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // List.
    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (listMatch) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(lines[i]);
        if (!m) break;
        items.push({
          indent: m[1].length >= 2 ? 1 : 0,
          ordered: /^\d/.test(m[2]),
          text: m[3],
        });
        i++;
      }
      html.push(renderList(items));
      continue;
    }

    // Blank line.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph.
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      // Stop before a table delimiter's header row.
      if (lines[i].includes('|') && i + 1 < lines.length && isTableDelimiter(splitRow(lines[i + 1]))) break;
      buf.push(lines[i]);
      i++;
    }
    flushParagraph(buf);
  }

  return html.join('\n');
}
