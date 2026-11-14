import { runBillsContract } from '../contract/bills.contract';
import { runCategoriesContract } from '../contract/categories.contract';
import type { ApiFactory } from '../contract/harness';
import { runHousesContract } from '../contract/houses.contract';
import { runPaymentsContract } from '../contract/payments.contract';
import { localApi } from './index';

// Red by design until T4-T7 land; opt in with `pnpm test:local` so the shared branch stays green meanwhile.
const run = process.env.RUN_LOCAL_CONTRACT ? describe : describe.skip;

// T4 replaces this with a factory that builds a fresh in-memory SQLite localApi per test.
const make: ApiFactory = async () => ({ api: localApi, cleanup: async () => undefined, adminProtected: true });

run('localApi contract', () => {
  runHousesContract(make);
  runCategoriesContract(make);
  runBillsContract(make);
  runPaymentsContract(make);
});
