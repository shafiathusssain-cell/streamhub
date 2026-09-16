/*
 * music-search edge function (v3 - iTunes Search API)
 * Proxies the iTunes Search API (no API key required) to search for albums,
 * tracks, and podcasts, and to look up album details with full track lists.
 * Actions:
 *   - { action: "search", query: "<text>", media: "album|song|podcast" }
 *   - { action: "details", id: "<collectionId>" }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const ITUNES_LOOKUP = "https://itunes.apple.com/lookup";

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
  description?: string;
  trackCount?: number;
  genre?: string;
  collectionUrl?: string;
  feedUrl?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function upscaleArtwork(url: string | undefined, size = 600): string {
  if (!url) return "";
  return url.replace(/\/\d+x\d+bb\.jpg$/, `/${size}x${size}bb.jpg`);
}

function formatDuration(millis: number | undefined): number {
  if (!millis) return 0;
  return Math.round(millis / 1000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      action?: string;
      query?: string;
      media?: string;
      id?: string;
    };
    const action = body.action ?? "search";

    if (action === "search") {
      const query = (body.query ?? "").trim();
      if (!query) return json({ albums: [], tracks: [], podcasts: [] });

      const media = body.media ?? "album";
      const entity = media === "song" ? "song" : media === "podcast" ? "podcast" : "album";

      const searchUrl = new URL(ITUNES_SEARCH);
      searchUrl.searchParams.set("term", query);
      searchUrl.searchParams.set("entity", entity);
      searchUrl.searchParams.set("limit", "24");

      const searchResponse = await fetch(searchUrl, { method: "GET" });
      if (!searchResponse.ok) {
        return json({ error: `Search failed (${searchResponse.status})` }, 502);
      }
      const searchData = await searchResponse.json() as { results: Record<string, unknown>[] };

      if (entity === "album") {
        const albums: Album[] = (searchData.results ?? [])
          .filter((r) => r.wrapperType === "collection")
          .map((r) => ({
            id: String(r.collectionId),
            title: String(r.collectionName ?? "Untitled"),
            artist: String(r.artistName ?? "Unknown artist"),
            image: upscaleArtwork(r.artworkUrl100 as string | undefined, 600),
            publishedAt: (r.releaseDate as string | undefined)?.slice(0, 4),
            trackCount: r.trackCount as number | undefined,
            genre: r.primaryGenreName as string | undefined,
            collectionUrl: r.collectionViewUrl as string | undefined,
          }));
        return json({ albums });
      }

      if (entity === "song") {
        const tracks: Track[] = (searchData.results ?? [])
          .filter((r) => r.wrapperType === "track" && r.kind === "song")
          .map((r) => ({
            id: String(r.trackId),
            title: String(r.trackName ?? "Untitled"),
            artist: String(r.artistName ?? "Unknown artist"),
            image: upscaleArtwork(r.artworkUrl100 as string | undefined, 100),
            position: r.trackNumber as number | undefined,
            duration: formatDuration(r.trackTimeMillis as number | undefined),
            previewUrl: r.previewUrl as string | undefined,
            collectionUrl: r.trackViewUrl as string | undefined,
          }));
        return json({ tracks });
      }

      if (entity === "podcast") {
        const podcasts: Podcast[] = (searchData.results ?? [])
          .filter((r) => r.wrapperType === "track" && r.kind === "podcast")
          .map((r) => ({
            id: String(r.collectionId),
            title: String(r.collectionName ?? "Untitled"),
            artist: String(r.artistName ?? "Unknown artist"),
            image: upscaleArtwork(r.artworkUrl100 as string | undefined, 600),
            trackCount: r.trackCount as number | undefined,
            genre: r.primaryGenreName as string | undefined,
            collectionUrl: r.collectionViewUrl as string | undefined,
            feedUrl: r.feedUrl as string | undefined,
          }));
        return json({ podcasts });
      }

      return json({ albums: [] });
    }

    if (action === "details") {
      const collectionId = (body.id ?? "").trim();
      if (!collectionId) return json({ error: "Missing album id." }, 400);

      const lookupUrl = new URL(ITUNES_LOOKUP);
      lookupUrl.searchParams.set("id", collectionId);
      lookupUrl.searchParams.set("entity", "song");

      const lookupResponse = await fetch(lookupUrl, { method: "GET" });
      if (!lookupResponse.ok) {
        return json({ error: `Album lookup failed (${lookupResponse.status})` }, 502);
      }
      const lookupData = await lookupResponse.json() as { results: Record<string, unknown>[] };

      const collection = (lookupData.results ?? []).find((r) => r.wrapperType === "collection");
      if (!collection) return json({ error: "Album not found." }, 404);

      const tracks: Track[] = (lookupData.results ?? [])
        .filter((r) => r.wrapperType === "track" && r.kind === "song")
        .map((r) => ({
          id: String(r.trackId),
          title: String(r.trackName ?? "Untitled"),
          artist: String(r.artistName ?? "Unknown artist"),
          image: upscaleArtwork(r.artworkUrl100 as string | undefined, 100),
          position: r.trackNumber as number | undefined,
          duration: formatDuration(r.trackTimeMillis as number | undefined),
          previewUrl: r.previewUrl as string | undefined,
          collectionUrl: r.trackViewUrl as string | undefined,
        }));

      const album: Album = {
        id: String(collection.collectionId),
        title: String(collection.collectionName ?? "Untitled"),
        artist: String(collection.artistName ?? "Unknown artist"),
        image: upscaleArtwork(collection.artworkUrl100 as string | undefined, 600),
        description: collection.copyright as string | undefined,
        publishedAt: (collection.releaseDate as string | undefined)?.slice(0, 4),
        trackCount: collection.trackCount as number | undefined,
        genre: collection.primaryGenreName as string | undefined,
        tracks,
        collectionUrl: collection.collectionViewUrl as string | undefined,
      };

      return json({ album });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected server error" }, 500);
  }
});
