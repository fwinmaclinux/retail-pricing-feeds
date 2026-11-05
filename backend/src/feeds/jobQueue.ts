/**
 * Work queue for feed ingestion. Production: SQS (with a dead-letter queue) consumed by an
 * autoscaled worker deployment, scaled on queue depth. Local: an in-process queue with the
 * same at-least-once contract - handlers must be idempotent.
 */
export interface JobQueue {
  enqueue(feedId: string): void;
  onIdle(): Promise<void>;
}

export class InProcessJobQueue implements JobQueue {
  private readonly pending: string[] = [];
  private readonly inFlight = new Set<string>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly handler: (feedId: string) => Promise<void>,
    private readonly concurrency: number,
    private readonly onError: (feedId: string, err: unknown) => void,
  ) {}

  enqueue(feedId: string): void {
    if (this.inFlight.has(feedId) || this.pending.includes(feedId)) return;
    this.pending.push(feedId);
    this.drain();
  }

  onIdle(): Promise<void> {
    if (this.pending.length === 0 && this.inFlight.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private drain(): void {
    while (this.inFlight.size < this.concurrency && this.pending.length > 0) {
      const feedId = this.pending.shift()!;
      this.inFlight.add(feedId);
      // Defer so the HTTP response that enqueued the job is sent first.
      setImmediate(() => {
        this.handler(feedId)
          .catch((err) => this.onError(feedId, err))
          .finally(() => {
            this.inFlight.delete(feedId);
            this.drain();
            if (this.pending.length === 0 && this.inFlight.size === 0) {
              const waiters = this.idleWaiters;
              this.idleWaiters = [];
              waiters.forEach((w) => w());
            }
          });
      });
    }
  }
}
