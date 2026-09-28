import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item } from "./api";

/**
 * Shared item store for all views of a workspace. Polls every 4s as the
 * baseline realtime strategy. Every view gets the same optimistic helpers so
 * a change made in the list shows on the board without a refetch.
 *
 * Mutations return the server's copy of the row, which is merged in so
 * derived fields the client did not send (closedAt, updatedAt, position)
 * are correct immediately. A poll that started before the latest mutation
 * is discarded so it cannot overwrite a newer local state.
 */
export function useItems(wsId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const mutationSeq = useRef(0);

  const reload = useCallback(async () => {
    const seqAtStart = mutationSeq.current;
    const rows = await api.items(wsId);
    if (mutationSeq.current === seqAtStart) setItems(rows);
  }, [wsId]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [reload]);

  const merge = useCallback((row: Item) => {
    setItems((prev) => (prev.some((i) => i.id === row.id) ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row]));
  }, []);

  /** Optimistically patch one item locally, persist, then merge the server row. */
  const patch = useCallback(
    (itemId: string, body: Partial<Item>) => {
      mutationSeq.current++;
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...body } : i)));
      return api.updateItem(wsId, itemId, body).then(merge).catch(() => { mutationSeq.current++; return reload(); });
    },
    [wsId, reload, merge],
  );

  const move = useCallback(
    (itemId: string, body: { stageId: string; afterItemId?: string | null; beforeItemId?: string | null }, optimistic: Partial<Item>) => {
      mutationSeq.current++;
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...optimistic } : i)));
      return api.moveItem(wsId, itemId, body).then(merge).catch(() => { mutationSeq.current++; return reload(); });
    },
    [wsId, reload, merge],
  );

  const create = useCallback(
    async (title: string, extra: Partial<Item> = {}) => {
      mutationSeq.current++;
      await api.createItem(wsId, { title, ...extra });
      mutationSeq.current++;
      await reload();
    },
    [wsId, reload],
  );

  return { items, reload, patch, move, create };
}
