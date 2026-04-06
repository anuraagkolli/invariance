export const LEVELS = {
  LOCKED: 0,
  STYLE: 1,
  CONTENT: 2,
  LAYOUT: 3,
  COMPONENT: 4,
  PAGE: 5,
  BEHAVIOR: 6,
  DATA: 7,
} as const

export type Level = (typeof LEVELS)[keyof typeof LEVELS]
