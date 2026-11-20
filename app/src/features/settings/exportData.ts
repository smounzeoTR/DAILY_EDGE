// Export of all the user's data: JSON file written to the cache, then the share sheet.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportMyData } from '@/lib/queries';

export async function exportAndShare(): Promise<void> {
  const json = await exportMyData();
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `daily-edge-export-${date}.json`);
  await file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
  }
}
