import { createApi } from './api';
import { localApi } from './api/local';
import type { Api } from './api/types';
import { httpApi } from './apiHttp';
import { getAppMode } from './appMode';
import { firestoreApi } from './firestoreApi';
import { USE_API } from './http';

export {
  firestoreApi,
  type BillInput,
  type CategoryInput,
  type CreateHouseInput,
  type HouseWithRole,
  type UpdateHouseInput,
} from './firestoreApi';

/** The data layer the app uses: local mode -> localApi; otherwise the Worker API when EXPO_PUBLIC_API_URL is set (issue #7), Firestore if not. */
export const api: Api = createApi(getAppMode, localApi, USE_API ? httpApi : firestoreApi);
