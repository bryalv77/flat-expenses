import { translate } from '@/i18n/translate';

import { categoryDisplayName, localizeCategoryName } from './suggested';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const es = (key: Parameters<typeof translate>[1]) => translate('es', key);

describe('localizeCategoryName', () => {
  it('shows stored default names in the UI language, whichever language they were saved in', () => {
    expect(localizeCategoryName('Alquiler', en)).toBe('Rent');
    expect(localizeCategoryName('Teléfono', en)).toBe('Phone');
    expect(localizeCategoryName('Electricity', es)).toBe('Luz');
    expect(localizeCategoryName(' loyer ', en)).toBe('Rent');
  });
  it('leaves custom names alone', () => {
    expect(localizeCategoryName('Garaje', en)).toBe('Garaje');
    expect(localizeCategoryName('Rent (garage)', en)).toBe('Rent (garage)');
  });
});

describe('categoryDisplayName', () => {
  const garage = { name: 'Garaje', names: { en: 'Garage', de: 'Garage ' } };
  it("prefers the viewer's own translation and falls back to the stored name", () => {
    expect(categoryDisplayName(garage, 'en', en)).toBe('Garage');
    expect(categoryDisplayName(garage, 'de', en)).toBe('Garage'); // trimmed
    expect(categoryDisplayName(garage, 'fr', en)).toBe('Garaje');
  });
  it("a translation beats the default-category mapping, which still covers untranslated defaults", () => {
    expect(categoryDisplayName({ name: 'Luz', names: { en: 'Power' } }, 'en', en)).toBe('Power');
    expect(categoryDisplayName({ name: 'Luz', names: null }, 'en', en)).toBe('Electricity');
  });
});
