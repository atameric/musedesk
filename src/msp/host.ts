import { ChildProcess, spawn } from 'node:child_process';
import type { InitializeResult } from './msp';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** One decoded server→client JSON-RPC notification (method + params, no id). */
export interface MspEvent {
  method: string;
  params?: unknown;
}

/** Test seam: everything managers need from an MSP connection. */
export interface IMspClient {
  readonly connected: boolean;
  readonly initializeResult: InitializeResult | null;
  /** Bounded tail of host stderr; empty when the host never complained. */
  readonly stderrTail: string;
  connect(): Promise<InitializeResult>;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onNotification(fn: (n: MspEvent) => void): () => void;
  close(): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Minimal MSP (JSON-RPC 2.0, newline-delimited) client over `muse serve` stdio.
 * Handshake: initialize -> initialized notification -> commands.
 */
export class MspHost implements IMspClient {
  private child: ChildProcess | null = null;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private notifHandlers = new Set<(n: MspEvent) => void>();
  private exitError: Error | null = null;
  private errBuf = '';
  public initializeResult: InitializeResult | null = null;

  constructor(
    private readonly binPath: string,
    private readonly clientName = 'musedesk',
    private readonly clientVersion = '1.0.0',
    private readonly serveArgs: string[] = [],
    private readonly spawnArgv?: string[],
  ) {}

  get stderrTail(): string {
    return this.errBuf;
  }

  async connect(): Promise<InitializeResult> {
    this.child = spawn(this.binPath, this.spawnArgv ?? ['serve', ...this.serveArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const onErr = (e: Error) => reject(e);
      this.child!.once('error', onErr);
      this.child!.once('spawn', () => {
        this.child!.off('error', onErr);
        resolve();
      });
    });
    this.child.stdout!.on('data', (d: Buffer) => this.onData(d.toString()));
    this.child.stderr!.on('data', (d: Buffer) => {
      this.errBuf = (this.errBuf + d.toString()).slice(-2048);
    });
    this.child.on('exit', (code, signal) => {
      const err = new Error(`muse serve exited code=${code} signal=${signal}`);
      this.exitError = err;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });
    const result = (await this.request('initialize', {
      clientInfo: { name: this.clientName, title: 'MuseDesk', version: this.clientVersion },
    })) as InitializeResult;
    this.send({ jsonrpc: '2.0', method: 'initialized', params: {} });
    this.initializeResult = result;
    return result;
  }

  onNotification(fn: (n: MspEvent) => void): () => void {
    this.notifHandlers.add(fn);
    return () => {
      this.notifHandlers.delete(fn);
    };
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.child || this.exitError) return Promise.reject(this.exitError ?? new Error('host not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MSP request ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  get connected(): boolean {
    return !!this.child && !this.exitError;
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  private send(frame: Record<string, unknown>): void {
    this.child!.stdin!.write(JSON.stringify(frame) + '\n');
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string; data?: unknown } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // never let a malformed line kill the stream
      }
      if (msg.method) {
        const n = { method: msg.method, params: msg.params };
        for (const fn of this.notifHandlers) {
          try {
            fn(n);
          } catch {
            /* handler errors must not break dispatch */
          }
        }
        continue;
      }
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`MSP ${JSON.stringify(msg.error).slice(0, 300)}`));
        else p.resolve(msg.result);
      }
    }
  }
}
