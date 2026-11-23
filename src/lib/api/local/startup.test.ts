import { migrate } from './migrate';
import { sweepLocalOrphans } from './startup';
import { createTestDb } from './testDb';

jest.mock('../../fileStore', () => ({ getFileStore: jest.fn() }));

describe('sweepLocalOrphans', () => {
  it('deletes listed files that no bill references', async () => {
    const db = createTestDb();
    await migrate(db);
    const deleted: string[] = [];
    await sweepLocalOrphans({
      getDb: async () => db,
      list: async () => ['houses/h/orphan.png'],
      remove: async (p) => void deleted.push(p),
    });
    expect(deleted).toEqual(['houses/h/orphan.png']);
  });

  it('never throws when anything fails', async () => {
    await expect(
      sweepLocalOrphans({ getDb: async () => { throw new Error('boom'); }, list: async () => [], remove: async () => undefined }),
    ).resolves.toBeUndefined();
  });
});
