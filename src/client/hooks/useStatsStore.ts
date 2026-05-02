import { createContext, useContext, useSyncExternalStore, useCallback } from "react";
import type { Stats } from "../../shared/types";

type Listener = () => void;

export interface StatsStore {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => Map<string, Stats>;
  getNodeSnapshot: (uid: string) => Stats | undefined;
  update: (statsMap: Map<string, Stats>) => void;
  /** Internal version per node — used by useNodeStats to detect changes */
  _nodeVersions: Map<string, number>;
  _globalVersion: number;
}

export function createStatsStore(): StatsStore {
  let current = new Map<string, Stats>();
  const listeners = new Set<Listener>();
  const nodeVersions = new Map<string, number>();
  let globalVersion = 0;

  function notify() {
    for (const l of listeners) l();
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return current;
    },
    getNodeSnapshot(uid: string) {
      return current.get(uid);
    },
    update(statsMap: Map<string, Stats>) {
      let changed = false;
      for (const [key, value] of statsMap) {
        const existing = current.get(key);
        if (!existing || existing.cpu !== value.cpu || existing.mem_mb !== value.mem_mb) {
          current.set(key, value);
          nodeVersions.set(key, (nodeVersions.get(key) || 0) + 1);
          changed = true;
        }
      }
      if (changed) {
        current = new Map(current);
        globalVersion++;
        notify();
      }
    },
    _nodeVersions: nodeVersions,
    _globalVersion: globalVersion,
  };
}

export const StatsStoreContext = createContext<StatsStore | null>(null);

/**
 * Subscribe to stats for a single node — only re-renders when THAT node's stats change.
 */
export function useNodeStats(uid: string): Stats | undefined {
  const store = useContext(StatsStoreContext);
  if (!store) throw new Error("useNodeStats must be used within StatsStoreContext.Provider");

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store]
  );

  // Snapshot returns a value that changes identity only when this node's stats change
  const getSnapshot = useCallback(() => {
    const version = store._nodeVersions.get(uid) || 0;
    const stats = store.getNodeSnapshot(uid);
    // Return a stable reference: version acts as the cache key for useSyncExternalStore
    return { version, stats };
  }, [store, uid]);

  // useSyncExternalStore compares by Object.is, so we need a ref-stable approach
  // We use a wrapper that caches the result object when version hasn't changed
  const cached = useSyncExternalStoreWithNodeCache(subscribe, store, uid);
  return cached;
}

// Internal helper: caches snapshot per uid so useSyncExternalStore sees stable refs
const nodeSnapshotCaches = new WeakMap<
  StatsStore,
  Map<string, { version: number; stats: Stats | undefined }>
>();

function useSyncExternalStoreWithNodeCache(
  subscribe: (cb: () => void) => () => void,
  store: StatsStore,
  uid: string
): Stats | undefined {
  const getSnapshot = useCallback(() => {
    if (!nodeSnapshotCaches.has(store)) {
      nodeSnapshotCaches.set(store, new Map());
    }
    const cache = nodeSnapshotCaches.get(store)!;
    const currentVersion = store._nodeVersions.get(uid) || 0;
    const cached = cache.get(uid);

    if (cached && cached.version === currentVersion) {
      return cached;
    }

    const entry = { version: currentVersion, stats: store.getNodeSnapshot(uid) };
    cache.set(uid, entry);
    return entry;
  }, [store, uid]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  return snapshot.stats;
}

/**
 * Subscribe to the full stats map — re-renders on ANY stats change.
 * Use sparingly (e.g., for total resource display in header).
 */
export function useAllStats(): Map<string, Stats> {
  const store = useContext(StatsStoreContext);
  if (!store) throw new Error("useAllStats must be used within StatsStoreContext.Provider");

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store]
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
