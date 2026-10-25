import { useCallback, useEffect, useMemo, useState } from "react";
import { InvarianceProvider, PromptWidget, Slot } from "@invariance/client/react";
import type { InvarianceClientConfig } from "@invariance/client";
import type { ContinueItem, Show, WatchlistItem } from "../server/app";

const DEMO_USERS = ["demo-user", "demo-user2"];
const DEMO_USER = localStorage.getItem("demo-user") ?? "demo-user";

function switchUser(user: string) {
  localStorage.setItem("demo-user", user);
  location.reload();
}

const config: InvarianceClientConfig = {
  registryUrl: import.meta.env.VITE_INVARIANCE_REGISTRY ?? "http://localhost:4400",
  appId: "streamline",
  subjectId: DEMO_USER,
};

const apiHeaders = { "x-demo-user": DEMO_USER, "content-type": "application/json" };

const GENRE_ORDER = ["Sci-Fi", "Thriller", "Drama", "Comedy", "Documentary", "Reality"];

export function App() {
  return (
    <InvarianceProvider config={config}>
      <Browse />
      <PromptWidget />
    </InvarianceProvider>
  );
}

function Browse() {
  const [shows, setShows] = useState<Show[]>([]);
  const [featured, setFeatured] = useState<Show | null>(null);
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  const refreshWatchlist = useCallback(() => {
    void fetch("/api/watchlist", { headers: apiHeaders })
      .then((r) => r.json())
      .then((d: { items: WatchlistItem[] }) => setWatchlist(d.items));
  }, []);

  useEffect(() => {
    void fetch("/api/shows", { headers: apiHeaders })
      .then((r) => r.json())
      .then((d: { shows: Show[] }) => setShows(d.shows));
    void fetch("/api/featured", { headers: apiHeaders })
      .then((r) => r.json())
      .then((d: { show: Show }) => setFeatured(d.show));
    void fetch("/api/continue", { headers: apiHeaders })
      .then((r) => r.json())
      .then((d: { items: ContinueItem[] }) => setContinueItems(d.items));
    refreshWatchlist();
  }, [refreshWatchlist]);

  const addToList = useCallback(
    (showId: string) =>
      void fetch("/api/watchlist", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ showId }),
      }).then(refreshWatchlist),
    [refreshWatchlist],
  );

  const removeFromList = useCallback(
    (itemId: string) =>
      void fetch(`/api/watchlist/${itemId}`, { method: "DELETE", headers: apiHeaders }).then(
        refreshWatchlist,
      ),
    [refreshWatchlist],
  );

  const byId = useMemo(() => new Map(shows.map((s) => [s.id, s])), [shows]);
  const inList = useMemo(() => new Set(watchlist.map((i) => i.showId)), [watchlist]);
  const genres = useMemo(
    () =>
      GENRE_ORDER.map((genre) => ({
        genre,
        shows: shows.filter((s) => s.genre === genre),
      })).filter((g) => g.shows.length > 0),
    [shows],
  );

  return (
    <>
      <Nav />
      {featured && <Billboard show={featured} inList={inList.has(featured.id)} onAdd={addToList} />}
      <div className="rows">
        {continueItems.length > 0 && (
          <ContinueRow items={continueItems} byId={byId} />
        )}
        {watchlist.length > 0 && (
          <MyListRow items={watchlist} byId={byId} onRemove={removeFromList} />
        )}
        {genres.map(({ genre, shows: genreShows }) => (
          <Row key={genre} heading={genre}>
            {genreShows.map((show) => (
              <ShowCard key={show.id} show={show} inList={inList.has(show.id)} onAdd={addToList} />
            ))}
          </Row>
        ))}
      </div>
      <Footer />
    </>
  );
}

function Nav() {
  return (
    <nav className="nav" data-component="nav">
      <span className="brand">STREAMLINE</span>
      <a className="nav-link active">Home</a>
      <a className="nav-link">Shows</a>
      <a className="nav-link">My List</a>
      <span className="nav-extra">
        <Slot componentId="nav" slot="extra" />
      </span>
      <select
        className="user-chip"
        value={DEMO_USERS.includes(DEMO_USER) ? DEMO_USER : DEMO_USERS[0]}
        onChange={(e) => switchUser(e.target.value)}
      >
        {DEMO_USERS.map((user) => (
          <option key={user} value={user}>
            {user}
          </option>
        ))}
      </select>
    </nav>
  );
}

function Billboard({
  show,
  inList,
  onAdd,
}: {
  show: Show;
  inList: boolean;
  onAdd: (id: string) => void;
}) {
  return (
    <header
      className="billboard"
      data-component="billboard"
      style={{ ["--poster-hue" as string]: show.hue }}
    >
      <div className="billboard-content">
        <span className="billboard-tagline">
          <Slot componentId="billboard" slot="tagline">
            #1 in {show.genre} this week
          </Slot>
        </span>
        <h1>{show.title}</h1>
        <span className="billboard-meta">
          <Slot componentId="billboard" slot="meta">
            {show.year} · {show.maturity} · {show.durationMin}m · ★ {show.rating.toFixed(1)}
          </Slot>
        </span>
        <p className="billboard-synopsis">{show.synopsis}</p>
        <div className="billboard-actions">
          <button className="btn-play">▶ Play</button>
          <button className="btn-list" disabled={inList} onClick={() => onAdd(show.id)}>
            {inList ? "✓ In My List" : "+ My List"}
          </button>
        </div>
      </div>
    </header>
  );
}

function Row({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="row" data-component="row">
      <h2 className="row-heading">
        {heading}
        <span className="row-heading-extra">
          <Slot componentId="row" slot="heading-extra" />
        </span>
      </h2>
      <div className="row-scroller">{children}</div>
    </section>
  );
}

function Poster({ show, children }: { show: Show; children?: React.ReactNode }) {
  return (
    <div className="poster" style={{ ["--poster-hue" as string]: show.hue }}>
      <span className="poster-initials">
        {show.title.split(" ").slice(0, 2).map((w) => w[0]).join("")}
      </span>
      {children}
    </div>
  );
}

function ShowCard({
  show,
  inList,
  onAdd,
}: {
  show: Show;
  inList: boolean;
  onAdd: (id: string) => void;
}) {
  return (
    <article className="show-card" data-component="show-card">
      <Poster show={show}>
        <span className="card-badge">
          <Slot componentId="show-card" slot="badge" />
        </span>
        <span className="maturity">{show.maturity}</span>
      </Poster>
      <div className="card-body">
        <h3>{show.title}</h3>
        <span className="meta">
          {show.year} · {show.genre} · <span className="rating">★ {show.rating.toFixed(1)}</span>
        </span>
        <button className="card-add" disabled={inList} onClick={() => onAdd(show.id)}>
          {inList ? "✓ In My List" : "+ My List"}
        </button>
      </div>
    </article>
  );
}

function ContinueRow({ items, byId }: { items: ContinueItem[]; byId: Map<string, Show> }) {
  return (
    <Row heading="Continue watching">
      {items.flatMap((item) => {
        const show = byId.get(item.showId);
        if (!show) return [];
        return [
          <article className="show-card" data-component="show-card" key={item.showId}>
            <Poster show={show}>
              <span className="maturity">{show.maturity}</span>
              <span className="progress" style={{ width: `${item.progress}%` }} />
            </Poster>
            <div className="card-body">
              <h3>{show.title}</h3>
              <span className="meta">{item.progress}% watched</span>
            </div>
          </article>,
        ];
      })}
    </Row>
  );
}

function MyListRow({
  items,
  byId,
  onRemove,
}: {
  items: WatchlistItem[];
  byId: Map<string, Show>;
  onRemove: (itemId: string) => void;
}) {
  return (
    <Row heading="My List">
      {items.flatMap((item) => {
        const show = byId.get(item.showId);
        if (!show) return [];
        return [
          <article className="show-card" data-component="show-card" key={item.id}>
            <Poster show={show}>
              <span className="maturity">{show.maturity}</span>
            </Poster>
            <div className="card-body">
              <h3>{show.title}</h3>
              <span className="meta">
                {show.year} · <span className="rating">★ {show.rating.toFixed(1)}</span>
              </span>
              <button className="card-add" onClick={() => onRemove(item.id)}>
                − Remove
              </button>
            </div>
          </article>,
        ];
      })}
    </Row>
  );
}

function Footer() {
  return (
    <footer className="footer" data-component="footer">
      <Slot componentId="footer" slot="message">
        Streamline — a demo app for the Invariance customization platform.
      </Slot>
    </footer>
  );
}
