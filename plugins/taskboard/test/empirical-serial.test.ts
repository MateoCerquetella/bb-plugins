import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmpiricalObservationQueue } from '../empirical/serial.ts';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test('serializes observations for one ticket while allowing other tickets to proceed', async () => {
  const queue = createEmpiricalObservationQueue();
  const firstGate = deferred();
  const order: string[] = [];
  const first = queue('ticket-a', async () => {
    order.push('first start');
    await firstGate.promise;
    order.push('first end');
  });
  const second = queue('ticket-a', async () => {
    order.push('second start');
  });
  const other = queue('ticket-b', async () => {
    order.push('other start');
  });
  await other;
  assert.deepEqual(order, ['first start', 'other start']);
  firstGate.release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first start', 'other start', 'first end', 'second start']);
});

test('a failed observation does not prevent a later refresh', async () => {
  const queue = createEmpiricalObservationQueue();
  await assert.rejects(queue('ticket-a', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await queue('ticket-a', async () => 'reconnected'), 'reconnected');
});
