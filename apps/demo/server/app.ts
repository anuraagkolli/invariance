import express, { type Express } from "express";
import { randomUUID } from "node:crypto";

export interface Show {
  id: string;
  title: string;
  year: number;
  genre: string;
  rating: number;
  maturity: "TV-MA" | "TV-14" | "TV-PG";
  durationMin: number;
  synopsis: string;
  /** Poster accent hue (the demo renders gradient posters, no image assets). */
  hue: number;
}

export interface WatchlistItem {
  id: string;
  showId: string;
  note?: string;
  priority?: number;
  addedAt: string;
}

export interface ContinueItem {
  showId: string;
  /** 0-100 percent watched. */
  progress: number;
}

export const SHOWS: Show[] = [
  { id: "s1", title: "Orbital Decay", year: 2024, genre: "Sci-Fi", rating: 8.4, maturity: "TV-14", durationMin: 52, synopsis: "A salvage crew discovers the station they were sent to scrap is still inhabited — by something that signed the work order.", hue: 230 },
  { id: "s2", title: "Midnight Cartographers", year: 2023, genre: "Sci-Fi", rating: 8.9, maturity: "TV-MA", durationMin: 58, synopsis: "Every night at 3:33, the city's streets rearrange. A team of insomniac surveyors maps the changes — and what moves them.", hue: 270 },
  { id: "s3", title: "The Lazarus Protocol", year: 2026, genre: "Sci-Fi", rating: 7.8, maturity: "TV-14", durationMin: 47, synopsis: "Cryonics patients are waking up early. Their memories belong to other people.", hue: 195 },
  { id: "s4", title: "Glasshouse", year: 2026, genre: "Thriller", rating: 7.2, maturity: "TV-MA", durationMin: 44, synopsis: "A family of con artists inherits a smart home that knows their tells.", hue: 160 },
  { id: "s5", title: "The Long Quiet", year: 2022, genre: "Drama", rating: 7.9, maturity: "TV-14", durationMin: 61, synopsis: "After the storm of the century, a coastal town rebuilds everything except its silences.", hue: 210 },
  { id: "s6", title: "Comet Season", year: 2021, genre: "Drama", rating: 7.5, maturity: "TV-PG", durationMin: 49, synopsis: "Two rival astronomers fall in love during the last comet visible in their lifetimes.", hue: 320 },
  { id: "s7", title: "Undertow", year: 2025, genre: "Thriller", rating: 8.1, maturity: "TV-MA", durationMin: 50, synopsis: "A small-town lifeguard starts receiving distress calls from swimmers who haven't drowned yet.", hue: 185 },
  { id: "s8", title: "Paper Empire", year: 2023, genre: "Drama", rating: 8.6, maturity: "TV-MA", durationMin: 57, synopsis: "The rise and fall of a counterfeiting dynasty, told by the forger who never got caught.", hue: 35 },
  { id: "s9", title: "Knife's Edge Kitchen", year: 2025, genre: "Reality", rating: 6.8, maturity: "TV-14", durationMin: 43, synopsis: "Twelve chefs. One restaurant on a cliff. The tide decides service hours.", hue: 10 },
  { id: "s10", title: "Salvage Queens", year: 2024, genre: "Reality", rating: 7.1, maturity: "TV-PG", durationMin: 41, synopsis: "Three sisters turn shipwrecks into showrooms in the Outer Banks.", hue: 45 },
  { id: "s11", title: "The Foley Artist", year: 2022, genre: "Comedy", rating: 7.7, maturity: "TV-14", durationMin: 31, synopsis: "He makes sound effects for prestige dramas. His life refuses to be one.", hue: 55 },
  { id: "s12", title: "Borrowed Dogs", year: 2026, genre: "Comedy", rating: 8.0, maturity: "TV-PG", durationMin: 28, synopsis: "A dog-walking app matches lonely people with other people's dogs — and other people's problems.", hue: 95 },
  { id: "s13", title: "Static", year: 2024, genre: "Comedy", rating: 7.3, maturity: "TV-14", durationMin: 26, synopsis: "A pirate radio station broadcasts from a laundromat that may be a front. For the hosts, it's home.", hue: 285 },
  { id: "s14", title: "Deep Time", year: 2023, genre: "Documentary", rating: 9.1, maturity: "TV-PG", durationMin: 55, synopsis: "Cave divers, ice cores, and the people who read the planet's memory.", hue: 200 },
  { id: "s15", title: "The Last Typewriter", year: 2021, genre: "Documentary", rating: 8.2, maturity: "TV-PG", durationMin: 48, synopsis: "Inside the workshop that repairs the world's remaining typewriters — and the letters people still trust to them.", hue: 25 },
  { id: "s16", title: "Apex", year: 2025, genre: "Documentary", rating: 8.5, maturity: "TV-14", durationMin: 51, synopsis: "A year with the rangers protecting the last megafauna corridors on earth.", hue: 130 },
  { id: "s17", title: "Cold Open", year: 2026, genre: "Thriller", rating: 7.6, maturity: "TV-MA", durationMin: 46, synopsis: "A true-crime podcaster realizes her newest case is following her script.", hue: 250 },
  { id: "s18", title: "Hearthside", year: 2022, genre: "Reality", rating: 6.5, maturity: "TV-PG", durationMin: 39, synopsis: "Strangers renovate remote cabins they've never seen, then spend a winter in them.", hue: 15 },
];

export const FEATURED_ID = "s2";

const CONTINUE_DEFAULTS: ContinueItem[] = [
  { showId: "s5", progress: 45 },
  { showId: "s7", progress: 82 },
  { showId: "s12", progress: 15 },
];

export interface DemoServerOptions {
  /** Invariance middleware (phase 4) mounted ahead of the API routes. */
  middleware?: express.RequestHandler;
}

function subjectOf(req: express.Request): string {
  return (req.header("x-demo-user") ?? "anonymous").toString();
}

export function createDemoServer(options: DemoServerOptions = {}): Express {
  const app = express();
  app.use(express.json());
  if (options.middleware) app.use(options.middleware);

  const watchlists = new Map<string, WatchlistItem[]>();
  const listOf = (user: string): WatchlistItem[] => {
    let list = watchlists.get(user);
    if (!list) {
      list = [];
      watchlists.set(user, list);
    }
    return list;
  };

  app.get("/api/shows", (_req, res) => {
    res.json({ shows: SHOWS });
  });

  app.get("/api/featured", (_req, res) => {
    res.json({ show: SHOWS.find((s) => s.id === FEATURED_ID) });
  });

  app.get("/api/continue", (_req, res) => {
    res.json({ items: CONTINUE_DEFAULTS });
  });

  app.get("/api/watchlist", (req, res) => {
    res.json({ items: listOf(subjectOf(req)) });
  });

  app.post("/api/watchlist", (req, res) => {
    const { showId, note, priority } = req.body as Partial<WatchlistItem>;
    if (!showId || !SHOWS.some((s) => s.id === showId)) {
      res.status(400).json({ error: "unknown showId" });
      return;
    }
    const list = listOf(subjectOf(req));
    if (list.some((i) => i.showId === showId)) {
      res.status(409).json({ error: "already in list" });
      return;
    }
    const item: WatchlistItem = {
      id: randomUUID(),
      showId,
      ...(note !== undefined ? { note } : {}),
      ...(priority !== undefined ? { priority } : {}),
      addedAt: new Date().toISOString(),
    };
    list.push(item);
    res.status(201).json({ item });
  });

  app.delete("/api/watchlist/:id", (req, res) => {
    const list = listOf(subjectOf(req));
    const index = list.findIndex((i) => i.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "not found" });
      return;
    }
    list.splice(index, 1);
    res.status(204).end();
  });

  return app;
}
