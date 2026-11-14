import { createLocalApi } from './index';
import { migrate } from './migrate';
import { createTestDb } from './testDb';

it('deleteHouse cascades members in SQL, then deletes the house folder', async () => {
  const db = createTestDb();
  await migrate(db);
  const deleteFolder = jest.fn(async () => undefined);
  const api = createLocalApi(db, { deleteFolder });
  await api.createHouse({ id: 'h1', name: 'Piso' });
  await api.deleteHouse({ houseId: 'h1' });
  expect(await db.all('select * from members')).toEqual([]);
  expect(deleteFolder).toHaveBeenCalledWith('houses/h1');
});

it('createHouse is atomic: a duplicate id leaves a single house and member', async () => {
  const db = createTestDb();
  await migrate(db);
  const api = createLocalApi(db);
  await api.createHouse({ id: 'h1', name: 'Piso' });
  await expect(api.createHouse({ id: 'h1', name: 'Otro' })).rejects.toThrow();
  expect(await db.all('select * from members')).toHaveLength(1);
});
