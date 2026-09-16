export type OfflineTrack = {
  id: string;
  title: string;
  artist: string;
  image?: string;
  duration?: number;
  sourceUrl?: string;
};

export type OfflineAlbum = {
  key: string;
  kind: 'album';
  id: string;
  title: string;
  artist: string;
  image: string;
  genre?: string;
  publishedAt?: string;
  savedAt: number;
  tracks: OfflineTrack[];
};

export type OfflineTrackItem = {
  key: string;
  kind: 'track';
  id: string;
  title: string;
  artist: string;
  image?: string;
  duration?: number;
  sourceUrl?: string;
  savedAt: number;
};

export type OfflinePodcast = {
  key: string;
  kind: 'podcast';
  id: string;
  title: string;
  artist: string;
  image: string;
  genre?: string;
  trackCount?: number;
  collectionUrl?: string;
  feedUrl?: string;
  savedAt: number;
};

export type OfflineItem = OfflineAlbum | OfflineTrackItem | OfflinePodcast;

export type OfflineEpisode = {
  key: string;
  title: string;
  url: string;
  duration?: number;
};

export type TrackLike = {
  id: string;
  title: string;
  artist?: string;
  image?: string;
  duration?: number;
  previewUrl?: string;
};

export type AlbumLike = {
  id: string;
  title: string;
  artist?: string;
  image?: string;
  description?: string;
  publishedAt?: string;
  genre?: string;
  trackCount?: number;
  collectionUrl?: string;
  tracks?: (TrackLike & { position?: number })[];
};

export type PodcastLike = {
  id: string;
  title: string;
  artist?: string;
  image?: string;
  trackCount?: number;
  genre?: string;
  collectionUrl?: string;
  feedUrl?: string;
};

const DB_NAME = 'streamhub-offline';
const DB_VERSION = 1;
const STORE = 'audio';
const LS_KEY = 'streamhub.offline.v1';
const LS_EPISODES = 'streamhub.offline.episodes.v1';
const MEMORY_URLS = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function idbGetBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => { db.close(); resolve(request.result as Blob | undefined); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function idbAllKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    request.onsuccess = () => { db.close(); resolve((request.result as IDBValidKey[]).map(String)); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function idbDeleteBlob(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export function albumTrackBlobId(albumKey: string, trackId: string): string {
  return `a:${albumKey}:${trackId}`;
}

export function trackBlobId(trackKey: string): string {
  return `t:${trackKey}`;
}

export function episodeBlobId(podcastKey: string, episodeKey: string): string {
  return `e:${podcastKey}:${episodeKey}`;
}

export function hashKey(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function makeTrackItem(track: TrackLike): OfflineTrackItem {
  return {
    key: `track:${track.id}`,
    kind: 'track',
    id: track.id,
    title: track.title,
    artist: track.artist || 'Unknown artist',
    image: track.image,
    duration: track.duration,
    sourceUrl: track.previewUrl,
    savedAt: Date.now(),
  };
}

export function makeAlbumItem(album: AlbumLike): OfflineAlbum {
  return {
    key: `album:${album.id}`,
    kind: 'album',
    id: album.id,
    title: album.title,
    artist: album.artist || 'Unknown artist',
    image: album.image || '',
    genre: album.genre,
    publishedAt: album.publishedAt,
    savedAt: Date.now(),
    tracks: (album.tracks || [])
      .filter((track) => track.id)
      .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist || album.artist || 'Unknown artist',
        image: track.image || album.image,
        duration: track.duration,
        sourceUrl: track.previewUrl,
      })),
  };
}

export function makePodcastItem(podcast: PodcastLike): OfflinePodcast {
  return {
    key: `podcast:${podcast.id}`,
    kind: 'podcast',
    id: podcast.id,
    title: podcast.title,
    artist: podcast.artist || 'Unknown show',
    image: podcast.image || '',
    genre: podcast.genre,
    trackCount: podcast.trackCount,
    collectionUrl: podcast.collectionUrl,
    feedUrl: podcast.feedUrl,
    savedAt: Date.now(),
  };
}

export function loadOfflineItems(): OfflineItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistOfflineItems(items: OfflineItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable
  }
}

export function saveOfflineItem(item: OfflineItem): OfflineItem[] {
  const items = loadOfflineItems();
  const index = items.findIndex((existing) => existing.key === item.key);
  if (index === -1) {
    items.unshift(item);
  } else {
    items[index] = { ...item, savedAt: item.savedAt || items[index].savedAt };
  }
  persistOfflineItems(items);
  return items;
}

export function deleteOfflineItem(key: string): OfflineItem[] {
  const items = loadOfflineItems().filter((item) => item.key !== key);
  persistOfflineItems(items);
  return items;
}

export function collectBlobIds(item: OfflineItem): string[] {
  if (item.kind === 'album') {
    return item.tracks.map((track) => albumTrackBlobId(item.key, track.id));
  }
  if (item.kind === 'track') {
    return [trackBlobId(item.key)];
  }
  const episodes = loadEpisodes(item.key);
  return episodes.map((episode) => episodeBlobId(item.key, episode.key));
}

export function loadEpisodes(podcastKey: string): OfflineEpisode[] {
  try {
    const raw = localStorage.getItem(LS_EPISODES);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, OfflineEpisode[]>;
    return map[podcastKey] || [];
  } catch {
    return [];
  }
}

export function saveEpisodes(podcastKey: string, episodes: OfflineEpisode[]): void {
  try {
    const raw = localStorage.getItem(LS_EPISODES);
    const map = raw ? (JSON.parse(raw) as Record<string, OfflineEpisode[]>) : {};
    map[podcastKey] = episodes;
    localStorage.setItem(LS_EPISODES, JSON.stringify(map));
  } catch {
    // storage unavailable
  }
}

export function deleteEpisodes(podcastKey: string): void {
  try {
    const raw = localStorage.getItem(LS_EPISODES);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, OfflineEpisode[]>;
    delete map[podcastKey];
    localStorage.setItem(LS_EPISODES, JSON.stringify(map));
  } catch {
    // storage unavailable
  }
}

export async function cacheBlob(blobId: string, url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const blob = await response.blob();
    await idbPutBlob(blobId, blob);
    const stale = MEMORY_URLS.get(blobId);
    if (stale) {
      URL.revokeObjectURL(stale);
      MEMORY_URLS.delete(blobId);
    }
    return true;
  } catch {
    return false;
  }
}

export async function playableUrl(blobId: string | undefined, fallbackUrl?: string): Promise<string | undefined> {
  if (!blobId) return fallbackUrl;
  const cached = MEMORY_URLS.get(blobId);
  if (cached) return cached;
  try {
    const blob = await idbGetBlob(blobId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      MEMORY_URLS.set(blobId, url);
      return url;
    }
  } catch {
    // fall back to the original source
  }
  return fallbackUrl;
}

export function revokeBlobUrl(blobId: string): void {
  const url = MEMORY_URLS.get(blobId);
  if (url) {
    URL.revokeObjectURL(url);
    MEMORY_URLS.delete(blobId);
  }
}

export function saveBlobToDisk(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function formatTrackLength(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}