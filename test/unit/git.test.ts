import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePorcelain } from '../../src/main/git';

// Hermetic: pure porcelain parsing over fixture strings (no git binary).
describe('git status porcelain', () => {
  it('parses branch + staged/unstaged/untracked files', () => {
    const status = parsePorcelain(
      ['## main...origin/main', 'M  src/a.ts', ' M src/b.ts', 'A  src/c.ts', '?? new.txt', ''].join(
        '\n',
      ),
    );
    assert.equal(status.isRepo, true);
    assert.equal(status.branch, 'main');
    assert.deepEqual(status.files, [
      { path: 'src/a.ts', staged: 'M', unstaged: ' ' },
      { path: 'src/b.ts', staged: ' ', unstaged: 'M' },
      { path: 'src/c.ts', staged: 'A', unstaged: ' ' },
      { path: 'new.txt', staged: '?', unstaged: '?' },
    ]);
  });

  it('handles a fresh repo and renames', () => {
    const status = parsePorcelain(['## No commits yet on main', 'A  a.ts', 'R  old.ts -> new.ts'].join('\n'));
    assert.equal(status.branch, 'main');
    assert.deepEqual(status.files[1], { path: 'new.ts', staged: 'R', unstaged: ' ' });
  });

  it('reports a clean tree', () => {
    const status = parsePorcelain('## main\n');
    assert.equal(status.isRepo, true);
    assert.equal(status.branch, 'main');
    assert.deepEqual(status.files, []);
  });
});
