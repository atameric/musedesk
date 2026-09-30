import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, conversationRows } from '../../src/shared/turnMeta';
import { dayLabel, likeKey, loadLikes, saveLikes, shortCliVersion } from '../../src/shared/uiState';
import { createTranscriptStore, type FoldedItem } from '../../src/msp/transcript';
import type { Item } from '../../src/msp/msp';
const item = (id: string, kind: string, turnId = 't1', overrides: Partial<FoldedItem> = {}): FoldedItem => ({ itemId: id, kind, turnId, status: 'completed', terminal: true, revision: 1, text: id, summary: [], outputText: '', retracted: false, ...overrides });
describe('polished conversation', () => {
  it('collects interleaved reasoning and tools once without moving a user steer or losing unknown items', () => {
    const rows = conversationRows([item('user','userMessage'),item('r','reasoning'),item('a','agentMessage'),item('tool1','toolCall'),item('steer','userMessage'),item('tool2','toolCall'),item('unknown','futureKind'),item('b','agentMessage'),item('u2','userMessage','t2'),item('c','agentMessage','t2')]);
    assert.deepEqual(rows.map(row => row.type), ['single','response','single','response','single','response']);
    const first = rows[1], after = rows[3];
    assert.equal(first.type,'response'); assert.equal(after.type,'response');
    if (first.type !== 'response' || after.type !== 'response') return;
    assert.deepEqual(first.activity.map(i => i.itemId),['r','tool1','tool2']);
    assert.deepEqual(first.items.map(i => i.itemId),['a']);
    assert.deepEqual(after.items.map(i => i.itemId),['unknown','b']);
    assert.equal(after.activity.length,0); assert.equal(after.lastResponse,true);
  });
  it('never claims success for running, failed, stopped or unknown tools', () => {
    assert.equal(activitySummary([item('t','toolCall')]).state,'completed');
    assert.equal(activitySummary([item('t','toolCall','t1',{status:'inProgress',terminal:false})]).state,'running');
    assert.equal(activitySummary([item('t','toolCall','t1',{status:'rejected'})]).state,'error');
    assert.equal(activitySummary([item('t','toolCall')],'failed').label,'İşlem başarısız oldu');
    assert.equal(activitySummary([item('t','toolCall')],'cancelled').state,'stopped');
    assert.equal(activitySummary([item('t','toolCall','t1',{status:'inProgress',terminal:false})],'offline').state,'offline');
    assert.equal(activitySummary([item('t','toolCall','t1',{status:'inProgress',terminal:false})],'offline').label,'Bağlantı kesildi');
    assert.equal(activitySummary([item('t','toolCall','t1',{status:'futureTerminal'})]).state,'unknown');
  });
  it('keeps server timestamps and measured durations through history and completion', () => {
    const store = createTranscriptStore();
    const recordedAt = '2026-09-29T12:00:00Z';
    store.seed([{ itemId:'a',kind:'agentMessage',status:'completed',revision:1,recordedAt } as Item]);
    assert.equal(store.snapshot().items[0].recordedAt,recordedAt);
    store.apply('turn/completed',{turnId:'t',terminal:'completed',durationMs:12500});
    assert.equal(store.snapshot().turns.t.durationMs,12500);
    store.apply('turn/completed',{turnId:'unmeasured',terminal:'completed'});
    assert.equal(store.snapshot().turns.unmeasured.durationMs,undefined);
    store.apply('turn/completed',{turnId:'bad',terminal:'failed',durationMs:-1});
    assert.equal(store.snapshot().turns.bad.durationMs,undefined);
    store.seed([{itemId:'bad-clock',kind:'agentMessage',status:'completed',revision:1,recordedAt:'invalid'} as Item]);
    assert.equal(store.snapshot().items[1].recordedAt,undefined);
  });
});
describe('local display preferences', () => {
  it('bounds and isolates reversible likes and tolerates corrupt or denied storage', () => {
    let value = 'invalid'; const storage = {getItem: () => value,setItem: (_: string, next: string) => { value = next; }};
    assert.deepEqual(loadLikes(storage),[]);
    const a = likeKey('a','reply'), b = likeKey('b','reply'); assert.notEqual(a,b);
    saveLikes([a,b,a],storage); assert.deepEqual(loadLikes(storage),[a,b]);
    saveLikes(loadLikes(storage).filter(k => k !== a),storage); assert.deepEqual(loadLikes(storage),[b]);
    saveLikes(Array.from({length:1100},(_,i) => String(i)),storage); assert.equal(loadLikes(storage).length,1000);
    const denied = {getItem: () => { throw new Error('denied'); },setItem: () => { throw new Error('denied'); }};
    assert.deepEqual(loadLikes(denied),[]); assert.doesNotThrow(() => saveLikes([a],denied));
  });
  it('uses local calendar dates, including across a month boundary', () => {
    const now = new Date(2026,9,1,0,15);
    assert.equal(dayLabel(new Date(2026,9,1,0,1).toISOString(),now),'Today');
    assert.equal(dayLabel(new Date(2026,8,30,23,58).toISOString(),now),'Yesterday');
    assert.equal(dayLabel('bad',now),null);
    assert.equal(shortCliVersion('Muse Code 1.4.1 (1.4.1-R4503.1)'),'Muse Code 1.4.1');
  });
});
