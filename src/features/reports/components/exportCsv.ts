import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Bill, ExpenseCategory } from '@/types/domain';

import { buildBillsCsv } from '..';

/** Builds the CSV (with Excel BOM) and hands it to the share sheet on native or downloads it on web. */
export async function exportBillsCsv(bills: Bill[], categories: ExpenseCategory[], fileName: string): Promise<void> {
  const csv = `﻿${buildBillsCsv(bills, categories)}`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
  }
}
