import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Headphones,
  ListMusic,
  LoaderCircle,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  Search,
  Smartphone,
  Sparkles,
  Volume2,
  X,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  cacheBlob,
  albumTrackBlobId,
  trackBlobId,
  makeAlbumItem,
  makePodcastItem,
  makeTrackItem,
} from '@/lib/offline';
import { useOfflineLibrary } from '@/lib/useOfflineLibrary';
import { useAuth } from '@/lib/auth';
import DownloadsPage from '@/components/DownloadsPage';
import AuthPage from '@/components/AuthPage';

type Album = {
  id: string;
  title: string;
  artist: string;
  image: string;
  description?: string;
  publishedAt?: string;
  trackCount?: number;
  genre?: string;
  tracks?: Track[];
  collectionUrl?: string;
};

type Track = {
  id: string;
  title: string;
  artist: string;
  image?: string;
  position?: number;
  duration?: number;
  previewUrl?: string;
  collectionUrl?: string;
};

type Podcast = {
  id: string;
  title: string;
  artist: string;
  image: string;
  trackCount?: number;
  genre?: string;
  collectionUrl?: string;
  feedUrl?: string;
};

type ApiPayload = {
  albums?: Album[];
  tracks?: Track[];
  podcasts?: Podcast[];
  album?: Album;
  error?: string;
};

type Tab = 'Albums' | 'Tracks' | 'Podcasts';

type View = 'home' | 'downloads';

function curatedTracksFor(id: string, title: string, artist: string, genre: string): Track[] {
  const base = ['Midnight Aura', 'Floating Signals', 'Slow Horizon', 'Glass Fog', 'Distant Lights', 'Quiet Machines', 'Paper Stars', 'Silent Bloom', 'Far Bright', 'Low Tide', 'Ember Static', 'Folded Light', 'After Rain', 'Hollow Sun', 'Tidal Memory', 'Soft Static', 'Night Ledges', 'Pale Drift', 'First Frost', 'Last Transmission', 'Blue Hours', 'Corridor Glow', 'Weightless', 'Terminal Calm', 'Twin Moons', 'Northern Vapor', 'Crystal Flare', 'Cold Bloom'];
  const tipWords = ['Haze', 'Lattice', 'Vista', 'Wavelength', 'Mirage', 'Pulse', 'Oasis', 'Cipher', 'Shade', 'Gradient'];
  return Array.from({ length: 12 }, (_, i) => ({
    id: `cur-${id}-${i}`,
    title: `${base[(i * 3) % base.length]} ${tipWords[(i * 5) % tipWords.length]}`,
    artist,
    previewUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(i % 16) + 1}.mp3`,
    duration: 9822 + ((i * 411) % 1400),
    position: i + 1,
  }));
}

const curatedAlbums: Album[] = [
  { id: 'local-1', title: 'Midnight Echoes', artist: 'Lunar Drift', image: 'https://images.pexels.com/photos/5764281/pexels-photo-5764281.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2024', genre: 'Ambient' },
  { id: 'local-2', title: 'Neon Highway', artist: 'The Voltage', image: 'https://images.pexels.com/photos/6842724/pexels-photo-6842724.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2023', genre: 'Synthwave' },
  { id: 'local-3', title: 'Crimson Shadows', artist: 'Ember Falls', image: 'https://images.pexels.com/photos/16015747/pexels-photo-16015747.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2022', genre: 'Indie Rock' },
  { id: 'local-4', title: 'Velvet Dreams', artist: 'Aria Moon', image: 'https://images.pexels.com/photos/13312404/pexels-photo-13312404.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2024', genre: 'Dream Pop' },
  { id: 'local-5', title: 'Electric Soul', artist: 'The Voltage', image: 'https://images.pexels.com/photos/8699994/pexels-photo-8699994.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2021', genre: 'Electronic' },
  { id: 'local-6', title: 'Afterglow', artist: 'Northbound', image: 'https://images.pexels.com/photos/19404723/pexels-photo-19404723.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2023', genre: 'Folk' },
  { id: 'local-7', title: 'Coastal Lines', artist: 'Mira West', image: 'https://images.pexels.com/photos/8990439/pexels-photo-8990439.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2024', genre: 'Indie' },
  { id: 'local-8', title: 'Night Bloom', artist: 'Static Garden', image: 'https://images.pexels.com/photos/8168567/pexels-photo-8168567.png?auto=compress&cs=tinysrgb&h=650&w=940', publishedAt: '2022', genre: 'Lo-fi' },
];

const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-music`;

async function callApi(body: Record<string, string>): Promise<ApiPayload> {
  const response = await fetch(apiBase, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiPayload;
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? 'Search could not be completed.');
  }
  return payload;
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function App() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Albums');
  const [albums, setAlbums] = useState<Album[]>(curatedAlbums);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [albumSaveState, setAlbumSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [view, setView] = useState<View>('home');
  const offline = useOfflineLibrary();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>([]);
  const { user, state: authState, signUp, signIn, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const authName = (user?.user_metadata?.display_name as string | undefined) || (user?.email ?? 'User').split('@')[0];
  const authInitial = (authName[0] || 'U').toUpperCase();

  useEffect(() => {
    if (user && showAuth) setShowAuth(false);
  }, [user, showAuth]);

  const pageTitle = useMemo(() => {
    if (query) return `Results for "${query}"`;
    if (activeTab === 'Tracks') return 'All tracks';
    if (activeTab === 'Podcasts') return 'All podcasts';
    return 'All albums';
  }, [query, activeTab]);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setSelectedAlbum(null);
    setError('');
    if (!query.trim()) return;
    performSearch(query.trim(), tab);
  }

  async function performSearch(searchQuery: string, tab: Tab) {
    setLoading(true);
    setError('');
    setSelectedAlbum(null);
    const media = tab === 'Tracks' ? 'song' : tab === 'Podcasts' ? 'podcast' : 'album';
    try {
      const payload = await callApi({ action: 'search', query: searchQuery, media });
      if (tab === 'Albums') {
        setAlbums(payload.albums ?? []);
        if (!payload.albums?.length) setError('No albums found. Try an artist name or album title.');
      } else if (tab === 'Tracks') {
        setTracks(payload.tracks ?? []);
        if (!payload.tracks?.length) setError('No tracks found. Try a song title or artist name.');
      } else {
        setPodcasts(payload.podcasts ?? []);
        if (!payload.podcasts?.length) setError('No podcasts found. Try a topic or show name.');
      }
    } catch (requestError) {
      setAlbums([]);
      setTracks([]);
      setPodcasts([]);
      setError(requestError instanceof Error ? requestError.message : 'Search is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setAlbums(curatedAlbums);
      setTracks([]);
      setPodcasts([]);
      setError('');
      return;
    }
    performSearch(trimmedQuery, activeTab);
  }

  async function openAlbum(album: Album) {
    setSelectedAlbum(album);
    if (album.id.startsWith('local-')) return;

    setDetailLoading(true);
    try {
      const payload = await callApi({ action: 'details', id: album.id });
      if (payload.album) setSelectedAlbum(payload.album);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'This album could not be opened.');
    } finally {
      setDetailLoading(false);
    }
  }

  function trackItemKey(track: Track) {
    return `track:${track.id}`;
  }

  async function saveTrackToLibrary(track: Track) {
    const item = makeTrackItem(track);
    offline.addItem(item);
    if (!track.previewUrl) return;
    setDownloadingId(track.id);
    await cacheBlob(trackBlobId(item.key), track.previewUrl);
    setDownloadingId(null);
  }

  async function saveAlbumToLibrary(album: Album) {
    const item = makeAlbumItem(album);
    offline.addItem(item);
    setAlbumSaveState('saving');
    const tasks = item.tracks
      .filter((track) => track.sourceUrl)
      .map((track) => cacheBlob(albumTrackBlobId(item.key, track.id), track.sourceUrl as string));
    if (tasks.length) await Promise.allSettled(tasks);
    setAlbumSaveState('saved');
  }

  function savePodcastToLibrary(podcast: Podcast) {
    offline.addItem(makePodcastItem(podcast));
  }

  function startPlayback(track: Track, queue: Track[]) {
    if (!track.previewUrl) return;
    const audio = new Audio(track.previewUrl);
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => {
      const index = queue.findIndex((item) => item.id === track.id);
      const next = queue[index + 1];
      if (next) {
        startPlayback(next, queue);
      } else {
        setIsPlaying(false);
        setPlayingTrack(null);
        queueRef.current = [];
      }
    };
    audioRef.current = audio;
    setPlayingTrack(track);
    setIsPlaying(true);
  }

  function togglePlay(track: Track) {
    if (playingTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (!track.previewUrl) {
      setPlayingTrack(track);
      setIsPlaying(false);
      queueRef.current = [];
      return;
    }

    queueRef.current = [];
    startPlayback(track, []);
  }

  function playAlbum(album: Album) {
    const queue = (album.tracks ?? []).filter((track) => track.previewUrl);
    const first = queue[0];
    if (!first) {
      if (album.tracks?.[0]) {
        setPlayingTrack(album.tracks[0]);
        setIsPlaying(false);
      }
      return;
    }
    if (playingTrack?.id === first.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    if (playingTrack?.id === first.id && !isPlaying) {
      audioRef.current?.play();
      setIsPlaying(true);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    queueRef.current = queue;
    startPlayback(first, queue);
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  function closePlayer() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    queueRef.current = [];
    setPlayingTrack(null);
    setIsPlaying(false);
  }

  useEffect(() => {
    document.title = selectedAlbum ? `${selectedAlbum.title} · StreamHub` : 'StreamHub · Music & Podcasts';
  }, [selectedAlbum]);

  const hasResults = activeTab === 'Albums' ? albums.length > 0 : activeTab === 'Tracks' ? tracks.length > 0 : podcasts.length > 0;
  const albumIsPlaying = !!selectedAlbum?.tracks?.some((track) => track.id === playingTrack?.id);

  if (selectedAlbum) {
    return (
      <div className="app-shell">
        <header className="topbar detail-topbar">
          <button className="brand-button" onClick={() => setSelectedAlbum(null)} aria-label="Back to albums">
            <span className="brand-mark"><Music2 size={21} strokeWidth={2.8} /></span>
            <span><strong>StreamHub</strong><small>Music & Podcasts</small></span>
          </button>
          <div className="compact-search"><Search size={18} /><span>{query || 'Search music'}</span></div>
          <button className="downloads-nav" onClick={() => { setSelectedAlbum(null); setView('downloads'); }} aria-label="Open downloads">
            <Download size={17} />
            <span>Downloads</span>
            {offline.items.length > 0 && <span className="downloads-count">{offline.items.length}</span>}
          </button>
          {user ? (
            <button className="auth-logout" onClick={() => void signOut()} title={`Sign out ${user?.email}`}>
              <span className="auth-initial">{authInitial}</span>
              <LogOut size={16} />
            </button>
          ) : (
            <button className="signin-nav" onClick={() => setShowAuth(true)}><LogIn size={15} /> Sign in</button>
          )}
        </header>
        <main className="detail-page">
          <button className="back-link" onClick={() => setSelectedAlbum(null)}><ArrowLeft size={17} /> Back to results</button>
          <section className="album-hero">
            <div className="hero-art" style={{ background: selectedAlbum.image.startsWith('linear-gradient') ? selectedAlbum.image : undefined }}>
              {!selectedAlbum.image.startsWith('linear-gradient') && <img src={selectedAlbum.image} alt={selectedAlbum.title} />}
              <div className="hero-art-glow" />
            </div>
            <div className="hero-copy">
              <span className="eyebrow"><Sparkles size={14} /> {selectedAlbum.genre || 'Album'}</span>
              <h1>{selectedAlbum.title}</h1>
              <p className="artist-line">{selectedAlbum.artist}</p>
              <p className="hero-description">{selectedAlbum.description || 'A collection of tracks for your next listening session.'}</p>
              <div className="hero-meta">
                <span>{selectedAlbum.publishedAt || 'Latest'}</span>
                <span>{selectedAlbum.tracks?.length || selectedAlbum.trackCount || '—'} tracks</span>
                {selectedAlbum.genre && <span>{selectedAlbum.genre}</span>}
              </div>
              <div className="hero-actions">
                <button className="primary-button" onClick={() => playAlbum(selectedAlbum)} aria-label={albumIsPlaying ? (isPlaying ? 'Pause album' : 'Resume album') : 'Play album'}>
                  {albumIsPlaying && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                  {albumIsPlaying ? (isPlaying ? 'Pause album' : 'Resume album') : 'Play album'}
                </button>
                <button className="download-button" onClick={() => void saveAlbumToLibrary(selectedAlbum)} disabled={albumSaveState === 'saving' || !selectedAlbum.tracks?.length}>
                  {albumSaveState === 'saving' ? <LoaderCircle className="spin" size={17} /> : offline.isSaved(`album:${selectedAlbum.id}`) ? <Check size={17} /> : <Download size={17} />}
                  {albumSaveState === 'saving' ? 'Saving…' : offline.isSaved(`album:${selectedAlbum.id}`) ? 'Saved offline' : 'Save offline'}
                </button>
                {selectedAlbum.collectionUrl && <a className="icon-link" href={selectedAlbum.collectionUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Apple Music</a>}
              </div>
            </div>
          </section>
          <section className="track-section">
            <div className="section-heading">
              <div><span className="eyebrow">The collection</span><h2>Track list</h2></div>
              <span className="track-count">{selectedAlbum.tracks?.length || 0} tracks</span>
            </div>
            {detailLoading ? (
              <div className="loading-panel"><LoaderCircle className="spin" size={24} /> Loading tracks…</div>
            ) : selectedAlbum.tracks?.length ? (
              <div className="track-list">
                {selectedAlbum.tracks.map((track) => (
                  <div className="track-row" key={track.id}>
                    <button className="track-number" onClick={() => togglePlay(track)} aria-label={`Play ${track.title}`}>
                      {playingTrack?.id === track.id && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <div className="track-thumb">
                      {track.image ? <img src={track.image} alt="" /> : <Music2 size={16} />}
                    </div>
                    <div className="track-info">
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                    <span className="track-duration">{formatTime(track.duration || 0)}</span>
                    <button className="track-download-btn" onClick={() => void saveTrackToLibrary(track)} disabled={!track.previewUrl || downloadingId === track.id} aria-label={`Save ${track.title} offline`}>
                      {downloadingId === track.id ? <LoaderCircle className="spin" size={15} /> : offline.isSaved(trackItemKey(track)) ? <Check size={15} /> : <Download size={15} />}
                    </button>
                    <button className="track-play" onClick={() => togglePlay(track)} aria-label={`Play ${track.title}`}>
                      {playingTrack?.id === track.id && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-panel"><ListMusic size={28} /><p>Track details will appear here when available.</p></div>
            )}
          </section>
        </main>
        {playingTrack && (
          <>
            <MiniPlayer track={playingTrack} isPlaying={isPlaying} onToggle={() => togglePlay(playingTrack)} onClose={closePlayer} />
            <div className="mini-player-spacer" />
          </>
        )}
        {showAuth && (
          <div className="auth-overlay" onClick={() => setShowAuth(false)}>
            <div className="auth-overlay-inner" onClick={(e) => e.stopPropagation()}>
              <AuthPage state={authState} signUp={signUp} signIn={signIn} onClose={() => setShowAuth(false)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => { setView('home'); setQuery(''); setAlbums(curatedAlbums); setTracks([]); setPodcasts([]); setError(''); }} aria-label="StreamHub home">
          <span className="brand-mark"><Music2 size={21} strokeWidth={2.8} /></span>
          <span><strong>StreamHub</strong><small>Music & Podcasts</small></span>
        </button>
        {view === 'home' && (
          <form className="search-form" onSubmit={handleSearch}>
            <Search size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search albums, tracks, podcasts…" aria-label="Search music" />
            {query && <button type="button" className="clear-search" onClick={() => { setQuery(''); setAlbums(curatedAlbums); setTracks([]); setPodcasts([]); setError(''); }}>Clear</button>}
          </form>
        )}
        <button className={view === 'downloads' ? 'downloads-nav active' : 'downloads-nav'} onClick={() => setView(view === 'downloads' ? 'home' : 'downloads')} aria-label="Open downloads">
          <Download size={17} />
          <span>{view === 'downloads' ? 'Library' : 'Downloads'}</span>
          {offline.items.length > 0 && <span className="downloads-count">{offline.items.length}</span>}
        </button>
        {user ? (
        <div className="auth-user-chip">
          <span className="auth-initial">{authInitial}</span>
          <span className="auth-email">{authName}</span>
          <button className="auth-logout" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={15} /></button>
        </div>
      ) : (
        <button className="signin-nav" onClick={() => setShowAuth(true)}><LogIn size={15} /> Sign in</button>
      )}
        <a className="app-link" href="/install.html" target="_blank" rel="noopener noreferrer"><Smartphone size={15} /> Get the app</a>
      </header>

      {view === 'downloads' ? (
        <DownloadsPage items={offline.items} onRemove={(key) => void offline.removeItem(key)} />
      ) : (
      <main className="content">
        <nav className="category-tabs" aria-label="Content type">
          {(['Albums', 'Tracks', 'Podcasts'] as const).map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => handleTabChange(tab)}>
              {tab === 'Albums' ? <Music2 size={16} /> : tab === 'Tracks' ? <ListMusic size={16} /> : <Mic2 size={16} />}
              {tab}
            </button>
          ))}
        </nav>

        <section className="section-heading page-heading">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> Your listening space</span>
            <h1>{pageTitle}</h1>
          </div>
          <span className="result-count">
            {activeTab === 'Albums' ? `${albums.length} albums` : activeTab === 'Tracks' ? `${tracks.length} tracks` : `${podcasts.length} podcasts`}
          </span>
        </section>

        {loading ? (
          <div className="loading-panel large-empty"><LoaderCircle className="spin" size={27} /> Searching…</div>
        ) : error ? (
          <div className="empty-panel large-empty">
            <Headphones size={36} />
            <h2>We couldn't find that</h2>
            <p>{error}</p>
            <button className="secondary-button" onClick={() => { setQuery(''); setAlbums(curatedAlbums); setTracks([]); setPodcasts([]); setError(''); }}>Show featured</button>
          </div>
        ) : !hasResults ? (
          <div className="empty-panel large-empty">
            {activeTab === 'Podcasts' ? <Radio size={36} /> : <Headphones size={36} />}
            <h2>Start searching</h2>
            <p>{activeTab === 'Albums' ? 'Browse featured albums below or search for your favorite music.' : `Search for ${activeTab.toLowerCase()} to see results here.`}</p>
            {activeTab === 'Albums' && <div className="album-grid">{curatedAlbums.slice(0, 4).map((album, index) => <AlbumCard key={album.id} album={album} index={index} onClick={openAlbum} onDownload={(a) => void saveAlbumToLibrary(a)} saved={offline.isSaved(`album:${album.id}`)} />)}</div>}
          </div>
        ) : activeTab === 'Albums' ? (
          <div className="album-grid">
            {albums.map((album, index) => <AlbumCard key={album.id} album={album} index={index} onClick={openAlbum} onDownload={(a) => void saveAlbumToLibrary(a)} saved={offline.isSaved(`album:${album.id}`)} />)}
          </div>
        ) : activeTab === 'Tracks' ? (
          <div className="track-list page-track-list">
            {tracks.map((track, index) => (
              <div className="track-row" key={track.id} style={{ animationDelay: `${index * 30}ms` }}>
                <button className="track-number" onClick={() => togglePlay(track)} aria-label={`Play ${track.title}`}>
                  {playingTrack?.id === track.id && isPlaying ? <Pause size={14} fill="currentColor" /> : <span>{String(index + 1).padStart(2, '0')}</span>}
                </button>
                <div className="track-thumb">{track.image ? <img src={track.image} alt="" /> : <Music2 size={16} />}</div>
                <div className="track-info"><strong>{track.title}</strong><span>{track.artist}</span></div>
                <span className="track-duration">{formatTime(track.duration || 0)}</span>
                <button className="track-download-btn" onClick={() => void saveTrackToLibrary(track)} disabled={!track.previewUrl || downloadingId === track.id} aria-label={`Save ${track.title} offline`}>
                  {downloadingId === track.id ? <LoaderCircle className="spin" size={15} /> : offline.isSaved(trackItemKey(track)) ? <Check size={15} /> : <Download size={15} />}
                </button>
                <button className="track-play" onClick={() => togglePlay(track)} aria-label={`Play ${track.title}`}>
                  {playingTrack?.id === track.id && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="album-grid">
            {podcasts.map((podcast, index) => (
              <article className="album-card" key={podcast.id} style={{ animationDelay: `${index * 45}ms` }}>
                <div className="album-cover" style={{ background: podcast.image.startsWith('linear-gradient') ? podcast.image : undefined }}>
                  {!podcast.image.startsWith('linear-gradient') && <img src={podcast.image} alt={podcast.title} />}
                  <button className="cover-play" aria-label={`Open ${podcast.title}`}><ChevronRight size={20} /></button>
                </div>
                <div className="album-card-body">
                  <span className="album-type"><Mic2 size={12} /> Podcast</span>
                  <h2>{podcast.title}</h2>
                  <p>{podcast.artist}</p>
                  <div className="card-footer">
                    <span>{podcast.genre || 'Podcast'} <i>•</i> {podcast.trackCount || '—'} episodes</span>
                    <span className="podcast-card-actions">
                      {offline.isSaved(`podcast:${podcast.id}`) ? (
                        <button onClick={(e) => e.stopPropagation()} aria-label="Podcast saved"><Check size={15} /></button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); savePodcastToLibrary(podcast); }} aria-label={`Save ${podcast.title} offline`}><Download size={15} /></button>
                      )}
                      {podcast.collectionUrl && <a href={podcast.collectionUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={15} /></a>}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      )}

      <footer className="footer">
        <span>Made for curious listeners.</span>
        <span><Volume2 size={14} /> Powered by iTunes Search</span>
      </footer>
      {playingTrack && (
        <>
          <MiniPlayer track={playingTrack} isPlaying={isPlaying} onToggle={() => togglePlay(playingTrack)} onClose={closePlayer} />
          <div className="mini-player-spacer" />
        </>
      )}
      {showAuth && (
        <div className="auth-overlay" onClick={() => setShowAuth(false)}>
          <div className="auth-overlay-inner" onClick={(e) => e.stopPropagation()}>
            <AuthPage state={authState} signUp={signUp} signIn={signIn} onClose={() => setShowAuth(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniPlayer({ track, isPlaying, onToggle, onClose }: { track: Track; isPlaying: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="mini-player">
      <div className="mini-player-inner">
        <div className="mini-cover">
          {track.image ? <img src={track.image} alt="" /> : <Music2 size={18} />}
        </div>
        <div className="mini-info">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
        <div className="mini-controls">
          <button className="mini-play" onClick={onToggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <button className="mini-close" onClick={onClose} aria-label="Close player"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function AlbumCard({ album, index, onClick, onDownload, saved }: { album: Album; index: number; onClick: (album: Album) => void; onDownload: (album: Album) => void; saved: boolean }) {
  return (
    <article className="album-card" style={{ animationDelay: `${index * 45}ms` }} onClick={() => onClick(album)}>
      <div className="album-cover" style={{ background: album.image.startsWith('linear-gradient') ? album.image : undefined }}>
        {!album.image.startsWith('linear-gradient') && <img src={album.image} alt={`${album.title} cover`} />}
        <button className="cover-play" aria-label={`Open ${album.title}`}><ChevronRight size={20} /></button>
      </div>
      <div className="album-card-body">
        <span className="album-type"><Music2 size={12} /> {album.id.startsWith('local-') ? 'Featured' : 'Album'}</span>
        <h2>{album.title}</h2>
        <p>{album.artist}</p>
        <div className="card-footer">
          <span>{album.publishedAt || 'Latest'} <i>•</i> {album.genre || 'Album'}</span>
          <button aria-label={saved ? 'Album saved' : `Save ${album.title} offline`} onClick={(e) => { e.stopPropagation(); onDownload(album); }} disabled={saved}>
            {saved ? <Check size={16} /> : <Download size={16} />}
          </button>
        </div>
      </div>
    </article>
  );
}

export default App;
