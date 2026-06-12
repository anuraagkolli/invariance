export type Maturity = 'ALL' | '13+' | '16+' | '18+'

export interface Title {
  id: string
  title: string
  year: number
  genre: string
  durationMin: number
  maturity: Maturity
  // 0-360, spread widely so CSS-gradient posters read as a varied wall of art.
  hue: number
  tagline?: string
  // 0-1 watched fraction, only set for continue-watching entries.
  progress?: number
}

// ~36 evocative fake titles. Hues are spread across the wheel so the poster
// wall never feels monochrome; the crimson accent stays the only UI loud note.
export const TITLES: Title[] = [
  { id: 'solar-drift', title: 'Solar Drift', year: 2024, genre: 'Sci-Fi', durationMin: 128, maturity: '13+', hue: 28, tagline: 'When the last engine dies, the stars come to you.' },
  { id: 'quiet-harbor', title: 'The Quiet Harbor', year: 2023, genre: 'Drama', durationMin: 112, maturity: 'ALL', hue: 205, tagline: 'Some tides never let you leave.' },
  { id: 'neon-tide', title: 'Neon Tide', year: 2025, genre: 'Thriller', durationMin: 99, maturity: '16+', hue: 320, tagline: 'The city glows brightest where it hides the most.' },
  { id: 'arc-of-ash', title: 'Arc of Ash', year: 2022, genre: 'Fantasy', durationMin: 141, maturity: '16+', hue: 14, tagline: 'A crown forged in the embers of an empire.' },
  { id: 'glass-meridian', title: 'Glass Meridian', year: 2024, genre: 'Mystery', durationMin: 118, maturity: '13+', hue: 178 },
  { id: 'paper-moons', title: 'Paper Moons', year: 2021, genre: 'Romance', durationMin: 104, maturity: 'ALL', hue: 290 },
  { id: 'iron-orchard', title: 'Iron Orchard', year: 2023, genre: 'Western', durationMin: 134, maturity: '16+', hue: 38 },
  { id: 'velvet-static', title: 'Velvet Static', year: 2025, genre: 'Horror', durationMin: 96, maturity: '18+', hue: 268, tagline: 'It speaks in the spaces between channels.' },
  { id: 'lantern-bearers', title: 'The Lantern Bearers', year: 2020, genre: 'Adventure', durationMin: 122, maturity: 'ALL', hue: 48 },
  { id: 'cobalt-hours', title: 'Cobalt Hours', year: 2024, genre: 'Crime', durationMin: 110, maturity: '16+', hue: 232 },
  { id: 'wild-currents', title: 'Wild Currents', year: 2022, genre: 'Documentary', durationMin: 87, maturity: 'ALL', hue: 158 },
  { id: 'midnight-cartography', title: 'Midnight Cartography', year: 2025, genre: 'Sci-Fi', durationMin: 137, maturity: '13+', hue: 252, tagline: 'Every map ends where the dark begins.' },
  { id: 'ember-and-thorn', title: 'Ember & Thorn', year: 2023, genre: 'Fantasy', durationMin: 145, maturity: '16+', hue: 6 },
  { id: 'static-gardens', title: 'Static Gardens', year: 2021, genre: 'Drama', durationMin: 101, maturity: '13+', hue: 132 },
  { id: 'the-long-noon', title: 'The Long Noon', year: 2024, genre: 'Western', durationMin: 119, maturity: '16+', hue: 32 },
  { id: 'porcelain-sky', title: 'Porcelain Sky', year: 2022, genre: 'Romance', durationMin: 108, maturity: 'ALL', hue: 198 },
  { id: 'hollow-frequencies', title: 'Hollow Frequencies', year: 2025, genre: 'Horror', durationMin: 92, maturity: '18+', hue: 282 },
  { id: 'gilded-machine', title: 'The Gilded Machine', year: 2023, genre: 'Sci-Fi', durationMin: 131, maturity: '13+', hue: 44 },
  { id: 'saltwater-ghosts', title: 'Saltwater Ghosts', year: 2020, genre: 'Mystery', durationMin: 115, maturity: '16+', hue: 188 },
  { id: 'crimson-archive', title: 'The Crimson Archive', year: 2024, genre: 'Thriller', durationMin: 124, maturity: '16+', hue: 350, tagline: 'Every secret was filed. None were forgotten.' },
  { id: 'northern-engines', title: 'Northern Engines', year: 2022, genre: 'Adventure', durationMin: 126, maturity: '13+', hue: 218 },
  { id: 'feral-light', title: 'Feral Light', year: 2025, genre: 'Drama', durationMin: 113, maturity: '16+', hue: 96 },
  { id: 'the-amber-room', title: 'The Amber Room', year: 2021, genre: 'Crime', durationMin: 107, maturity: '16+', hue: 52 },
  { id: 'tidal-empire', title: 'Tidal Empire', year: 2024, genre: 'Fantasy', durationMin: 149, maturity: '13+', hue: 172, tagline: 'The throne was always underwater.' },
  { id: 'paper-comets', title: 'Paper Comets', year: 2023, genre: 'Animation', durationMin: 94, maturity: 'ALL', hue: 308 },
  { id: 'dust-and-signal', title: 'Dust & Signal', year: 2022, genre: 'Sci-Fi', durationMin: 121, maturity: '13+', hue: 24 },
  { id: 'the-violet-hour', title: 'The Violet Hour', year: 2025, genre: 'Romance', durationMin: 99, maturity: '13+', hue: 276 },
  { id: 'broken-meridian', title: 'Broken Meridian', year: 2020, genre: 'Thriller', durationMin: 116, maturity: '16+', hue: 142 },
  { id: 'lantern-and-key', title: 'Lantern & Key', year: 2024, genre: 'Adventure', durationMin: 128, maturity: 'ALL', hue: 64 },
  { id: 'concrete-orchids', title: 'Concrete Orchids', year: 2023, genre: 'Drama', durationMin: 105, maturity: '16+', hue: 332 },
  { id: 'the-grey-tide', title: 'The Grey Tide', year: 2021, genre: 'War', durationMin: 138, maturity: '16+', hue: 212 },
  { id: 'sundial-children', title: 'Sundial Children', year: 2025, genre: 'Fantasy', durationMin: 133, maturity: '13+', hue: 78, tagline: 'Time only obeys the ones who learn to wait.' },
  { id: 'electric-sermons', title: 'Electric Sermons', year: 2022, genre: 'Documentary', durationMin: 83, maturity: '13+', hue: 256 },
  { id: 'the-far-shallows', title: 'The Far Shallows', year: 2024, genre: 'Mystery', durationMin: 111, maturity: '16+', hue: 164 },
  { id: 'marrow-and-moon', title: 'Marrow & Moon', year: 2023, genre: 'Horror', durationMin: 97, maturity: '18+', hue: 298 },
  { id: 'last-cartographer', title: 'The Last Cartographer', year: 2020, genre: 'Adventure', durationMin: 142, maturity: '13+', hue: 40 },
]

const byId = (id: string): Title => {
  const t = TITLES.find((x) => x.id === id)
  if (!t) throw new Error(`unknown title id: ${id}`)
  return t
}

const withProgress = (id: string, progress: number): Title => ({ ...byId(id), progress })

export interface TitleRow {
  id: string
  heading: string
  // slot name the CarouselRow/GridRow renders inside
  slot: string
  titles: Title[]
}

// Titles may repeat across rows sparingly (a Netflix-y feel), but each row is
// otherwise distinct so the wall stays varied.
export const ROWS: TitleRow[] = [
  {
    id: 'trending',
    heading: 'Trending Now',
    slot: 'row-trending',
    titles: [
      byId('crimson-archive'),
      byId('solar-drift'),
      byId('neon-tide'),
      byId('velvet-static'),
      byId('tidal-empire'),
      byId('midnight-cartography'),
      byId('arc-of-ash'),
      byId('cobalt-hours'),
    ],
  },
  {
    id: 'continue',
    heading: 'Continue Watching',
    slot: 'row-continue',
    titles: [
      withProgress('quiet-harbor', 0.72),
      withProgress('iron-orchard', 0.34),
      withProgress('glass-meridian', 0.91),
      withProgress('northern-engines', 0.18),
      withProgress('the-amber-room', 0.55),
      withProgress('feral-light', 0.43),
    ],
  },
  {
    id: 'originals',
    heading: 'Nebula Originals',
    slot: 'row-originals',
    titles: [
      byId('midnight-cartography'),
      byId('tidal-empire'),
      byId('sundial-children'),
      byId('velvet-static'),
      byId('crimson-archive'),
      byId('electric-sermons'),
    ],
  },
  {
    id: 'new',
    heading: 'New Releases',
    slot: 'row-new',
    titles: [
      byId('hollow-frequencies'),
      byId('the-violet-hour'),
      byId('marrow-and-moon'),
      byId('feral-light'),
      byId('sundial-children'),
      byId('neon-tide'),
      byId('paper-comets'),
      byId('the-far-shallows'),
    ],
  },
  {
    id: 'acclaimed',
    heading: 'Critically Acclaimed',
    slot: 'row-acclaimed',
    titles: [
      byId('porcelain-sky'),
      byId('static-gardens'),
      byId('saltwater-ghosts'),
      byId('the-grey-tide'),
      byId('lantern-bearers'),
      byId('broken-meridian'),
      byId('wild-currents'),
      byId('paper-moons'),
    ],
  },
]

// The hero billboard features the first Trending title.
export const HERO_TITLE: Title = ROWS[0]!.titles[0]!
