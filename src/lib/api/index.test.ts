import { createApi } from './index';
import type { Api } from './types';

type Fn = (v?: unknown) => Promise<string>;

describe('createApi', () => {
  const cloud = { listCategories: jest.fn(async () => 'cloud') } as unknown as Api;
  const local = { listCategories: jest.fn(async () => 'local') } as unknown as Api;

  it('delegates to the cloud backend unless the mode is local, resolving the mode per call', async () => {
    let mode: 'local' | 'cloud' = 'cloud';
    const api = createApi(() => mode, local, cloud);
    expect(await (api.listCategories as unknown as Fn)()).toBe('cloud');
    mode = 'local';
    expect(await (api.listCategories as unknown as Fn)()).toBe('local');
  });

  it('passes arguments through untouched', async () => {
    const api = createApi(() => 'cloud', local, cloud);
    await (api.listCategories as unknown as Fn)({ houseId: 'h' });
    expect(cloud.listCategories).toHaveBeenCalledWith({ houseId: 'h' });
  });
});
