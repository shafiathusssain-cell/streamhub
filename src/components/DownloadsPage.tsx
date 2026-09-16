import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  ListMusic,
  LoaderCircle,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Save,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {
  albumTrackBlobId,
  cacheBlob,
  collectBlobIds,
  deleteEpisodes,
  episodeBlobId,
  formatTrackLength,
  hashKey,
  idbAllKeys,
  idbGetBlob,
  loadEpisodes,
  playableUrl,
  revokeBlobUrl,
  saveBlobToDisk,
  saveEpisodes,
  trackBlobId,
} from '@/lib/offline';
import type {
  OfflineAlbum,
  OfflineEpisode,
  OfflineItem,
  OfflinePodcast,
  OfflineTrack,
  OfflineTrackItem,
} from '@/lib/offline';

type Filter = 'all' | 'album' | 'track' | 'podcast';

const coverImage = 'https://images.pexels.com/photos/5764281/pexels-photo-5764281.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

type Props = {
  items: OfflineItem[];
  onRemove: (key: string) => void;
};

function parseItunesDuration(value?: string | null): number | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  const parts = clean.split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

function parseFeed(xml: string): OfflineEpisode[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = Array.from(doc.querySelectorAll('item'));
  const episodes: OfflineEpisode[] = [];
  for (const node of nodes) {
    const title = node.querySelector('title')?.textContent?.trim() || 'Untitled episode';
    const enclosure = node.getElementsByTagName('enclosure')[0];
    const url = enclosure?.getAttribute('url');
    if (!url) continue;
    const durationEl = node.getElementsByTagNameNS('*', 'duration')[0];
    episodes.push({
      key: `ep-${hashKey(url)}`,
      title,
      url,
      duration: parseItunesDuration(durationEl?.textContent),
    });
  }
  return episodes;
}

function downloadFileName(artist: string, title: string, extension = 'm4a'): string {
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, ' ').trim();
  return `${safe(artist)} - ${safe(title)}.${extension}`;
}

export default function DownloadsPage({ items, onRemove }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [cached, setCached] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [episodes, setEpisodes] = useState<Record<string, OfflineEpisode[]>>({});
  const [feedLoading, setFeedLoading] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<{ key: string; message: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loaded: Record<string, OfflineEpisode[]> = {};
    for (const item of items) {
      if (item.kind === 'podcast') {
        const list = loadEpisodes(item.key);
        if (list.length) loaded[item.key] = list;
      }
    }
    setEpisodes((prev) => ({ ...loaded, ...prev }));
    setExpanded((prev) => {
      const next = new Set(prev);
      items.forEach((item) => next.add(item.key));
      return next;
    });
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    idbAllKeys()
      .then((keys) => {
        if (!cancelled) setCached(new Set(keys));
      })
      .catch(() => {
        if (!cancelled) setCached(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const refreshCached = async () => {
    try {
      const keys = await idbAllKeys();
      setCached(new Set(keys));
    } catch {
      setCached(new Set());
    }
  };

  async function downloadAudio(blobId: string, url: string, busyValue: string) {
    if (cached.has(blobId)) return;
    setBusy(busyValue);
    await cacheBlob(blobId, url);
    await refreshCached();
    setBusy(null);
  }

  async function downloadAlbum(album: OfflineAlbum) {
    setBusy(album.key);
    await Promise.allSettled(
      album.tracks
        .filter((track) => track.sourceUrl)
        .map((track) => {
          const blobId = albumTrackBlobId(album.key, track.id);
          if (cached.has(blobId)) return Promise.resolve(true);
          return cacheBlob(blobId, track.sourceUrl as string);
        })
    );
    await refreshCached();
    setBusy(null);
  }

  async function playTrack(blobId: string | undefined, fallbackUrl: string | undefined, id: string) {
    if (playing === id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        void audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const url = await playableUrl(blobId, fallbackUrl);
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => {
      setIsPlaying(false);
      setPlaying(null);
    };
    audio.onerror = () => {
      setIsPlaying(false);
      setPlaying(null);
    };
    audioRef.current = audio;
    setPlaying(id);
    setIsPlaying(true);
  }

  async function saveTrackToDisk(blobId: string, filename: string) {
    const blob = await idbGetBlob(blobId);
    if (blob) saveBlobToDisk(filename, blob);
  }

  async function loadFeed(podcast: OfflinePodcast) {
    const existing = episodes[podcast.key];
    if (existing?.length) {
      setExpanded((prev) => new Set(prev).add(podcast.key));
      return;
    }
    if (!podcast.feedUrl) {
      setFeedError({ key: podcast.key, message: 'No feed URL was captured for this podcast.' });
      return;
    }
    setFeedLoading(podcast.key);
    setFeedError(null);
    try {
      const response = await fetch(podcast.feedUrl);
      if (!response.ok) throw new Error('The feed could not be loaded.');
      const parsed = parseFeed(await response.text());
      saveEpisodes(podcast.key, parsed);
      setEpisodes((prev) => ({ ...prev, [podcast.key]: parsed }));
      setExpanded((prev) => new Set(prev).add(podcast.key));
      if (!parsed.length) setFeedError({ key: podcast.key, message: 'The feed loaded but contained no downloadable episodes.' });
    } catch (err) {
      setFeedError({
        key: podcast.key,
        message: err instanceof Error ? `${err.message} Many feeds block cross-origin requests; try again from a hosted page.` : 'The feed could not be fetched from the browser.',
      });
    } finally {
      setFeedLoading(null);
    }
  }

  async function handleRemove(key: string) {
    await onRemove(key);
    for (const blobId of collectBlobIds({ key } as OfflineItem)) revokeBlobUrl(blobId);
    deleteEpisodes(key);
    setEpisodes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    await refreshCached();
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(
    () => items.filter((item) => filter === 'all' || item.kind === filter),
    [items, filter]
  );

  const counts = useMemo(() => {
    const summary = { album: 0, track: 0, podcast: 0 };
    items.forEach((item) => {
      if (item.kind === 'album' || item.kind === 'track' || item.kind === 'podcast') {
        summary[item.kind] += 1;
      }
    });
    return summary;
  }, [items]);

  function renderAlbumTrack(album: OfflineAlbum, track: OfflineTrack) {
    const blobId = albumTrackBlobId(album.key, track.id);
    const isCached = cached.has(blobId);
    const playId = `${album.key}:${track.id}`;
    const isBusy = busy === blobId;
    return (
      <div className="track-row dl-track-row" key={track.id}>
        <button className="track-number" onClick={() => void playTrack(blobId, track.sourceUrl, playId)} aria-label={`Play ${track.title}`}>
          {playing === playId && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <div className="track-thumb">{track.image ? <img src={track.image} alt="" /> : <Music2 size={16} />}</div>
        <div className="track-info">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
        <span className="track-duration">{formatTrackLength(track.duration)}</span>
        <button className="track-download-btn" onClick={() => void downloadAudio(blobId, track.sourceUrl || '', blobId)} disabled={isCached || isBusy || !track.sourceUrl} aria-label={`Download ${track.title}`}>
          {isBusy ? <LoaderCircle className="spin" size={15} /> : isCached ? <Check size={15} /> : <Download size={15} />}
        </button>
        {isCached ? (
          <button className="track-save-btn" onClick={() => void saveTrackToDisk(blobId, downloadFileName(track.artist, track.title))} aria-label="Save file">
            <Save size={14} />
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  }

  function coverFor(item: OfflineItem): string {
    if (item.image) return item.image;
    return coverImage;
  }

  function firstPlayable(item: OfflineItem): { blobId: string; url: string; playId: string } | null {
    if (item.kind === 'album') {
      for (const track of item.tracks) {
        const blobId = albumTrackBlobId(item.key, track.id);
        if (cached.has(blobId) && track.sourceUrl) return { blobId, url: track.sourceUrl, playId: `dl-album:${item.key}` };
      }
      return null;
    }
    if (item.kind === 'track') {
      const blobId = trackBlobId(item.key);
      if (cached.has(blobId) && item.sourceUrl) return { blobId, url: item.sourceUrl, playId: `dl-track:${item.key}` };
      return null;
    }
    const list = episodes[item.key] || [];
    for (const ep of list) {
      const blobId = episodeBlobId(item.key, ep.key);
      if (cached.has(blobId) && ep.url) return { blobId, url: ep.url, playId: `dl-pod:${item.key}` };
    }
    return null;
  }

  function renderCoverTile(item: OfflineItem, index: number) {
    const cover = coverFor(item);
    const playable = firstPlayable(item);
    const tileTitle = item.kind === 'track' ? item.title : item.title;
    const tileSub = item.kind === 'album' ? item.artist : item.kind === 'podcast' ? (item.artist ?? 'Podcast') : item.artist;
    const isCurrent = playing === playable?.playId && isPlaying;
    const isBusyTile = playable === null;
    return (
      <article
        className="album-card dl-cover-tile"
        key={item.key}
        style={{ animationDelay: `${index * 35}ms` }}
        onClick={() => {
          if (playable) void playTrack(playable.blobId, playable.url, playable.playId);
        }}
      >
        <div className="album-cover" style={{ background: item.image?.startsWith('linear-gradient') ? item.image : 'var(--cover-bg, #f7efe4)' }}>
          {item.image && !item.image.startsWith('linear-gradient') ? <img src={item.image} alt={`${tileTitle} cover`} /> : <Music2 size={34} />}
          <button
            className="cover-play"
            aria-label={playable ? `Play ${tileTitle} offline` : `${tileTitle} not playable offline yet`}
            onClick={(e) => {
              e.stopPropagation();
              if (playable) void playTrack(playable.blobId, playable.url, playable.playId);
            }}
          >
            {isCurrent ? <Pause size={18} fill="currentColor" /> : playable ? <Play size={18} fill="currentColor" /> : <WifiOff size={16} />}
          </button>
          {isBusyTile && <span className="dl-tile-note">Tap × download an offline track</span>}
        </div>
        <div className="album-card-body">
          <span className="album-type">
            {item.kind === 'album' ? <Music2 size={12} /> : item.kind === 'track' ? <ListMusic size={12} /> : <Mic2 size={12} />}
            {item.kind === 'album' ? 'Offline album' : item.kind === 'track' ? 'Offline track' : 'Offline podcast'}
          </span>
          <h2>{tileTitle}</h2>
          <p>{tileSub}</p>
        </div>
      </article>
    );
  }

  function renderAlbum(album: OfflineAlbum) {
    const isExpanded = expanded.has(album.key);
    const sourceTracks = album.tracks.filter((track) => track.sourceUrl);
    const allCached = sourceTracks.length > 0 && sourceTracks.every((track) => cached.has(albumTrackBlobId(album.key, track.id)));
    const anyCached = sourceTracks.some((track) => cached.has(albumTrackBlobId(album.key, track.id)));
    const isBusy = busy === album.key;
    return (
      <article className="download-card" key={album.key}>
        <div className="download-card-head">
          <button className="card-expand" onClick={() => toggleExpanded(album.key)} aria-label="Toggle track list">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="dl-cover">{album.image ? <img src={album.image} alt="" /> : <Music2 size={20} />}</div>
          <div className="dl-copy">
            <span className="album-type"><Music2 size={12} /> Album</span>
            <h2>{album.title}</h2>
            <p>{album.artist}</p>
          </div>
          <div className="dl-meta">
            {anyCached && <span className="dl-state">{allCached ? <Check size={14} /> : <Download size={14} />} {allCached ? `${sourceTracks.length} tracks offline` : 'Partially offline'}</span>}
          </div>
          <div className="dl-actions">
            <button className="secondary-button dl-button" onClick={() => void downloadAlbum(album)} disabled={isBusy || allCached}>
              {isBusy ? <LoaderCircle className="spin" size={16} /> : allCached ? <Check size={16} /> : <Download size={16} />}
              {isBusy ? 'Saving…' : allCached ? 'Saved' : 'Download all'}
            </button>
            <button className="icon-button remove-btn" onClick={() => void handleRemove(album.key)} aria-label="Remove album"><Trash2 size={16} /></button>
          </div>
        </div>
        {isExpanded && (
          <div className="track-list dl-track-list">
            {album.tracks.length ? album.tracks.map((track) => renderAlbumTrack(album, track)) : <div className="dl-note">No track list was captured when this album was saved.</div>}
          </div>
        )}
      </article>
    );
  }

  function renderTrack(track: OfflineTrackItem) {
    const blobId = trackBlobId(track.key);
    const isCached = cached.has(blobId);
    const isBusy = busy === blobId;
    return (
      <article className="download-card dl-single" key={track.key}>
        <div className="dl-single-row">
          <button className="track-number" onClick={() => void playTrack(blobId, track.sourceUrl, track.key)} aria-label={`Play ${track.title}`}>
            {playing === track.key && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <div className="dl-cover">{track.image ? <img src={track.image} alt="" /> : <ListMusic size={20} />}</div>
          <div className="dl-copy">
            <span className="album-type"><ListMusic size={12} /> Track</span>
            <h2>{track.title}</h2>
            <p>{track.artist}</p>
          </div>
          <span className="track-duration">{formatTrackLength(track.duration)}</span>
          <div className="dl-actions">
            <button className="secondary-button dl-button" onClick={() => void downloadAudio(blobId, track.sourceUrl || '', track.key)} disabled={isCached || isBusy || !track.sourceUrl}>
              {isBusy ? <LoaderCircle className="spin" size={16} /> : isCached ? <Check size={16} /> : <Download size={16} />}
              {isCached ? 'Offline' : 'Download'}
            </button>
            {isCached && (
              <button className="icon-button" onClick={() => void saveTrackToDisk(blobId, downloadFileName(track.artist, track.title))} aria-label="Save file">
                <Save size={15} />
              </button>
            )}
            <button className="icon-button remove-btn" onClick={() => void handleRemove(track.key)} aria-label="Remove track"><Trash2 size={16} /></button>
          </div>
        </div>
      </article>
    );
  }

  function renderEpisode(podcast: OfflinePodcast, episode: OfflineEpisode) {
    const blobId = episodeBlobId(podcast.key, episode.key);
    const isCached = cached.has(blobId);
    const playId = `${podcast.key}:ep:${episode.key}`;
    const isBusy = busy === blobId;
    return (
      <div className="track-row dl-track-row" key={episode.key}>
        <button className="track-number" onClick={() => void playTrack(blobId, episode.url, playId)} aria-label={`Play ${episode.title}`}>
          {playing === playId && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <div className="track-thumb"><Mic2 size={16} /></div>
        <div className="track-info">
          <strong>{episode.title}</strong>
          <span>{podcast.title}</span>
        </div>
        <span className="track-duration">{formatTrackLength(episode.duration)}</span>
        <button className="track-download-btn" onClick={() => void downloadAudio(blobId, episode.url, blobId)} disabled={isCached || isBusy} aria-label={`Download ${episode.title}`}>
          {isBusy ? <LoaderCircle className="spin" size={15} /> : isCached ? <Check size={15} /> : <Download size={15} />}
        </button>
        {isCached ? (
          <button className="track-save-btn" onClick={() => void saveTrackToDisk(blobId, downloadFileName(podcast.title, episode.title, 'mp3'))} aria-label="Save file">
            <Save size={14} />
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  }

  function renderPodcast(podcast: OfflinePodcast) {
    const isExpanded = expanded.has(podcast.key);
    const list = episodes[podcast.key] || [];
    const isLoading = feedLoading === podcast.key;
    const error = feedError?.key === podcast.key ? feedError.message : null;
    return (
      <article className="download-card" key={podcast.key}>
        <div className="download-card-head">
          <button className="card-expand" onClick={() => toggleExpanded(podcast.key)} aria-label="Toggle episodes">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="dl-cover">{podcast.image ? <img src={podcast.image} alt="" /> : <Radio size={20} />}</div>
          <div className="dl-copy">
            <span className="album-type"><Mic2 size={12} /> Podcast</span>
            <h2>{podcast.title}</h2>
            <p>{podcast.artist}</p>
          </div>
          <div className="dl-meta">
            {list.length > 0 && <span className="dl-state"><Check size={14} /> {list.length} episodes</span>}
          </div>
          <div className="dl-actions">
            <button className="secondary-button dl-button" onClick={() => void loadFeed(podcast)} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="spin" size={16} /> : list.length ? <RefreshCw size={16} /> : <Radio size={16} />}
              {isLoading ? 'Loading…' : list.length ? 'Reload feed' : 'Load episodes'}
            </button>
            {podcast.collectionUrl && (
              <a className="icon-button" href={podcast.collectionUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Apple Podcasts">
                <ExternalLink size={15} />
              </a>
            )}
            <button className="icon-button remove-btn" onClick={() => void handleRemove(podcast.key)} aria-label="Remove podcast"><Trash2 size={16} /></button>
          </div>
        </div>
        {isExpanded && (
          <div className="track-list dl-track-list">
            {list.length ? (
              list.map((episode) => renderEpisode(podcast, episode))
            ) : (
              <div className="dl-note">{error || 'Load the feed to browse and download episodes for offline listening.'}</div>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <main className="content downloads-page">
      <section className="downloads-hero">
        <div className="downloads-hero-cover" style={{ backgroundImage: `url(${coverImage})` }}>
          <div className="downloads-hero-shade" />
        </div>
        <div className="downloads-hero-copy">
          <span className="eyebrow"><WifiOff size={14} /> Listen anywhere</span>
          <h1>Downloads</h1>
          <p>Albums, tracks and podcasts saved for offline listening.</p>
          <span className="downloads-hero-count">{items.length} saved {items.length === 1 ? 'item' : 'items'}</span>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="empty-panel large-empty">
          <WifiOff size={36} />
          <h2>Nothing downloaded yet</h2>
          <p>Open an album, track or podcast and tap Save offline to build your downloadable library.</p>
        </div>
      ) : (
        <>
          <nav className="kind-chips" aria-label="Filter downloads">
            {(['all', 'album', 'track', 'podcast'] as Filter[]).map((kind) => (
              <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>
                {kind === 'album' ? <Music2 size={15} /> : kind === 'track' ? <ListMusic size={15} /> : kind === 'podcast' ? <Mic2 size={15} /> : <Download size={15} />}
                {kind === 'all' ? 'All' : `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`}
                {kind !== 'all' && <span className="chip-count">{counts[kind]}</span>}
              </button>
            ))}
          </nav>

          {filtered.length > 0 && (
            <section className="dl-cover-shelf" aria-label="Downloaded covers">
              <div className="section-heading">
                <div>
                  <span className="eyebrow"><ListMusic size={13} /> Cover view</span>
                  <h2>Tap a cover to play offline</h2>
                </div>
              </div>
              <div className="album-grid">{filtered.map((item, index) => renderCoverTile(item, index))}</div>
            </section>
          )}

          <div className="downloads-list">
            {filtered.length === 0 ? (
              <div className="empty-panel"><Download size={28} /><p>Nothing saved in {filter} yet.</p></div>
            ) : (
              filtered.map((item) =>
                item.kind === 'album' ? renderAlbum(item) : item.kind === 'track' ? renderTrack(item) : renderPodcast(item)
              )
            )}
          </div>
        </>
      )}
    </main>
  );
}