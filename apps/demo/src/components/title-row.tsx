import type { Title } from '../lib/titles'
import { TitleCard } from './title-card'

export interface RowComponentProps {
  // The titles this row renders. Passed both directly (default render) and via
  // the F4 component-swap path (Slot forwards slotProps to the swapped library
  // component), so CarouselRow and GridRow must accept the same shape.
  titles?: Title[]
  shape?: 'standard' | 'wide'
}

// Card sizing per shape. Carousel widths are fixed so the scroll-snap strip
// reads as a true horizontal rail; grid uses responsive column counts.
const CARD_WIDTH: Record<'standard' | 'wide', string> = {
  standard: 'w-[150px] sm:w-[168px]',
  wide: 'w-[280px] sm:w-[320px]',
}

// Horizontal scroll-snap strip — the default row treatment.
export function CarouselRow({ titles = [], shape = 'standard' }: RowComponentProps) {
  return (
    <div
      className="inv-carousel flex snap-x snap-mandatory overflow-x-auto pb-2"
      style={{ gap: 'calc(var(--inv-density-unit) * 3)' }}
    >
      {titles.map((title) => (
        <div key={title.id} className={`${CARD_WIDTH[shape]} shrink-0 snap-start`}>
          <TitleCard title={title} shape={shape} />
        </div>
      ))}
    </div>
  )
}

// Wrapped grid — the F4 swap alternative for the same slot.
export function GridRow({ titles = [], shape = 'standard' }: RowComponentProps) {
  const cols =
    shape === 'wide'
      ? 'grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'
  return (
    <div
      className={`grid ${cols}`}
      style={{ gap: 'calc(var(--inv-density-unit) * 3)' }}
    >
      {titles.map((title) => (
        <TitleCard key={title.id} title={title} shape={shape} />
      ))}
    </div>
  )
}
