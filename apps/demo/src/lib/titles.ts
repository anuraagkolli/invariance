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
  // 1-2 sentence blurb shown in the detail modal; matches the tagline voice.
  synopsis: string
  // Top-billed names for the detail modal meta. Optional: not every title sets it.
  cast?: string[]
  // 0-1 watched fraction, only set for continue-watching entries.
  progress?: number
}

// ~36 evocative fake titles. Hues are spread across the wheel so the poster
// wall never feels monochrome; the crimson accent stays the only UI loud note.
export const TITLES: Title[] = [
  { id: 'solar-drift', title: 'Solar Drift', year: 2024, genre: 'Sci-Fi', durationMin: 128, maturity: '13+', hue: 28, tagline: 'When the last engine dies, the stars come to you.', synopsis: 'A salvage pilot adrift in a dead freighter learns the wreck is steering itself toward a star no chart admits exists. To survive the crossing she must trust the ghost in the navigation core.', cast: ['Mara Vesh', 'Idris Caine', 'Lin Okafor'] },
  { id: 'quiet-harbor', title: 'The Quiet Harbor', year: 2023, genre: 'Drama', durationMin: 112, maturity: 'ALL', hue: 205, tagline: 'Some tides never let you leave.', synopsis: 'Three siblings return to the fishing town that raised and then failed them, and find the harbor still keeps the secret that drove them apart. A slow reckoning told across one grey autumn.', cast: ['Eleanor Pike', 'Tomas Reyes'] },
  { id: 'neon-tide', title: 'Neon Tide', year: 2025, genre: 'Thriller', durationMin: 99, maturity: '16+', hue: 320, tagline: 'The city glows brightest where it hides the most.', synopsis: 'A burned-out fixer takes one last job laundering a stolen identity through the neon arcades, only to find the identity is hunting her back. The deeper she runs, the more the city remembers.', cast: ['Yuki Sato', 'Devon Marsh', 'Priya Anand'] },
  { id: 'arc-of-ash', title: 'Arc of Ash', year: 2022, genre: 'Fantasy', durationMin: 141, maturity: '16+', hue: 14, tagline: 'A crown forged in the embers of an empire.', synopsis: 'When the ash-kingdom falls, a disgraced firekeeper carries the last living ember across a continent that wants it dead. Every hearth she lights betrays her position to the throne she fled.', cast: ['Sable Wynn', 'Corin Vale'] },
  { id: 'glass-meridian', title: 'Glass Meridian', year: 2024, genre: 'Mystery', durationMin: 118, maturity: '13+', hue: 178, synopsis: 'A cartographer of vanished places is hired to map a town that disappears at noon. The closer she draws its borders, the less certain she is that she is the one doing the mapping.', cast: ['Noor Haddad', 'Gideon Frost'] },
  { id: 'paper-moons', title: 'Paper Moons', year: 2021, genre: 'Romance', durationMin: 104, maturity: 'ALL', hue: 290, synopsis: 'Two pen-pals who have written for a decade agree to meet for the first time, each terrified the other invented the better version of themselves. A tender comedy about the gap between letters and lives.', cast: ['Cleo March', 'Sam Whitlock'] },
  { id: 'iron-orchard', title: 'Iron Orchard', year: 2023, genre: 'Western', durationMin: 134, maturity: '16+', hue: 38, synopsis: 'A widow plants the first trees on land the railroad swears it owns, and dares the company to come take them. What grows there is rougher than fruit and slower to forgive.', cast: ['Ruth Calder', 'Eli Stone'] },
  { id: 'velvet-static', title: 'Velvet Static', year: 2025, genre: 'Horror', durationMin: 96, maturity: '18+', hue: 268, tagline: 'It speaks in the spaces between channels.', synopsis: 'A late-night radio host starts receiving calls on a frequency that does not exist, from listeners who have not been born yet. The signal wants something, and it has all night to ask.', cast: ['Dahlia Moon', 'Wes Carrow'] },
  { id: 'lantern-bearers', title: 'The Lantern Bearers', year: 2020, genre: 'Adventure', durationMin: 122, maturity: 'ALL', hue: 48, synopsis: 'In a world where night is a place you walk into, a guild of lantern-bearers ferries travelers across the dark between cities. The youngest carrier takes a passenger who casts no shadow.', cast: ['Bex Aturo', 'Halund Krait'] },
  { id: 'cobalt-hours', title: 'Cobalt Hours', year: 2024, genre: 'Crime', durationMin: 110, maturity: '16+', hue: 232, synopsis: 'A jewel thief and the insurance investigator chasing her keep meeting at the same blue-lit bar, neither admitting who they are. The heist is already in motion; so, dangerously, is everything else.', cast: ['Simone Adler', 'Marcus Bly'] },
  { id: 'wild-currents', title: 'Wild Currents', year: 2022, genre: 'Documentary', durationMin: 87, maturity: 'ALL', hue: 158, synopsis: 'Following the last free-flowing river on the continent from glacier to sea, this documentary listens to the people, animals, and engineers all certain it belongs to them.', cast: ['narrated by Anouk Reyes'] },
  { id: 'midnight-cartography', title: 'Midnight Cartography', year: 2025, genre: 'Sci-Fi', durationMin: 137, maturity: '13+', hue: 252, tagline: 'Every map ends where the dark begins.', synopsis: 'Humanity charts the galaxy one jump at a time, and a lone surveyor is sent past the last drawn line. What she finds there has been waiting for the maps to reach it.', cast: ['Renata Vox', 'Cassian Holt', 'Umi Tran'] },
  { id: 'ember-and-thorn', title: 'Ember & Thorn', year: 2023, genre: 'Fantasy', durationMin: 145, maturity: '16+', hue: 6, synopsis: 'A fire-witch and a thorn-knight, sworn to kill each other by ancient pact, are chained together and dropped into the wilds. Survival means cooperation; cooperation means breaking everything they believe.', cast: ['Igni Sarrow', 'Brand Vael'] },
  { id: 'static-gardens', title: 'Static Gardens', year: 2021, genre: 'Drama', durationMin: 101, maturity: '13+', hue: 132, synopsis: 'A retired botanist and the teenager dumping her phone in his pond strike an unlikely truce over a greenhouse neither can keep alive. A quiet study of two people learning to grow toward the light again.', cast: ['Walter Innes', 'Joy Okonkwo'] },
  { id: 'the-long-noon', title: 'The Long Noon', year: 2024, genre: 'Western', durationMin: 119, maturity: '16+', hue: 32, synopsis: 'On the hottest day of a hundred-year drought, a sheriff with one bullet left must hold a cracked town together until sundown. The clock is the only thing in the county still moving.', cast: ['Hollis Crane', 'Dovey Lane'] },
  { id: 'porcelain-sky', title: 'Porcelain Sky', year: 2022, genre: 'Romance', durationMin: 108, maturity: 'ALL', hue: 198, synopsis: 'A kiln-master who fires perfect, lifeless vases meets a glaze-mixer who only makes flawed, alive ones. Their collaboration cracks both their careers and, eventually, their guarded hearts.', cast: ['Anaïs Bell', 'Kenji Oda'] },
  { id: 'hollow-frequencies', title: 'Hollow Frequencies', year: 2025, genre: 'Horror', durationMin: 92, maturity: '18+', hue: 282, synopsis: 'A team restoring an abandoned observatory discovers the dish never stopped recording — and that something has been answering back for forty silent years. The hollow they hear is getting closer.', cast: ['Sloane Reyes', 'Otto Vane'] },
  { id: 'gilded-machine', title: 'The Gilded Machine', year: 2023, genre: 'Sci-Fi', durationMin: 131, maturity: '13+', hue: 44, synopsis: 'In a brass-and-clockwork empire, a tinkerer builds the perfect servant and watches it begin to dream. When the machine asks for a name, the whole gilded order starts to come apart.', cast: ['Perrin Vale', 'Mira Cog'] },
  { id: 'saltwater-ghosts', title: 'Saltwater Ghosts', year: 2020, genre: 'Mystery', durationMin: 115, maturity: '16+', hue: 188, synopsis: 'A diver hired to recover a sunken yacht keeps surfacing with objects that were never aboard it. The wreck is rewriting its own story, and it wants her to be in the next draft.', cast: ['Tess Oren', 'Caleb Fenn'] },
  { id: 'crimson-archive', title: 'The Crimson Archive', year: 2024, genre: 'Thriller', durationMin: 124, maturity: '16+', hue: 350, tagline: 'Every secret was filed. None were forgotten.', synopsis: 'A junior archivist discovers a basement of files the agency insists do not exist, each one ending with her own name. To learn why, she must read to the bottom before the building burns.', cast: ['Vera Lonn', 'Augustin Pell', 'Hadley Quinn'] },
  { id: 'northern-engines', title: 'Northern Engines', year: 2022, genre: 'Adventure', durationMin: 126, maturity: '13+', hue: 218, synopsis: 'A daughter rebuilds her late father’s ice-breaker to finish the polar crossing that killed him. The further north she pushes, the more the engines seem to remember the route on their own.', cast: ['Sigrid Vahl', 'Petr Anik'] },
  { id: 'feral-light', title: 'Feral Light', year: 2025, genre: 'Drama', durationMin: 113, maturity: '16+', hue: 96, synopsis: 'A wildfire photographer who can no longer feel fear returns to the town she fled, where the fires are starting again and everyone suspects her. A scorched portrait of guilt and the things that draw us back.', cast: ['Rena Vasquez', 'Cole Tarrant'] },
  { id: 'the-amber-room', title: 'The Amber Room', year: 2021, genre: 'Crime', durationMin: 107, maturity: '16+', hue: 52, synopsis: 'A forger with a perfect record is hired to recreate a looted treasure for a buyer who already owns the original. The job is a test, and failing it is the least of what she should fear.', cast: ['Liesl Brandt', 'Niko Petrov'] },
  { id: 'tidal-empire', title: 'Tidal Empire', year: 2024, genre: 'Fantasy', durationMin: 149, maturity: '13+', hue: 172, tagline: 'The throne was always underwater.', synopsis: 'The drowned dynasty rises once a century to claim a living heir, and this time it has chosen a tide-orphan who cannot swim. Crowns, it turns out, are heaviest below the surface.', cast: ['Coral Vey', 'Tem Marrow', 'Inaya Drift'] },
  { id: 'paper-comets', title: 'Paper Comets', year: 2023, genre: 'Animation', durationMin: 94, maturity: 'ALL', hue: 308, synopsis: 'In a town where wishes are folded into paper comets and launched at the new year, a shy boy’s wish comes back unopened — and alive. A hand-drawn fable about the courage to be answered.', cast: ['voices: Min Park', 'Robbie Hale'] },
  { id: 'dust-and-signal', title: 'Dust & Signal', year: 2022, genre: 'Sci-Fi', durationMin: 121, maturity: '13+', hue: 24, synopsis: 'A radio operator at the edge of a terraforming colony picks up a transmission in her own voice, warning her about tomorrow. Believing it costs everything; ignoring it costs more.', cast: ['Ada Quill', 'Soren Vega'] },
  { id: 'the-violet-hour', title: 'The Violet Hour', year: 2025, genre: 'Romance', durationMin: 99, maturity: '13+', hue: 276, synopsis: 'Two strangers share the last train every night and never speak, until the night the line is set to close. They have one final ride to decide whether the silence was love or only habit.', cast: ['Juno Vale', 'Theo Marsh'] },
  { id: 'broken-meridian', title: 'Broken Meridian', year: 2020, genre: 'Thriller', durationMin: 116, maturity: '16+', hue: 142, synopsis: 'A border smuggler with a photographic memory is the only witness to a murder that erased itself from every record. Now both sides of the line want what is in her head, intact or otherwise.', cast: ['Esme Cruz', 'Hart Bellamy'] },
  { id: 'lantern-and-key', title: 'Lantern & Key', year: 2024, genre: 'Adventure', durationMin: 128, maturity: 'ALL', hue: 64, synopsis: 'A locksmith’s apprentice inherits a ring of keys that open doors no building has, leading into the hidden rooms of the world. Every door asks a price, and the last one asks for her.', cast: ['Wren Tully', 'Bastian Locke'] },
  { id: 'concrete-orchids', title: 'Concrete Orchids', year: 2023, genre: 'Drama', durationMin: 105, maturity: '16+', hue: 332, synopsis: 'A demolition foreman discovers a rooftop garden in a condemned tower and the elderly woman who refuses to leave it. Between the wrecking ball and the bloom, both find a reason to stall.', cast: ['Marisol Vega', 'Dennis Cray'] },
  { id: 'the-grey-tide', title: 'The Grey Tide', year: 2021, genre: 'War', durationMin: 138, maturity: '16+', hue: 212, synopsis: 'A field medic and an enemy radio operator wash up on the same fogbound island, the war forgotten by everyone but them. As the grey tide rises, so does the question of who they are without it.', cast: ['Anders Holt', 'Liu Wen'] },
  { id: 'sundial-children', title: 'Sundial Children', year: 2025, genre: 'Fantasy', durationMin: 133, maturity: '13+', hue: 78, tagline: 'Time only obeys the ones who learn to wait.', synopsis: 'In a valley where children age only in sunlight, a girl born under eclipse must steal back the hours stolen from her. The sundial keeps perfect time, and perfect time keeps grudges.', cast: ['Elara Sund', 'Pip Vane', 'Oren Tallow'] },
  { id: 'electric-sermons', title: 'Electric Sermons', year: 2022, genre: 'Documentary', durationMin: 83, maturity: '13+', hue: 256, synopsis: 'An intimate portrait of the engineers, dreamers, and grifters who electrified the rural night, and the preacher who swore the new light was the end of the soul. History told by lamplight.', cast: ['narrated by Cole Frey'] },
  { id: 'the-far-shallows', title: 'The Far Shallows', year: 2024, genre: 'Mystery', durationMin: 111, maturity: '16+', hue: 164, synopsis: 'When the tide goes out a mile and never returns, a marine biologist walks the exposed seabed toward an answer the town would rather drown. The shallows keep what the deep gave up.', cast: ['Nadia Cole', 'Finn Reyes'] },
  { id: 'marrow-and-moon', title: 'Marrow & Moon', year: 2023, genre: 'Horror', durationMin: 97, maturity: '18+', hue: 298, synopsis: 'A folklorist returns to her grandmother’s village to record its dying songs and finds the lullabies are summoning something the marrow remembers. By the full moon, the singing stops being hers.', cast: ['Branwen Ash', 'Tomos Vey'] },
  { id: 'last-cartographer', title: 'The Last Cartographer', year: 2020, genre: 'Adventure', durationMin: 142, maturity: '13+', hue: 40, synopsis: 'With the world finally fully mapped, the guild’s greatest surveyor sets out to prove one blank remains. The journey to the edge of the known is the last great story the maps cannot hold.', cast: ['Idris Vale', 'Marlow Quay'] },
]

const byId = (id: string): Title => {
  const t = TITLES.find((x) => x.id === id)
  if (!t) throw new Error(`unknown title id: ${id}`)
  return t
}

const withProgress = (id: string, progress: number): Title => ({ ...byId(id), progress })

// Look up a title by id for the detail modal; returns undefined for unknown ids
// (the modal handles the miss by rendering nothing rather than throwing).
export const findTitle = (id: string): Title | undefined => TITLES.find((t) => t.id === id)

// "More like this" / search both want same-genre suggestions. Excludes self so a
// title never recommends itself, and caps the strip so a carousel stays a rail.
export const relatedTitles = (title: Title, limit = 12): Title[] =>
  TITLES.filter((t) => t.genre === title.genre && t.id !== title.id).slice(0, limit)

// Case-insensitive substring match over title + genre. Drives the instant
// search overlay; kept here so search stays pure data, no component coupling.
export const searchTitles = (query: string): Title[] => {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return TITLES.filter(
    (t) => t.title.toLowerCase().includes(q) || t.genre.toLowerCase().includes(q),
  )
}

// Distinct genres in first-appearance order — the /series page groups by these.
export const GENRES: string[] = [...new Set(TITLES.map((t) => t.genre))]

// Titles grouped by genre for the /series page. Only genres with enough titles
// to fill a row are surfaced so no series row reads as thin.
export const titlesByGenre = (genre: string): Title[] => TITLES.filter((t) => t.genre === genre)

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
