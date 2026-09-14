import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { probeCliArch, type ExecFn } from '../../src/msp/arch';

// Hermetic: fixtures live under temp dirs and probe tools are stubbed, so
// the machine's real `muse` install and lipo/file binaries cannot affect
// results. `platform: 'darwin'` is injected to run on any OS.
describe('CLI arch probe', () => {
  let dir = '';

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'muse-arch-'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, content: string): string {
    const file = path.join(dir, name);
    writeFileSync(file, content);
    chmodSync(file, 0o755);
    return file;
  }

  function fakeExec(outputs: Record<string, string>, opts?: { lipoFails?: boolean }): ExecFn {
    return (cmd, args) => {
      const file = args[args.length - 1];
      if (cmd === 'lipo' && opts?.lipoFails) return { status: 1, stdout: '' };
      return { status: 0, stdout: outputs[`${cmd}:${file}`] ?? '' };
    };
  }

  it("returns 'unknown' off macOS without touching the disk", () => {
    const exec: ExecFn = () => {
      throw new Error('must not probe off-platform');
    };
    assert.equal(probeCliArch('/nonexistent/muse', { platform: 'linux', exec }), 'unknown');
  });

  it('classifies a direct binary from lipo output', () => {
    const bin = write('muse-direct', 'fake-macho-bytes');
    const outputs: Record<string, string> = {};
    outputs[`lipo:${bin}`] = 'arm64';
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec: fakeExec(outputs) }), 'arm64');
    outputs[`lipo:${bin}`] = 'x86_64';
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec: fakeExec(outputs) }), 'x86_64');
    outputs[`lipo:${bin}`] = 'x86_64 arm64';
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec: fakeExec(outputs) }), 'universal');
  });

  it('falls back to `file` when lipo is unusable', () => {
    const bin = write('muse-nolipo', 'fake-macho-bytes');
    const outputs: Record<string, string> = {};
    outputs[`file:${bin}`] = 'Mach-O 64-bit executable x86_64';
    const exec = fakeExec(outputs, { lipoFails: true });
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec }), 'x86_64');
    outputs[`file:${bin}`] = 'Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64:Mach-O 64-bit executable arm64]';
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec }), 'universal');
    outputs[`file:${bin}`] = 'ASCII text';
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec }), 'unknown');
  });

  it('resolves a launcher script to its .muse-version payload', () => {
    const launcher = write('muse', '#!/usr/bin/env bash\necho hi\n');
    write('.muse-version', '1.2.1-R2847.1\n');
    const payload = write('muse-bin-1.2.1-R2847.1', 'fake-macho-bytes');
    const outputs: Record<string, string> = {};
    outputs[`lipo:${payload}`] = 'arm64';
    assert.equal(probeCliArch(launcher, { platform: 'darwin', exec: fakeExec(outputs) }), 'arm64');
  });

  it('distrusts a malformed .muse-version and scans siblings instead', () => {
    const sub = path.join(dir, 'untrusted');
    mkdirSync(sub, { recursive: true });
    const launcher = path.join(sub, 'muse');
    writeFileSync(launcher, '#!/bin/sh\necho hi\n');
    chmodSync(launcher, 0o755);
    writeFileSync(path.join(sub, '.muse-version'), '../../evil\n');
    const payload = path.join(sub, 'muse-bin-9.9.9-R1');
    writeFileSync(payload, 'fake-macho-bytes');
    chmodSync(payload, 0o755);
    const outputs: Record<string, string> = {};
    outputs[`lipo:${payload}`] = 'x86_64';
    // No path traversal: the evil version never resolves, the real sibling does.
    assert.equal(probeCliArch(launcher, { platform: 'darwin', exec: fakeExec(outputs) }), 'x86_64');
  });

  it('flags Intel when any sibling payload is Intel-only', () => {
    const sub = path.join(dir, 'mixed');
    mkdirSync(sub, { recursive: true });
    const launcher = path.join(sub, 'muse');
    writeFileSync(launcher, '#!/bin/sh\necho hi\n');
    chmodSync(launcher, 0o755);
    const native = path.join(sub, 'muse-bin-1.2.1-R2847.1');
    const stale = path.join(sub, 'muse-bin-1.0.0-R100');
    writeFileSync(native, 'fake-macho-bytes');
    writeFileSync(stale, 'fake-macho-bytes');
    const outputs: Record<string, string> = {};
    outputs[`lipo:${native}`] = 'arm64';
    outputs[`lipo:${stale}`] = 'x86_64';
    assert.equal(probeCliArch(launcher, { platform: 'darwin', exec: fakeExec(outputs) }), 'x86_64');
  });

  it('never throws: missing paths and tool failures yield unknown', () => {
    const failing: ExecFn = () => null;
    assert.equal(
      probeCliArch(path.join(dir, 'does-not-exist'), { platform: 'darwin', exec: failing }),
      'unknown',
    );
    const bin = write('muse-notools', 'fake-macho-bytes');
    assert.equal(probeCliArch(bin, { platform: 'darwin', exec: failing }), 'unknown');
    const lonely = path.join(dir, 'lonely');
    mkdirSync(lonely, { recursive: true });
    const script = path.join(lonely, 'muse');
    writeFileSync(script, '#!/bin/sh\necho hi\n');
    assert.equal(probeCliArch(script, { platform: 'darwin', exec: failing }), 'unknown');
  });
});
