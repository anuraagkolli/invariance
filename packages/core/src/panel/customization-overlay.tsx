'use client'

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type FormEvent,
} from 'react'

import { useInvariance } from '../context/provider'
import { runPipeline, type PipelineStage, type PipelineResult } from '../agent/pipeline'
import { applyPack, availablePacks } from '../agent/apply-pack'
import type { ConvTurn } from '../agent/gatekeeper'
import { applyAnyTheme } from '../runtime/apply'
import { beginSmoothThemeTransition } from '../runtime/smooth-transition'
import { upgradeThemeJson } from '../config/upgrade'
import { deriveConstraints } from '../config/derive-constraints'
import { invariantChips, type InvariantChip } from './invariant-chips'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryItem {
  id: string
  userMessage: string
  status: 'thinking' | 'success' | 'error' | 'clarification' | 'system'
  description?: string
  reason?: string
  clarification?: string
  progressText?: string
  warnings?: string[]
}

interface CustomizationOverlayProps {
  onClose: () => void
}

// Example vibe prompts shown as one-tap chips in the empty state. They guide a
// first-time viewer toward the live vibe->repaint and showcase the Designer's
// range. Unlike the pack chips (known-good StyleSpecs, keyless), these run the
// full Gatekeeper+Designer pipeline, so they are gated on having an apiKey.
const EXAMPLE_PROMPTS = [
  'make it retro',
  'cyberpunk terminal',
  'warm editorial magazine',
  'midnight ocean',
  'brutalist mono',
] as const

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Mirrors the host trigger button's wand so the panel reads as the same tool
// the user just clicked.
function WandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <line x1="3" y1="21" x2="13" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 3 L14.9 6.6 L18.5 7.5 L14.9 8.4 L14 12 L13.1 8.4 L9.5 7.5 L13.1 6.6 Z" fill="currentColor" />
    </svg>
  )
}

// Same 4-point spark as the empty-state glyph, sized for the loading veil.
function SparkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z"
        fill="#ffffff"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 L9 17 L4 12"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Leads the "protected by invariants" chip row. Sized and stroked to sit quiet
// beside the muted chip text — it is a reassurance glyph, not a focal point.
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// HistoryCard
// ---------------------------------------------------------------------------

function HistoryCard({ item }: { item: HistoryItem }) {
  // Assistant bubbles are flat tinted fills (no borders) — the glassy card
  // already supplies the depth, so borders would read as visual noise.
  function assistantBubble(
    bg: string,
    textColor: string,
    content: string,
    prefix?: string,
  ) {
    return (
      <div
        style={{
          background: bg,
          borderRadius: '14px 14px 14px 4px',
          padding: '7px 12px',
          fontSize: '13px',
          lineHeight: 1.45,
          color: textColor,
          maxWidth: '85%',
          wordBreak: 'break-word',
        }}
      >
        {prefix && <span>{prefix} </span>}
        {content}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      {item.status !== 'system' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
          <div
            style={{
              background: '#111827',
              color: '#ffffff',
              borderRadius: '14px 14px 4px 14px',
              padding: '7px 12px',
              fontSize: '13px',
              maxWidth: '85%',
              wordBreak: 'break-word',
            }}
          >
            {item.userMessage}
          </div>
        </div>
      )}

      {item.status === 'thinking' &&
        assistantBubble('#f4f5f7', '#5b6471', item.progressText ?? 'Thinking...')}

      {item.status === 'success' && (
        <>
          {assistantBubble('#f1f8f2', '#166534', item.description ?? '', '✓')}
          {item.warnings && item.warnings.length > 0 && (
            <div
              style={{
                marginTop: '4px',
                paddingLeft: '12px',
                fontSize: '11.5px',
                lineHeight: 1.4,
                color: '#6b7280',
                maxWidth: '85%',
                wordBreak: 'break-word',
              }}
            >
              Adjusted to respect your invariants: {item.warnings.join('; ')}
            </div>
          )}
        </>
      )}

      {item.status === 'error' &&
        assistantBubble('#fdf3f3', '#b3261e', item.reason ?? '', '✗')}

      {item.status === 'clarification' &&
        assistantBubble('#f3f6fd', '#1e40af', item.clarification ?? '')}

      {item.status === 'system' &&
        assistantBubble('#f4f5f7', '#5b6471', item.description ?? '')}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invariant chip
// ---------------------------------------------------------------------------

// One "protected by invariants" pill. A locked-accent chip leads with a tiny
// rounded swatch filled with the locked hex so the constraint reads at a glance.
function InvariantPill({ chip }: { chip: InvariantChip }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: '#f4f5f7',
        color: '#6b7280',
        fontSize: '11px',
        lineHeight: 1,
        padding: '4px 8px',
        borderRadius: '999px',
        whiteSpace: 'nowrap',
      }}
    >
      {chip.swatch && (
        <span
          aria-hidden="true"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '3px',
            background: chip.swatch,
            boxShadow: 'inset 0 0 0 1px rgba(17,24,39,0.12)',
            flexShrink: 0,
          }}
        />
      )}
      {chip.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Progress stage labels
// ---------------------------------------------------------------------------

const PROGRESS_LABELS: Record<PipelineStage, string> = {
  gatekeeper: 'Understanding your request...',
  designer: 'Designing the theme...',
  compiling: 'Compiling design tokens...',
  'slot-edit': 'Adjusting colors...',
  builder: 'Producing changes...',
  verifying: 'Verifying invariants...',
  retry: 'Retrying...',
  applying: 'Applying changes...',
}

// Veiled-run phase machine: 'chat' is the normal dialog; 'loading' minimizes
// the dialog under a full-screen progress veil while the pipeline runs;
// 'revealing' is the brief post-success beat before the veil fades and the
// panel closes. Errors/clarifications return to 'chat' so their bubbles are
// what the user sees — raw failure text never renders on the veil.
type PanelPhase = 'chat' | 'loading' | 'revealing'

// null = veil steady (or entering); 'fast' = quick exit back to chat on
// error/clarification; 'slow' = the lingering success fade-out.
type VeilExit = null | 'fast' | 'slow'

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chat history persistence helpers
// ---------------------------------------------------------------------------

function chatStorageKey(userId: string, appId: string): string {
  return `invariance:chat:${appId}:${userId}`
}

function loadChatHistory(userId: string, appId: string): { history: HistoryItem[]; convHistory: ConvTurn[] } {
  if (typeof window === 'undefined') return { history: [], convHistory: [] }
  try {
    const raw = localStorage.getItem(chatStorageKey(userId, appId))
    if (!raw) return { history: [], convHistory: [] }
    const parsed = JSON.parse(raw)
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      convHistory: Array.isArray(parsed.convHistory) ? parsed.convHistory : [],
    }
  } catch {
    return { history: [], convHistory: [] }
  }
}

function saveChatHistory(userId: string, appId: string, history: HistoryItem[], convHistory: ConvTurn[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(chatStorageKey(userId, appId), JSON.stringify({ history, convHistory }))
  } catch { /* quota exceeded — ignore */ }
}

export function CustomizationOverlay({ onClose }: CustomizationOverlayProps) {
  const {
    config,
    apiKey,
    userId,
    appId,
    registry,
    themeStore,
    storageBackend,
    componentLibrary,
    initialTheme,
    apiBaseUrl,
    onUsage,
    llmProvider,
    oaiStructuredMode,
    models,
    lastReconcile,
  } = useInvariance()

  const [input, setInput] = useState('')
  // Drives the pill container's focus ring — the ring lives on the wrapper,
  // not the input, so a style-mutating focus handler can't reach it directly.
  const [inputFocused, setInputFocused] = useState(false)
  const saved = loadChatHistory(userId, appId)
  const [history, setHistory] = useState<HistoryItem[]>(saved.history)
  const [convHistory, setConvHistory] = useState<ConvTurn[]>(saved.convHistory)
  const [isThinking, setIsThinking] = useState(false)
  const [phase, setPhase] = useState<PanelPhase>('chat')
  const [veilExit, setVeilExit] = useState<VeilExit>(null)
  const [veilStage, setVeilStage] = useState('Thinking...')
  const [revealText, setRevealText] = useState('')

  const historyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Phase-machine timers must die with the component: if the host unmounts the
  // overlay mid-run, a surviving timeout would setState (or onClose) on a dead
  // instance. The component stays MOUNTED while veiled precisely so the
  // in-flight pipeline keeps its state machine — this guard covers the case
  // where the parent itself goes away.
  const mountedRef = useRef(true)
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const t of phaseTimersRef.current) clearTimeout(t)
      phaseTimersRef.current = []
    }
  }, [])

  function schedulePhaseStep(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      if (mountedRef.current) fn()
    }, ms)
    phaseTimersRef.current.push(t)
  }

  // Persist chat history to localStorage whenever it changes
  useEffect(() => {
    saveChatHistory(userId, appId, history, convHistory)
  }, [userId, appId, history, convHistory])

  // Surface a recompile triggered by a new brand invariant as a neutral system
  // bubble. lastReconcile can stay set across panel remounts, so we dedupe on
  // the reason: appending only when no system item already carries it. (Errors
  // use status 'error', so this filter never collides with them.) Once the item
  // exists the .some() check holds, so the history-change re-run is a no-op.
  useEffect(() => {
    if (lastReconcile?.action !== 'recompiled') return
    const reason = lastReconcile.reason
    if (history.some((h) => h.status === 'system' && h.reason === reason)) return
    setHistory((h) => [
      ...h,
      {
        id: Math.random().toString(36).slice(2),
        userMessage: '',
        status: 'system' as const,
        description: 'Your theme was updated to respect a new brand invariant — the vibe was kept.',
        reason,
      },
    ])
  }, [lastReconcile, history])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Refocus once the dialog actually comes back from a veiled run — at the
  // moment the error/clarification lands the input is still visibility:hidden,
  // so focusing inside the result handler itself would be a no-op.
  const prevPhaseRef = useRef<PanelPhase>('chat')
  useEffect(() => {
    if (prevPhaseRef.current !== 'chat' && phase === 'chat') inputRef.current?.focus()
    prevPhaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history])

  // Errors and clarifications belong in the chat: drop the veil quickly and
  // bring the dialog back so the bubble handleSubmit already wrote into
  // history is what greets the user.
  function dismissVeilToChat() {
    setVeilExit('fast')
    schedulePhaseStep(() => {
      setPhase('chat')
      setVeilExit(null)
    }, 250)
  }

  // `override` lets a seeded-prompt chip submit its text directly without
  // round-tripping through the `input` state (a setState + immediate submit
  // would race the not-yet-flushed value). Falls back to the typed input.
  async function handleSubmit(e?: FormEvent, override?: string) {
    e?.preventDefault()
    const message = (override ?? input).trim()
    // phase !== 'chat' covers the 'revealing' window after isThinking has
    // already dropped: phase timers (including the scheduled onClose) are
    // still pending, and a run started under them would be torn down mid-
    // flight. CSS pointer-events alone must not be the only guard.
    if (!message || isThinking || phase !== 'chat') return
    setInput('')
    setIsThinking(true)

    const id = Math.random().toString(36).slice(2)
    setHistory((h) => [...h, { id, userMessage: message, status: 'thinking', progressText: 'Thinking...' }])

    if (!apiKey) {
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, status: 'error' as const, reason: 'Customization requires an API key. Contact the app developer to enable this feature.' }
            : item,
        ),
      )
      setIsThinking(false)
      return
    }

    // Veil the run: the dialog minimizes and pipeline progress plays out over
    // the live app. Entered only past the keyless guard above so the
    // missing-key error stays in the still-visible dialog.
    setVeilStage('Thinking...')
    setVeilExit(null)
    setPhase('loading')

    let result: PipelineResult
    try {
      result = await runPipeline(
        message,
        convHistory,
        {
          registry: registry.getAll(),
          config,
          themeStore,
          storageBackend,
          apiKey,
          userId,
          appId,
          componentLibrary: componentLibrary ? Object.keys(componentLibrary) : [],
          ...(apiBaseUrl ? { apiBaseUrl } : {}),
          ...(onUsage ? { onUsage } : {}),
          ...(llmProvider ? { llmProvider } : {}),
          ...(oaiStructuredMode ? { oaiStructuredMode } : {}),
          ...(models ? { models } : {}),
        },
        (stage) => {
          setHistory((h) =>
            h.map((item) =>
              item.id === id
                ? { ...item, progressText: PROGRESS_LABELS[stage] ?? 'Working...' }
                : item,
            ),
          )
          setVeilStage(PROGRESS_LABELS[stage] ?? 'Working...')
        },
      )
    } catch (err) {
      // runPipeline returns structured errors, but programmer-error paths and
      // developer-supplied storage backends can THROW — and an unhandled throw
      // here would strand the full-screen veil (Escape is gated, the backdrop
      // ignores pointer events), soft-locking the whole app.
      console.error('[invariance]', err)
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, status: 'error' as const, reason: 'Something went wrong applying this change. Please try again.' }
            : item,
        ),
      )
      dismissVeilToChat()
      setIsThinking(false)
      return
    }

    if (result.type === 'clarification') {
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, status: 'clarification' as const, clarification: result.message }
            : item,
        ),
      )
      setConvHistory((prev) => [
        ...prev,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: result.message },
      ])
      setIsThinking(false)
      dismissVeilToChat()
      return
    }

    if (result.type === 'error') {
      setHistory((h) =>
        h.map((item) =>
          item.id === id ? { ...item, status: 'error' as const, reason: result.message } : item,
        ),
      )
      setIsThinking(false)
      dismissVeilToChat()
      return
    }

    // success
    setHistory((h) =>
      h.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'success' as const,
              description: result.description,
              ...(result.warnings && result.warnings.length > 0 ? { warnings: result.warnings } : {}),
            }
          : item,
      ),
    )
    setConvHistory((prev) => [
      ...prev,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: JSON.stringify({ type: 'success', description: result.description }) },
    ])
    setIsThinking(false)

    // Hold the veil briefly with the result, then fade everything away and
    // close — the user lands directly on the freshly themed app.
    setRevealText(result.description)
    setPhase('revealing')
    schedulePhaseStep(() => {
      setVeilExit('slow')
      schedulePhaseStep(() => { onClose() }, 600)
    }, 900)
  }

  // One-tap theme packs: the keyless quality-preview path (DESIGN 1.6c). Packs
  // are known-good StyleSpecs, so applyPack skips the Gatekeeper+Designer and
  // needs NO apiKey — the chips stay clickable even when no key is configured.
  // availablePacks pre-filters to packs the app's constraints permit, so a
  // forbidden mode/font never renders a broken chip. Compute once (config is
  // stable for the panel's lifetime).
  const packs = useMemo(() => availablePacks(config), [config])

  // The "protected by invariants" chips — quiet always-on chrome derived from
  // the app's active constraints. Empty when the app declares no invariants, in
  // which case the row renders nothing at all.
  const chips = useMemo(() => invariantChips(deriveConstraints(config)), [config])

  async function handleApplyPack(packId: string, packName: string) {
    // phase !== 'chat': a pack tap during the post-success 'revealing' window
    // would race the scheduled onClose (see handleSubmit's guard).
    if (isThinking || phase !== 'chat') return
    setIsThinking(true)

    const id = Math.random().toString(36).slice(2)
    setHistory((h) => [
      ...h,
      { id, userMessage: packName, status: 'thinking', progressText: PROGRESS_LABELS.compiling },
    ])

    // The smooth token-swap morph is armed inside persistAndApply (the shared
    // apply path), so packs morph without the panel doing anything here.
    let result: PipelineResult
    try {
      result = await applyPack(packId, { config, themeStore, storageBackend, userId, appId })
    } catch (err) {
      // applyPack throws on programmer-error paths (invalid compiled doc) and
      // developer-supplied storage backends can reject — keep the failure in
      // the chat instead of leaving a stuck 'thinking' bubble.
      console.error('[invariance]', err)
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, status: 'error' as const, reason: 'Something went wrong applying this change. Please try again.' }
            : item,
        ),
      )
      setIsThinking(false)
      return
    }

    // applyPack only ever returns success | error (it skips the Gatekeeper, so
    // there is no clarification path), but PipelineResult is the shared union —
    // narrow on success so the description access type-checks.
    if (result.type === 'success') {
      setHistory((h) =>
        h.map((item) =>
          item.id === id
            ? { ...item, status: 'success' as const, description: result.description }
            : item,
        ),
      )
    } else {
      const reason = result.type === 'error' ? result.message : ''
      setHistory((h) =>
        h.map((item) =>
          item.id === id ? { ...item, status: 'error' as const, reason } : item,
        ),
      )
    }
    setIsThinking(false)
  }

  // Seeded prompt chip: submit through the SAME pipeline path as a typed prompt.
  // The prompt is passed as an override so the submit doesn't race the input's
  // setState; the chip text shows up as the history card's userMessage (the input
  // box itself stays empty — handleSubmit clears it).
  function handlePromptChip(prompt: string) {
    if (isThinking) return
    void handleSubmit(undefined, prompt)
  }

  function handleSurpriseMe() {
    if (isThinking) return
    const pick = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)]
    if (pick) handlePromptChip(pick)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
    // The veil is not dismissible: runs are short and closing mid-pipeline
    // would desync the in-flight state machine from what the user sees.
    if (e.key === 'Escape' && phase === 'chat') {
      onClose()
    }
  }

  async function handleReset() {
    if (initialTheme) {
      // Upgrade the raw initialTheme to v2 before setting/applying, matching the
      // provider's own load path so the in-memory invariant (store always holds v2)
      // is preserved after a reset.
      const { theme: upgradedTheme, warnings } = upgradeThemeJson(initialTheme)
      if (warnings.length > 0) console.warn('[invariance] reset upgrade warnings:', warnings)
      themeStore.setTheme(upgradedTheme)
      // Reset applies directly (not via persistAndApply), so arm the morph
      // here — snapping back to the initial theme reads as a glitch.
      beginSmoothThemeTransition()
      applyAnyTheme(upgradedTheme, config)
      await storageBackend.saveTheme(userId, appId, upgradedTheme)
    } else {
      themeStore.clear()
      if (typeof document !== 'undefined') {
        // Same morph as the themed-reset branch: clearing every --inv- token
        // is just as visually abrupt as a swap.
        beginSmoothThemeTransition()
        const root = document.documentElement
        const props = Array.from({ length: root.style.length }, (_, i) => root.style.item(i))
        for (const prop of props) {
          if (prop.startsWith('--inv-')) root.style.removeProperty(prop)
        }
      }
    }
    setHistory([
      {
        id: Math.random().toString(36).slice(2),
        userMessage: '',
        status: 'system',
        description: 'All customizations have been reset.',
      },
    ])
    setConvHistory([])
  }

  return (
    <>
      {/* Backdrop. While veiled it animates out with a forwards fill (held at
          opacity 0 / visibility hidden) but stays MOUNTED — unmounting would
          tear down the component (and the in-flight pipeline) with it. The
          inv-panel-exit class only exists for the reduced-motion fallback. */}
      <div
        onClick={onClose}
        data-inv-backdrop="true"
        className={phase === 'chat' ? undefined : 'inv-panel-exit'}
        style={{
          position: 'fixed',
          inset: 0,
          // Light scrim: the glassy card lets the app glow through, so the
          // backdrop only needs to hint at modality, not dim the page.
          background: 'rgba(0,0,0,0.22)',
          zIndex: 9998,
          // Swapping animation-name restarts the animation, so returning to
          // 'chat' after an error replays the entrance without a re-mount.
          animation:
            phase === 'chat'
              ? 'invariance-fade-in 0.15s ease'
              : 'invariance-fade-out 0.25s ease forwards',
          pointerEvents: phase === 'chat' ? 'auto' : 'none',
        }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customization panel"
        data-inv-overlay="true"
        className={phase === 'chat' ? undefined : 'inv-panel-exit'}
        style={{
          position: 'fixed',
          bottom: '88px',
          right: '24px',
          zIndex: 9999,
          width: '480px',
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '70vh',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          border: '1px solid rgba(17,24,39,0.06)',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation:
            phase === 'chat'
              ? 'invariance-slide-up 0.2s ease'
              : 'invariance-card-out 0.25s ease forwards',
          pointerEvents: phase === 'chat' ? 'auto' : 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Header: single compact row — wand glyph, title, spacer, close.
            The old subtitle's guidance now lives in the input placeholder. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '14px 18px 12px',
            borderBottom: '1px solid rgba(17,24,39,0.05)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#6366f1', display: 'flex' }}>
            <WandIcon />
          </span>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>
            Customize
          </h2>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Protected-by-invariants chips: quiet reassurance chrome. Renders only
            when the app declares at least one constraint. */}
        {chips.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '8px 18px',
              borderBottom: '1px solid rgba(17,24,39,0.05)',
              flexShrink: 0,
            }}
          >
            <span
              style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', marginRight: '1px' }}
              title="Protected by invariants"
            >
              <LockIcon />
            </span>
            {chips.map((chip) => (
              <InvariantPill key={chip.kind} chip={chip} />
            ))}
          </div>
        )}

        {/* History */}
        <div
          ref={historyRef}
          style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}
        >
          {history.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px 8px',
                color: '#6b7280',
                fontSize: '12.5px',
                textAlign: 'center',
                gap: '8px',
              }}
            >
              {/* Decorative glyph stays lighter than the hint text — only the
                  readable text needs the AA-darkened tone. */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#b6bcc6' }}>
                <path
                  d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z"
                  fill="currentColor"
                />
              </svg>
              <span>No changes yet. Describe what you want to change.</span>
            </div>
          )}
          {history.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>

        {/* Input area */}
        <div
          style={{ padding: '12px 18px 14px', borderTop: '1px solid rgba(17,24,39,0.05)', flexShrink: 0 }}
        >
          {/* Seeded example prompts. PERSISTENT (not just the empty state): a
              user who applied a theme can always change their mind from here.
              They run the full LLM pipeline, so they are shown only when an
              apiKey is configured — without one they would always error (the
              pack chips below remain the keyless path). */}
          {apiKey && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}
              >
                Try a vibe
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handlePromptChip(prompt)}
                    disabled={isThinking}
                    data-inv-prompt={prompt}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e8eaee',
                      borderRadius: '999px',
                      padding: '5px 12px',
                      fontSize: '12px',
                      color: '#4b5563',
                      cursor: isThinking ? 'default' : 'pointer',
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isThinking) {
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#f5f7ff'
                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#c7d2fe'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#4338ca'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#ffffff'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e8eaee'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#4b5563'
                    }}
                  >
                    {prompt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  disabled={isThinking}
                  data-inv-surprise="true"
                  style={{
                    background: '#6366f1',
                    border: '1px solid #6366f1',
                    borderRadius: '999px',
                    padding: '5px 13px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#ffffff',
                    cursor: isThinking ? 'default' : 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (!isThinking) {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#4f46e5'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#4f46e5'
                    }
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#6366f1'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'
                  }}
                >
                  ✨ Surprise me
                </button>
              </div>
            </div>
          )}

          {/* Starting points: one-tap packs. Keyless quality preview (DESIGN 1.6c) —
              NOT disabled when apiKey is absent (only the prompt input needs a key).
              Hidden entirely if the app's constraints forbid every pack. The panel
              UI is fixed-light (NOT themed by --inv vars), so the chips use the
              same inline palette as the rest of the panel (white pill / #4b5563). */}
          {packs.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}
              >
                Starting points
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => { void handleApplyPack(pack.id, pack.name) }}
                    disabled={isThinking}
                    data-inv-pack={pack.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e8eaee',
                      borderRadius: '999px',
                      padding: '5px 12px',
                      fontSize: '12px',
                      color: '#4b5563',
                      cursor: isThinking ? 'default' : 'pointer',
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isThinking) {
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#f5f7ff'
                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#c7d2fe'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#4338ca'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#ffffff'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e8eaee'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#4b5563'
                    }}
                  >
                    {pack.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The form doubles as the pill container around input + send. The
              focus ring lives HERE (driven by inputFocused state) so the whole
              pill lights up, not just the borderless input inside it. */}
          <form
            onSubmit={(e) => { void handleSubmit(e) }}
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              margin: 0,
              background: inputFocused ? '#ffffff' : '#f3f4f6',
              border: inputFocused ? '1px solid rgba(99,102,241,0.45)' : '1px solid transparent',
              boxShadow: inputFocused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
              borderRadius: '999px',
              padding: '4px 4px 4px 16px',
              transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              placeholder={isThinking ? 'Thinking...' : 'Describe a change…'}
              data-inv-input="true"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: '8px 0',
                fontSize: '13.5px',
                color: '#111827',
                cursor: isThinking ? 'default' : 'text',
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={isThinking}
              style={{
                background: isThinking ? '#c7cbe8' : '#6366f1',
                border: 'none',
                borderRadius: '999px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isThinking ? 'default' : 'pointer',
                color: '#ffffff',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isThinking) (e.currentTarget as HTMLButtonElement).style.background = '#4f46e5'
              }}
              onMouseLeave={(e) => {
                if (!isThinking) (e.currentTarget as HTMLButtonElement).style.background = '#6366f1'
              }}
            >
              <SendIcon />
            </button>
          </form>

          {/* Footer: quiet by default, turns destructive-red on hover so the
              reset reads as deliberate, not decorative. */}
          <div style={{ padding: '6px 0 0', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => { void handleReset() }}
              data-inv-reset="true"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#6b7280',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                padding: '2px 4px',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = '#b3261e'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = '#6b7280'
              }}
            >
              Reset all
            </button>
          </div>
        </div>
      </div>

      {/* Loading veil: a frosted scrim over the live app while the pipeline
          runs ('loading'), then a brief success beat ('revealing') before the
          whole thing fades and the panel closes. z-index sits ABOVE the
          trigger FAB (9999) — anything below the veil but above the scrim
          would float clickable-but-inert; the card is held invisible by its
          exit animation. */}
      {phase !== 'chat' && (
        <div
          data-inv-veil="true"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(10, 11, 13, 0.45)',
            backdropFilter: 'blur(7px) saturate(1.15)',
            WebkitBackdropFilter: 'blur(7px) saturate(1.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            animation:
              veilExit === null
                ? 'invariance-fade-in 0.3s ease'
                : veilExit === 'slow'
                  ? 'invariance-fade-out 0.6s ease forwards'
                  : 'invariance-fade-out 0.25s ease forwards',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {phase === 'loading' ? (
            <>
              <div
                style={{
                  display: 'flex',
                  animation: 'invariance-veil-pulse 1.6s ease-in-out infinite alternate',
                }}
              >
                <SparkIcon />
              </div>
              {/* Keyed by the label so each stage change re-mounts the node
                  and replays the fade-in — a cheap crossfade. */}
              <div
                key={veilStage}
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '0.02em',
                  animation: 'invariance-fade-in 0.3s ease',
                }}
              >
                {veilStage}
              </div>
              <div
                data-inv-shimmer="true"
                style={{
                  position: 'relative',
                  width: '160px',
                  height: '2px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.18)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '56px',
                    height: '100%',
                    borderRadius: '999px',
                    background:
                      'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)',
                    animation: 'invariance-veil-shimmer 1.4s linear infinite',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <CheckIcon />
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '0.02em',
                  maxWidth: 'min(420px, 80vw)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  animation: 'invariance-fade-in 0.3s ease',
                }}
              >
                {revealText}
              </div>
            </>
          )}
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        [data-inv-input]::placeholder { color: #6b7280; opacity: 1 }
        @keyframes invariance-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes invariance-slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes invariance-fade-out {
          from { opacity: 1; visibility: visible; }
          to   { opacity: 0; visibility: hidden; }
        }
        @keyframes invariance-card-out {
          from { opacity: 1; transform: translateY(0) scale(1); visibility: visible; }
          to   { opacity: 0; transform: translateY(12px) scale(0.98); visibility: hidden; }
        }
        @keyframes invariance-veil-pulse {
          from { transform: scale(0.9); opacity: 0.7; }
          to   { transform: scale(1.08); opacity: 1; }
        }
        @keyframes invariance-veil-shimmer {
          from { transform: translateX(-56px); }
          to   { transform: translateX(160px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-inv-veil],
          [data-inv-veil] *,
          [data-inv-overlay],
          [data-inv-backdrop] {
            animation: none !important;
          }
          .inv-panel-exit {
            opacity: 0 !important;
            visibility: hidden !important;
          }
          /* With its animation off the shimmer is a frozen gradient blob that
             reads as a rendering glitch — hide the whole bar instead. */
          [data-inv-shimmer] {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}
