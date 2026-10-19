import { monotonicFactory } from 'ulid';

const factory = monotonicFactory();

/** Sortable, monotonic ULID (D-06). */
export function newId(): string {
  return factory();
}
