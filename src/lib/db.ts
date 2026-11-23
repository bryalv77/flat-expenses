import { createApi } from './api';
import { localApi } from './api/local';
import type { Api } from './api/types';
import { httpApi } from './apiHttp';
import { getAppMode } from './appMode';

export type { BillInput, CategoryInput, CreateHouseInput, HouseWithRole, UpdateHouseInput } from './api/types';

/** The data layer the app uses: local mode -> localApi (SQLite); cloud mode -> the Worker API. */
export const api: Api = createApi(getAppMode, localApi, httpApi);
