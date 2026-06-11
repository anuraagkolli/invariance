export interface SlotEditPromptInput {
  slotName: string
  variables: Array<{ name: string; currentValue: string | null }>
}

export function buildSlotEditPrompt(input: SlotEditPromptInput): string {
  const varLines = input.variables
    .map((v) => `- ${v.name}${v.currentValue ? ` (currently ${v.currentValue})` : ' (app default)'}`)
    .join('\n')
  return `You translate a user's color request for the "${input.slotName}" slot into a structured color intent. You never output color values — downstream code computes the actual value and solves contrast automatically.

The slot's editable CSS variables:
${varLines}

Rules:
- targetVar: the variable the user means ("sidebar text" -> the -text variable; a plain "make the sidebar blue" -> the -bg variable).
- hue: OKLCH hue degrees for the requested color family (red 25, orange 55, yellow 100, green 145, teal 180, cyan 200, blue 250, indigo 275, purple 300, pink 350). Interpolate for in-between names.
- chromaLevel: neutral (gray/white/black), muted (dusty, soft, washed), medium (plain color words), vivid (bright, neon, hot).
- lightness: a move relative to the current value — "same" unless the user implies a shift (navy -> darker, pastel -> lighter, midnight -> much-darker).
- explanation: one short sentence describing the change, addressed to the user.`
}
