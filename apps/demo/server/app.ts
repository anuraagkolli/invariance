import express, { type Express } from "express";
import { randomUUID } from "node:crypto";

export interface Show {
  id: string;
  title: string;
  year: number;
  genre: string;
  rating: number;
}

export interface WatchlistItem {
  id: string;
  showId: string;
  note?: string;
  priority?: number;
  addedAt: string;
}

export const SHOWS: Show[] = [
  { id: "s1", title: "Orbital Decay", year: 2024, genre: "sci-fi", rating: 8.4 },
  { id: "s2", title: "The Long Quiet", year: 2022, genre: "drama", rating: 7.9 },
  { id: "s3", title: "Knife's Edge Kitchen", year: 2025, genre: "reality", rating: 6.8 },
  { id: "s4", title: "Midnight Cartographers", year: 2023, genre: "mystery", rating: 8.9 },
  { id: "s5", title: "Glasshouse", year: 2026, genre: "thriller", rating: 7.2 },
  { id: "s6", title: "Comet Season", year: 2021, genre: "romance", rating: 7.5 },
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

  app.get("/api/watchlist", (req, res) => {
    res.json({ items: listOf(subjectOf(req)) });
  });

  app.post("/api/watchlist", (req, res) => {
    const { showId, note, priority } = req.body as Partial<WatchlistItem>;
    if (!showId || !SHOWS.some((s) => s.id === showId)) {
      res.status(400).json({ error: "unknown showId" });
      return;
    }
    const item: WatchlistItem = {
      id: randomUUID(),
      showId,
      ...(note !== undefined ? { note } : {}),
      ...(priority !== undefined ? { priority } : {}),
      addedAt: new Date().toISOString(),
    };
    listOf(subjectOf(req)).push(item);
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
