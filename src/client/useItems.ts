import { useCallback, useEffect, useState } from "react";
import { api, type Item } from "./api";

/**
 * Shared item store for all views of a workspace. Polls every 4s as the
 * baseline realtime strategy. Every view gets the same optimistic helpers so
 * a change made in the list shows on the board without a refetch.
 */
export function useItems(wsId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const reload = useCallback(() => api.items(wsId).then(setItems), [wsId]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [reload]);

  /** Optimistically patch one item locally, persist, and refetch on failure. */
  const patch = useCallback(
    (itemId: string, body: Partial<Item>) => {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...body } : i)));
      return api.updateItem(wsId, itemId, body).catch(reload);
    },
    [wsId, reload],
  );

  const create = useCallback(
    async (title: string, extra: Partial<Item> = {}) => {
      await api.createItem(wsId, { title, ...extra });
      await reload();
    },
    [wsId, reload],
  );

  return { items, setItems, reload, patch, create };
}
