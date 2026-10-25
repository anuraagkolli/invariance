import { createTV } from 'tailwind-variants'

import type { ButtonLook, CardLook, SectionHeaderLook } from './variants'

// No tailwind-merge: recipes never emit two utilities for the same property,
// so color lives only in the (look, tone) compounds, never in a look itself.
const tv = createTV({ twMerge: false })

const BUTTON_COLORS: Record<ButtonLook, { primary: string; secondary: string }> = {
  solid: {
    primary: 'bg-accent text-accentContrast hover:bg-accentHover',
    secondary: 'bg-surface2 text-textPrimary hover:bg-surface1 border-border',
  },
  outline: {
    primary: 'bg-transparent text-accent border-accent hover:bg-accentSubtle',
    secondary: 'bg-transparent text-textPrimary border-border hover:bg-surface2',
  },
  ghost: {
    primary: 'bg-transparent text-accent hover:underline',
    secondary: 'bg-transparent text-textSecondary hover:text-textPrimary hover:underline',
  },
  brutal: {
    primary: 'bg-accent text-accentContrast',
    secondary: 'bg-surface0 text-textPrimary',
  },
  pill: {
    primary: 'bg-accent text-accentContrast hover:bg-accentHover',
    secondary: 'bg-surface2 text-textPrimary hover:bg-surface1',
  },
  glow: {
    primary:
      'bg-accent text-accentContrast shadow-[0_0_28px_-6px_var(--inv-accent)] hover:shadow-[0_0_40px_-2px_var(--inv-accent)]',
    secondary: 'bg-surface2/60 text-textPrimary backdrop-blur-md hover:bg-surface2',
  },
}

export const buttonRecipe = tv({
  base: 'inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface0 disabled:opacity-50',
  variants: {
    look: {
      solid: 'rounded-base border-themed px-6 py-2.5',
      outline: 'rounded-base border-2 px-6 py-2.5',
      ghost: 'rounded-base px-3 py-2.5 underline-offset-4',
      brutal:
        'rounded-none border-2 border-textPrimary px-6 py-2.5 uppercase tracking-wider shadow-[4px_4px_0_0_var(--inv-text-primary)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--inv-text-primary)] active:translate-x-1 active:translate-y-1 active:shadow-none',
      pill: 'rounded-full px-7 py-2.5 hover:scale-[1.03] active:scale-[0.98]',
      glow: 'rounded-lg2 px-6 py-2.5 ring-1 ring-inset ring-white/20',
    },
    tone: { primary: '', secondary: '' },
  },
  compoundVariants: (Object.keys(BUTTON_COLORS) as ButtonLook[]).flatMap((look) => [
    { look, tone: 'primary' as const, class: BUTTON_COLORS[look].primary },
    { look, tone: 'secondary' as const, class: BUTTON_COLORS[look].secondary },
  ]),
  defaultVariants: { look: 'solid', tone: 'primary' },
})

// Card captions sit ON the art (overlay) or BELOW it; the component reads this
// to decide where the caption block renders.
export const CARD_CAPTION_PLACEMENT: Record<CardLook, 'overlay' | 'below'> = {
  poster: 'overlay',
  tilt: 'overlay',
  glass: 'overlay',
  caption: 'below',
  polaroid: 'below',
  framed: 'below',
}

export const cardRecipe = tv({
  slots: {
    root: 'group/card relative flex w-full flex-col text-left transition-all duration-200 ease-out',
    frame: 'relative w-full overflow-hidden transition-all duration-200 ease-out',
    caption: '',
    title: 'font-display text-sm font-semibold leading-tight',
    meta: 'mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em]',
  },
  variants: {
    look: {
      poster: {
        frame:
          'rounded-lg2 shadow-inv1 ring-1 ring-inset ring-border/40 group-hover/card:-translate-y-1 group-hover/card:shadow-inv2 group-hover/card:ring-2 group-hover/card:ring-ring',
        caption: 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3',
        title: 'uppercase tracking-[0.14em] text-white drop-shadow-sm',
        meta: 'text-white/70',
      },
      caption: {
        root: 'gap-2',
        frame: 'rounded-base group-hover/card:brightness-110',
        caption: 'px-0.5',
        title: 'text-textPrimary group-hover/card:text-accent',
        meta: 'text-textSecondary',
      },
      polaroid: {
        root: 'gap-2 bg-[#fbfaf6] p-2 pb-3 shadow-inv2 -rotate-1 group-hover/card:rotate-0 group-hover/card:scale-[1.03] [&:nth-child(even)]:rotate-1',
        frame: 'rounded-none',
        caption: 'text-center',
        title: 'normal-case text-neutral-800',
        meta: 'text-neutral-500',
      },
      framed: {
        root: 'border-2 border-textPrimary bg-surface1 shadow-[5px_5px_0_0_var(--inv-text-primary)] group-hover/card:-translate-x-0.5 group-hover/card:-translate-y-0.5 group-hover/card:shadow-[7px_7px_0_0_var(--inv-text-primary)]',
        frame: 'rounded-none border-b-2 border-textPrimary',
        caption: 'p-2',
        title: 'uppercase tracking-wide text-textPrimary',
        meta: 'text-textSecondary',
      },
      tilt: {
        root: '[perspective:900px]',
        frame: 'rounded-lg2 shadow-inv2 group-hover/card:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55)]',
        caption: 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-3 [transform:translateZ(40px)]',
        title: 'text-base text-white',
        meta: 'text-white/75',
      },
      glass: {
        frame:
          'rounded-lg2 ring-1 ring-inset ring-white/10 group-hover/card:ring-accent group-hover/card:shadow-[0_0_32px_-8px_var(--inv-accent)]',
        caption: 'absolute inset-x-2 bottom-2 rounded-base bg-black/30 p-2 ring-1 ring-white/20 backdrop-blur-md',
        title: 'text-white',
        meta: 'text-white/70',
      },
    },
  },
  defaultVariants: { look: 'poster' },
})

export const sectionHeaderRecipe = tv({
  slots: {
    root: 'flex',
    title: 'font-display text-lg text-textPrimary sm:text-xl',
    adornment: '',
  },
  variants: {
    look: {
      plain: { root: 'items-baseline' },
      rule: { root: 'items-center gap-md', adornment: 'h-px flex-1 bg-border' },
      numbered: {
        root: 'items-baseline gap-sm',
        adornment: 'font-mono text-sm font-bold tabular-nums text-accent',
        title: 'uppercase tracking-wide',
      },
      label: {
        root: 'flex-col gap-1',
        adornment:
          "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-accent before:block before:h-px before:w-6 before:bg-accent before:content-['']",
      },
      outline: {
        root: 'items-baseline',
        title:
          'text-3xl uppercase tracking-tight text-transparent sm:text-4xl [-webkit-text-stroke:1px_var(--inv-text-primary)]',
      },
    },
  },
  defaultVariants: { look: 'plain' },
})

export type { SectionHeaderLook }
