import { runBillsContract } from '../contract/bills.contract';
import { runCategoriesContract } from '../contract/categories.contract';
import type { ApiFactory } from '../contract/harness';
import { runHousesContract } from '../contract/houses.contract';
import { runPaymentsContract } from '../contract/payments.contract';
import { makeLocalTestApi } from './testFactory';

const make: ApiFactory = makeLocalTestApi;

describe('localApi contract', () => {
  runHousesContract(make);
  runCategoriesContract(make);
  runBillsContract(make);
  runPaymentsContract(make);
});
