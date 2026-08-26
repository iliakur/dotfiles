export type AsyncQueueTask = () => void | Promise<void>;

interface QueuedTask {
	task: AsyncQueueTask;
	lifecycle: boolean;
}

export interface AsyncQueueSnapshot {
	capacity: number;
	depth: number;
	pending: number;
	running: boolean;
	dropped: number;
}

/**
 * A bounded, serialized queue for best-effort extension work.
 *
 * Admission never starts work inline with a Pi callback. At most one task is
 * running and the total running + pending depth never exceeds capacity.
 */
export class BoundedSerialQueue {
	readonly capacity: number;
	private readonly tasks: QueuedTask[] = [];
	private running = false;
	private scheduled = false;
	private dropped = 0;
	private readonly idleWaiters = new Set<() => void>();

	constructor(capacity: number) {
		if (!Number.isSafeInteger(capacity) || capacity < 1) {
			throw new Error("queue capacity must be a positive integer");
		}
		this.capacity = capacity;
	}

	enqueue(task: AsyncQueueTask): boolean {
		// Keep one slot available for SessionEnd so admitting the terminal
		// event never evicts the newest settled TurnEnd. A capacity-one queue
		// cannot reserve a second slot, but it must still admit one ordinary task.
		const ordinaryCapacity = Math.max(1, this.capacity - 1);
		if (this.depth() >= ordinaryCapacity) {
			this.dropped++;
			return false;
		}
		this.tasks.push({ task, lifecycle: false });
		this.schedule();
		return true;
	}

	/**
	 * Admit ordered lifecycle work without letting ordinary message/tool volume
	 * starve it. At capacity, replace only the newest pending ordinary task;
	 * lifecycle tasks never evict one another.
	 */
	enqueueLifecycle(task: AsyncQueueTask): boolean {
		if (this.depth() >= this.capacity) {
			let ordinary = -1;
			for (let i = this.tasks.length - 1; i >= 0; i--) {
				if (!this.tasks[i].lifecycle) {
					ordinary = i;
					break;
				}
			}
			if (ordinary < 0) {
				this.dropped++;
				return false;
			}
			this.tasks.splice(ordinary, 1);
			this.dropped++;
		}
		this.tasks.push({ task, lifecycle: true });
		this.schedule();
		return true;
	}

	/**
	 * Terminal work has the highest pending priority. If lifecycle work already
	 * fills the queue, replace the newest pending item so SessionEnd is retained.
	 */
	enqueueTerminal(task: AsyncQueueTask): boolean {
		if (this.depth() >= this.capacity) {
			if (this.tasks.length === 0) {
				this.dropped++;
				return false;
			}
			let replacement = -1;
			for (let i = this.tasks.length - 1; i >= 0; i--) {
				if (!this.tasks[i].lifecycle) {
					replacement = i;
					break;
				}
			}
			if (replacement >= 0) this.tasks.splice(replacement, 1);
			else this.tasks.pop();
			this.dropped++;
		}
		this.tasks.push({ task, lifecycle: true });
		this.schedule();
		return true;
	}

	snapshot(): AsyncQueueSnapshot {
		return {
			capacity: this.capacity,
			depth: this.depth(),
			pending: this.tasks.length,
			running: this.running,
			dropped: this.dropped,
		};
	}

	async drain(timeoutMs: number): Promise<boolean> {
		if (this.depth() === 0) return true;
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return false;

		return await new Promise<boolean>((resolve) => {
			let settled = false;
			const finish = (drained: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.idleWaiters.delete(onIdle);
				resolve(drained);
			};
			const onIdle = () => finish(true);
			const timer = setTimeout(() => finish(false), timeoutMs);
			this.idleWaiters.add(onIdle);
		});
	}

	/**
	 * At shutdown, discard pending best-effort ordinary work so admitted
	 * lifecycle events run immediately after the one in-flight helper.
	 */
	async drainLifecycle(timeoutMs: number, ordinaryGraceMs = 50): Promise<boolean> {
		const startedAt = Date.now();
		const graceMs = Math.min(timeoutMs, Math.max(0, ordinaryGraceMs));
		if (graceMs > 0 && await this.drain(graceMs)) return true;

		const retained = this.tasks.filter((queued) => queued.lifecycle);
		this.dropped += this.tasks.length - retained.length;
		this.tasks.splice(0, this.tasks.length, ...retained);
		const remainingMs = timeoutMs - (Date.now() - startedAt);
		return await this.drain(remainingMs);
	}

	private depth(): number {
		return this.tasks.length + (this.running ? 1 : 0);
	}

	private schedule(): void {
		if (this.running || this.scheduled || this.tasks.length === 0) return;
		this.scheduled = true;
		setTimeout(() => {
			this.scheduled = false;
			void this.runNext();
		}, 0);
	}

	private async runNext(): Promise<void> {
		if (this.running) return;
		const queued = this.tasks.shift();
		if (!queued) {
			this.notifyIdle();
			return;
		}

		this.running = true;
		try {
			await queued.task();
		} catch {
			// Capture is best-effort; one failed task must not poison the queue.
		} finally {
			this.running = false;
			if (this.tasks.length === 0) this.notifyIdle();
			else this.schedule();
		}
	}

	private notifyIdle(): void {
		if (this.depth() !== 0) return;
		for (const waiter of this.idleWaiters) waiter();
		this.idleWaiters.clear();
	}
}
