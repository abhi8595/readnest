import { create } from 'zustand';
import type { BookRow, CollectionRow } from '@/db/schema';
import { booksInCollection, countBooks, listBooks, listBooksPaged, listCollections, LIBRARY_PAGE_SIZE } from '@/db/repositories';
import type { SortKey } from './useSettingsStore';

export const sortKeyToOrder: Record<SortKey, string> = {
  last_read: 'last_read_at DESC',
  added: 'date_added DESC',
  title: 'title ASC',
  author: 'author ASC',
  size: 'file_size DESC',
  modified: 'date_modified DESC',
};

interface LibraryState {
  books: BookRow[];
  collections: (CollectionRow & { count: number })[];
  collectionBooks: Record<string, BookRow[]>;
  loading: boolean;
  scanning: boolean;
  scanProgress: { done: number; total: number; current: string | null };
  lastError: string | null;
  // F1 — paged loading for 5000+ book libraries
  totalCount: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  refresh: (sortKey?: SortKey) => Promise<void>;
  loadMore: (sortKey?: SortKey) => Promise<void>;
  refreshCollections: () => Promise<void>;
  loadCollectionBooks: (id: string) => Promise<void>;
  setScanning: (v: boolean, p?: LibraryState['scanProgress']) => void;
  setError: (e: string | null) => void;
}

async function orderBooks(books: BookRow[], sortKey: SortKey): Promise<BookRow[]> {
  const arr = [...books];
  switch (sortKey) {
    case 'last_read': return arr.sort((a, b) => (b.last_read_at ?? 0) - (a.last_read_at ?? 0) || b.date_added - a.date_added);
    case 'title': return arr.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    case 'author': return arr.sort((a, b) => (a.author ?? '~~~').localeCompare(b.author ?? '~~~'));
    case 'size': return arr.sort((a, b) => b.file_size - a.file_size);
    case 'modified': return arr.sort((a, b) => b.date_modified - a.date_modified);
    default: return arr.sort((a, b) => b.date_added - a.date_added);
  }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  collections: [],
  collectionBooks: {},
  loading: false,
  scanning: false,
  scanProgress: { done: 0, total: 0, current: null },
  lastError: null,
  totalCount: null,
  hasMore: false,
  loadingMore: false,
  refresh: async (sortKey = 'added') => {
    set({ loading: true });
    try {
      const order = sortKeyToOrder[sortKey] ?? 'date_added DESC';
      // Small libraries: single query (old path). Large libraries: first page
      // + total count so the list can grow via loadMore() without jank/OOM.
      const [total, first] = await Promise.all([countBooks(), listBooksPaged(order, LIBRARY_PAGE_SIZE, 0)]);
      const sorted = await orderBooks(first, sortKey);
      // If the library fits in one page, fall back to the full list so sort
      // order matches the legacy path exactly.
      if (total <= LIBRARY_PAGE_SIZE) {
        const books = await listBooks(order);
        set({
          books: await orderBooks(books, sortKey),
          totalCount: total, hasMore: false, loadingMore: false,
          loading: false, lastError: null,
        });
      } else {
        set({
          books: sorted, totalCount: total,
          hasMore: first.length >= LIBRARY_PAGE_SIZE,
          loadingMore: false, loading: false, lastError: null,
        });
      }
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'Failed to load library' });
    }
  },
  loadMore: async (sortKey = 'added') => {
    const { books, hasMore, loadingMore, loading } = get();
    if (!hasMore || loadingMore || loading) return;
    set({ loadingMore: true });
    try {
      const order = sortKeyToOrder[sortKey] ?? 'date_added DESC';
      const next = await listBooksPaged(order, LIBRARY_PAGE_SIZE, books.length);
      const merged = [...books, ...next];
      set({
        books: await orderBooks(merged, sortKey),
        hasMore: next.length >= LIBRARY_PAGE_SIZE,
        loadingMore: false,
      });
    } catch {
      set({ loadingMore: false });
    }
  },
  refreshCollections: async () => {
    try {
      set({ collections: await listCollections() });
    } catch { /* non-fatal */ }
  },
  loadCollectionBooks: async (id) => {
    try {
      const books = await booksInCollection(id);
      set({ collectionBooks: { ...get().collectionBooks, [id]: books } });
    } catch { /* non-fatal */ }
  },
  setScanning: (v, p) => set({ scanning: v, ...(p ? { scanProgress: p } : {}) }),
  setError: (lastError) => set({ lastError }),
}));
