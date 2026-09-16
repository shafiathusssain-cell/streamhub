import { useCallback, useEffect, useState } from 'react';
import {
  OfflineItem,
  collectBlobIds,
  deleteOfflineItem,
  idbDeleteBlob,
  loadOfflineItems,
  saveOfflineItem,
} from '@/lib/offline';

export function useOfflineLibrary() {
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    setItems(loadOfflineItems());
  }, [epoch]);

  const addItem = useCallback((item: OfflineItem) => {
    saveOfflineItem(item);
    setEpoch((value) => value + 1);
  }, []);

  const removeItem = useCallback(async (key: string) => {
    const target = loadOfflineItems().find((item) => item.key === key);
    deleteOfflineItem(key);
    if (target) {
      for (const blobId of collectBlobIds(target)) {
        try {
          await idbDeleteBlob(blobId);
        } catch {
          // blob cleanup is best-effort
        }
      }
    }
    setEpoch((value) => value + 1);
  }, []);

  const isSaved = useCallback(
    (key: string) => items.some((item) => item.key === key),
    [items]
  );

  const reload = useCallback(() => setEpoch((value) => value + 1), []);

  return { items, addItem, removeItem, isSaved, reload };
}