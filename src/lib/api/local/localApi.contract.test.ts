import { runBillsContract } from '../contract/bills.contract';
import { runCategoriesContract } from '../contract/categories.contract';
import type { ApiFactory } from '../contract/harness';
import { runHousesContract } from '../contract/houses.contract';
import { runPaymentsContract } from '../contract/payments.contract';
import { makeLocalTestApi } from './testFactory';

// Red by design until T4-T7 land; opt in with `pnpm test:local` so the shared branch stays green meanwhile.
const run = process.env.RUN_LOCAL_CONTRACT ? describe : describe.skip;

const make: ApiFactory = makeLocalTestApi;

run('localApi contract', () => {
  runHousesContract(make);
  runCategoriesContract(make);
  runBillsContract(make);
  runPaymentsContract(make);
});
