import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSessions,
  loadProjects,
  saveProjects,
  projectName,
  type ProjectStore,
} from '../../src/shared/projects';
import type { Session } from '../../src/msp/msp';

// Hermetic: plain objects in, plain objects out; storage is an in-memory fake.
describe('project grouping', () => {
  function sess(
    sessionId: string,
    workspaceRoot: string | null,
    updatedAt: string,
    status = 'idle',
  ): Session {
    return { sessionId, workspaceRoot, updatedAt, status, turnCount: 0 } as Session;
  }

  it('groups sessions by workspace root, newest activity first', () => {
    const groups = groupSessions(
      [
        sess('a', '/Users/demo/shop', '2026-09-14T10:00:00Z'),
        sess('b', '/Users/demo/api', '2026-09-14T12:00:00Z'),
        sess('c', '/Users/demo/shop', '2026-09-14T11:00:00Z'),
      ],
      [],
    );
    assert.deepEqual(
      groups.map((g) => g.id),
      ['/Users/demo/api', '/Users/demo/shop'],
    );
    assert.deepEqual(
      groups[1].sessions.map((s) => s.sessionId),
      ['a', 'c'],
    );
    assert.equal(groups[0].name, 'api');
  });

  it('puts sessions without a workspace root in the default project', () => {
    const groups = groupSessions([sess('a', null, '2026-09-14T10:00:00Z')], []);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, '');
    assert.equal(groups[0].folder, null);
    assert.equal(groups[0].name, 'default folder');
  });

  it('keeps saved folders without sessions as empty trailing groups', () => {
    const groups = groupSessions(
      [sess('a', '/Users/demo/shop', '2026-09-14T10:00:00Z')],
      ['/Users/demo/empty2', '/Users/demo/shop', '/Users/demo/empty1'],
    );
    assert.deepEqual(
      groups.map((g) => g.id),
      ['/Users/demo/shop', '/Users/demo/empty2', '/Users/demo/empty1'],
    );
    assert.equal(groups[1].sessions.length, 0);
  });

  it('normalizes trailing slashes so folders never duplicate', () => {
    const groups = groupSessions([sess('a', '/Users/demo/shop/', '2026-09-14T10:00:00Z')], [
      '/Users/demo/shop',
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, '/Users/demo/shop');
    assert.equal(projectName('/Users/demo/shop/'), 'shop');
    assert.equal(projectName(null), 'default folder');
  });
});

describe('project storage', () => {
  function memStore(initial: string | null = null) {
    let value = initial;
    return {
      getItem() {
        return value;
      },
      setItem(_key: string, v: string) {
        value = v;
      },
    };
  }

  it('round-trips folders and collapsed state', () => {
    const store = memStore();
    assert.deepEqual(loadProjects(store), { folders: [], collapsed: {}, hidden: [] });
    saveProjects({ folders: ['/a', '/b'], collapsed: { '/a': true }, hidden: ['/b'] }, store);
    assert.deepEqual(loadProjects(store), {
      folders: ['/a', '/b'],
      collapsed: { '/a': true },
      hidden: ['/b'],
    });
  });

  it('falls back to empty on corrupt or wrong-shaped data', () => {
    const empty: ProjectStore = { folders: [], collapsed: {}, hidden: [] };
    assert.deepEqual(loadProjects(memStore('not json{{{')), empty);
    assert.deepEqual(loadProjects(memStore('{"folders":"nope"}')), empty);
    assert.deepEqual(loadProjects(memStore('{"folders":[],"collapsed":{"a":1}}')), empty);
    assert.deepEqual(
      loadProjects(memStore('{"folders":[],"collapsed":{},"hidden":[1]}')),
      empty,
    );
  });

  it('migrates stores saved before hiding existed', () => {
    assert.deepEqual(loadProjects(memStore('{"folders":["/a"],"collapsed":{}}')), {
      folders: ['/a'],
      collapsed: {},
      hidden: [],
    });
  });

  it('never throws without storage', () => {
    assert.deepEqual(loadProjects(null), { folders: [], collapsed: {}, hidden: [] });
    saveProjects({ folders: ['/a'], collapsed: {}, hidden: [] }, null);
  });
});
