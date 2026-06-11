import { useEffect, useMemo, useState } from "react";
import { InvarianceProvider, PromptWidget, Slot } from "@invariance/client/react";
import type { InvarianceClientConfig } from "@invariance/client";
import type { Show, WatchlistItem } from "../server/app";

const DEMO_USER = localStorage.getItem("demo-user") ?? "demo-user";

const config: InvarianceClientConfig = {
  registryUrl: import.meta.env.VITE_INVARIANCE_REGISTRY ?? "http://localhost:4400",
  appId: "streamline",
  subjectId: DEMO_USER,
};

const apiHeaders = { "x-demo-user": DEMO_USER, "content-type": "application/json" };

export function App() {
  return (
    <InvarianceProvider config={config}>
      <Hero />
      <div className="layout">
        <ShowGrid />
        <Watchlist />
      </div>
      <PromptWidget />
    </InvarianceProvider>
  );
}

function Hero() {
  return (
    <header className="hero" data-component="hero">
      <h1>Streamline</h1>
      <span className="tagline">
        <Slot componentId="hero" slot="tagline">
          Stories worth staying in for.
        </Slot>
      </span>
    </header>
  );
}

function ShowGrid() {
  const [shows, setShows] = useState<Show[]>([]);
  useEffect(() => {
    void fetch("/api/shows", { headers: apiHeaders })
      .then((r) => r.json())
      .then((data: { shows: Show[] }) => setShows(data.shows));
  }, []);

  const add = (showId: string) =>
    fetch("/api/watchlist", {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify({ showId }),
    });

  return (
    <main className="show-grid">
      {shows.map((show) => (
        <article className="show-card" data-component="show-card" key={show.id}>
          <h3>{show.title}</h3>
          <Slot componentId="show-card" slot="badge" />
          <span className="meta">
            {show.year} · {show.genre}
          </span>
          <span className="rating">★ {show.rating.toFixed(1)}</span>
          <button onClick={() => void add(show.id)}>+ Watchlist</button>
        </article>
      ))}
    </main>
  );
}

function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const refresh = useMemo(
    () => () =>
      void fetch("/api/watchlist", { headers: apiHeaders })
        .then((r) => r.json())
        .then((data: { items: WatchlistItem[] }) => setItems(data.items)),
    [],
  );
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <aside className="watchlist" data-component="watchlist">
      <h2>My watchlist</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.showId}
            {item.note ? ` — ${item.note}` : ""}
          </li>
        ))}
      </ul>
    </aside>
  );
}
