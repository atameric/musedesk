import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/shared/markdown';

describe('renderMarkdown', () => {
  it('renders headings, paragraphs, and emphasis', () => {
    const html = renderMarkdown('# Hello\n\nThis is **bold** and *italic* text.');
    assert.ok(html.includes('<h1>Hello</h1>'), html);
    assert.ok(html.includes('<strong>bold</strong>'), html);
    assert.ok(html.includes('<em>italic</em>'), html);
  });

  it('renders fenced code blocks with escaped content', () => {
    const html = renderMarkdown('```js\nconst a = 1 < 2 && b;\n```');
    assert.ok(html.includes('<pre><code class="language-js">'), html);
    assert.ok(html.includes('1 &lt; 2 &amp;&amp; b;'), html);
    assert.ok(!html.includes('<script>'), html);
  });

  it('renders inline code without interpreting markdown inside', () => {
    const html = renderMarkdown('Use `**not bold**` here.');
    assert.ok(html.includes('<code>**not bold**</code>'), html);
    assert.ok(!html.includes('<strong>'), html);
  });

  it('renders lists, blockquotes, and tables', () => {
    const html = renderMarkdown('- a\n- b\n\n> quoted **yes**\n\n| x | y |\n|---|---|\n| 1 | 2 |');
    assert.ok(html.includes('<ul>') && html.includes('<li>a</li>'), html);
    assert.ok(html.includes('<blockquote>'), html);
    assert.ok(html.includes('<table>') && html.includes('<th>x</th>'), html);
    assert.ok(html.includes('<td>2</td>'), html);
  });

  it('links http(s) only and neutralizes javascript: URLs', () => {
    const ok = renderMarkdown('[docs](https://example.com/a?b=1&c=2)');
    assert.ok(ok.includes('<a href="https://example.com/a?b=1&amp;c=2"'), ok);
    const evil = renderMarkdown('[x](javascript:alert(1))');
    assert.ok(!evil.includes('<a '), evil);
    assert.ok(evil.includes('javascript:alert(1)'), evil);
  });

  it('escapes raw HTML and event-handler payloads', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<script>'), html);
    assert.ok(!html.includes('<img'), html);
    assert.ok(html.includes('&lt;script&gt;'), html);
    assert.ok(html.includes('onerror=alert(1)'), html);
  });

  it('handles empty and plain input', () => {
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown('plain'), '<p>plain</p>');
  });
});
