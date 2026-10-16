import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { cityBloxxResources } from '../../../common/city-bloxx-resources';

interface Job {
  message: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
  worker?: Worker;
  done?: boolean;
}

export function gameError(
  status: number,
  errorCode: string,
  message: string,
  extra = {},
) {
  return new HttpException({ errorCode, message, ...extra }, status);
}

// Two isolated workers, twenty queued jobs; deadline includes queue time.
@Injectable()
export class GameWorkerService implements OnModuleDestroy {
  private readonly jobs = new Set<Job>();
  private readonly queue: Job[] = [];
  private active = 0;
  private stopped = false;
  available() {
    return this.stopped ? 0 : Math.max(0, 22 - this.jobs.size);
  }
  run<T>(message: Record<string, unknown>): Promise<T> {
    if (this.stopped || (this.active >= 2 && this.queue.length >= 20))
      return Promise.reject(
        gameError(503, 'GAME_WORKER_UNAVAILABLE', 'Save validation busy; retry later'),
      );
    return new Promise<T>((resolve, reject) => {
      const job: Job = { message, resolve: resolve as (value: unknown) => void, reject };
      this.jobs.add(job);
      job.timer = setTimeout(
        () =>
          this.finish(
            job,
            gameError(
              503,
              'GAME_WORKER_UNAVAILABLE',
              'Save validation deadline exceeded',
            ),
          ),
        5000,
      );
      this.queue.push(job);
      this.drain();
    });
  }
  private drain() {
    while (!this.stopped && this.active < 2 && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      try {
        job.worker = new Worker(join(cityBloxxResources, 'worker.cjs'), {
          resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
        });
        job.worker.once(
          'message',
          (reply: { ok: boolean; result: unknown; errorCode: string }) => {
            if (reply.ok) this.finish(job, undefined, reply.result);
            else
              this.finish(
                job,
                gameError(
                  reply.errorCode === 'GAME_RUN_VERSION_UNAVAILABLE'
                    ? 503
                    : reply.errorCode === 'GAME_SAVE_TOO_LARGE'
                      ? 413
                      : reply.errorCode === 'GAME_SAVE_INCOMPATIBLE'
                        ? 409
                        : 422,
                  reply.errorCode,
                  'Save rejected; original snapshot preserved',
                ),
              );
          },
        );
        job.worker.once('error', () =>
          this.finish(
            job,
            gameError(503, 'GAME_WORKER_UNAVAILABLE', 'Save validation unavailable'),
          ),
        );
        job.worker.once('exit', () =>
          this.finish(
            job,
            gameError(503, 'GAME_WORKER_UNAVAILABLE', 'Save validation interrupted'),
          ),
        );
        job.worker.postMessage({ id: 'job', ...job.message });
      } catch {
        this.finish(
          job,
          gameError(503, 'GAME_WORKER_UNAVAILABLE', 'Save validation unavailable'),
        );
      }
    }
  }
  private finish(job: Job, error?: Error, value?: unknown) {
    if (job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    this.jobs.delete(job);
    if (job.worker) {
      // Free the slot only after termination, so deadlines cannot exceed the worker cap.
      void job.worker.terminate().finally(() => {
        this.active--;
        this.drain();
      });
    } else {
      const index = this.queue.indexOf(job);
      if (index >= 0) this.queue.splice(index, 1);
      // Constructor failure occupied a slot without producing a worker.
      else this.active--;
    }
    if (error) job.reject(error);
    else job.resolve(value);
    this.drain();
  }
  onModuleDestroy() {
    this.stopped = true;
    for (const job of this.jobs)
      this.finish(
        job,
        gameError(503, 'GAME_WORKER_UNAVAILABLE', 'Save validation shutting down'),
      );
  }
}
