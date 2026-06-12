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
import { runPipeline, type PipelineStage } from '../agent/pipeline'
import { applyPack, availablePacks } from '../agent/apply-pack'
import type { ConvTurn } from '../agent/gatekeeper'
import { applyAnyTheme } from '../runtime/apply'
import { upgradeThemeJson } from '../config/upgrade'

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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

// ---------------------------------------------------------------------------
// HistoryCard
// ---------------------------------------------------------------------------

function HistoryCard({ item }: { item: HistoryItem }) {
  function assistantBubble(
    bg: string,
    border: string,
    textColor: string,
    content: string,
    prefix?: string,
  ) {
    return (
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '12px 12px 12px 2px',
          padding: '8px 12px',
          fontSize: '13px',
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
              background: '#6366f1',
              color: '#ffffff',
              borderRadius: '12px 12px 2px 12px',
              padding: '8px 12px',
              fontSize: '14px',
              maxWidth: '85%',
              wordBreak: 'break-word',
            }}
          >
            {item.userMessage}
          </div>
        </div>
      )}

      {item.status === 'thinking' &&
        assistantBubble('#f3f4f6', '#e5e7eb', '#6b7280', item.progressText ?? 'Thinking...')}

      {item.status === 'success' &&
        assistantBubble('#f0fdf4', '#bbf7d0', '#166534', item.description ?? '', '✓')}

      {item.status === 'error' &&
        assistantBubble('#fef2f2', '#fecaca', '#991b1b', item.reason ?? '', '✗')}

      {item.status === 'clarification' &&
        assistantBubble('#eff6ff', '#bfdbfe', '#1e40af', item.clarification ?? '')}

      {item.status === 'system' &&
        assistantBubble('#f3f4f6', '#e5e7eb', '#6b7280', item.description ?? '')}
    </div>
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

// ---------------------------------------------------------------------------
// Smooth theme reveal
// ---------------------------------------------------------------------------

// Module-level (not per-instance) because the class lives on <html>, outside
// any one overlay's lifecycle: an unmount must not strand it, and rapid calls
// (pack-chip mashing) should extend the window rather than stack removals.
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined

// Briefly arms a global transition class so the token swap — a synchronous
// batch of :root style writes — morphs colors instead of snapping. Call this
// immediately BEFORE the write; the class self-clears once the .55s
// transitions have finished.
export function beginSmoothThemeTransition(): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.add('inv-theme-transition')
  if (themeTransitionTimer !== undefined) clearTimeout(themeTransitionTimer)
  themeTransitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('inv-theme-transition')
    themeTransitionTimer = undefined
  }, 700)
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
  } = useInvariance()

  const [input, setInput] = useState('')
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
    if (!message || isThinking) return
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

    const result = await runPipeline(
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
        // 'applying' fires immediately before the pipeline writes the new
        // tokens to :root — arm the transition now so the swap morphs.
        if (stage === 'applying') beginSmoothThemeTransition()
      },
    )

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
          ? { ...item, status: 'success' as const, description: result.description }
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

  async function handleApplyPack(packId: string, packName: string) {
    if (isThinking) return
    setIsThinking(true)

    const id = Math.random().toString(36).slice(2)
    setHistory((h) => [
      ...h,
      { id, userMessage: packName, status: 'thinking', progressText: PROGRESS_LABELS.compiling },
    ])

    // Packs land in <100ms — no veil, but the token swap should still morph
    // instead of snapping.
    beginSmoothThemeTransition()
    const result = await applyPack(packId, { config, themeStore, storageBackend, userId, appId })

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
      applyAnyTheme(upgradedTheme, config)
      await storageBackend.saveTheme(userId, appId, upgradedTheme)
    } else {
      themeStore.clear()
      if (typeof document !== 'undefined') {
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
          background: 'rgba(0,0,0,0.35)',
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
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #f3f4f6',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
              Customize this page
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              Describe what you&apos;d like to change
            </p>
          </div>
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

        {/* History */}
        <div
          ref={historyRef}
          style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}
        >
          {history.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 8px',
                color: '#d1d5db',
                fontSize: '13px',
                textAlign: 'center',
                gap: '8px',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          style={{ padding: '12px 16px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}
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
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
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
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '999px',
                      padding: '5px 11px',
                      fontSize: '12px',
                      color: '#374151',
                      cursor: isThinking ? 'default' : 'pointer',
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isThinking) {
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#eef2ff'
                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#c7d2fe'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#4338ca'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#374151'
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
                    padding: '5px 12px',
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
              same inline palette as the rest of the panel (#f3f4f6 / #111827). */}
          {packs.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
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
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '999px',
                      padding: '5px 11px',
                      fontSize: '12px',
                      color: '#374151',
                      cursor: isThinking ? 'default' : 'pointer',
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isThinking) {
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#eef2ff'
                        ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#c7d2fe'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#4338ca'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#374151'
                    }}
                  >
                    {pack.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => { void handleSubmit(e) }}
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              placeholder={
                isThinking
                  ? 'Thinking...'
                  : 'Describe a change... (e.g. "make the sidebar dark blue")'
              }
              data-inv-input="true"
              style={{
                flex: 1,
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '13px',
                color: '#111827',
                background: isThinking ? '#f3f4f6' : '#f9fafb',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                cursor: isThinking ? 'default' : 'text',
              }}
              onFocus={(e) => {
                if (!isThinking) {
                  ;(e.currentTarget as HTMLInputElement).style.borderColor = '#6366f1'
                  ;(e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
                  ;(e.currentTarget as HTMLInputElement).style.background = '#ffffff'
                }
              }}
              onBlur={(e) => {
                ;(e.currentTarget as HTMLInputElement).style.borderColor = '#e5e7eb'
                ;(e.currentTarget as HTMLInputElement).style.boxShadow = 'none'
                ;(e.currentTarget as HTMLInputElement).style.background = isThinking ? '#f3f4f6' : '#f9fafb'
              }}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={isThinking}
              style={{
                background: isThinking ? '#a5b4fc' : '#6366f1',
                border: 'none',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
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

          {/* Footer */}
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => { void handleReset() }}
              data-inv-reset="true"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#9ca3af',
                textDecoration: 'underline',
                padding: '2px 4px',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
            >
              Reset all
            </button>
          </div>
        </div>
      </div>

      {/* Loading veil: a frosted scrim over the live app while the pipeline
          runs ('loading'), then a brief success beat ('revealing') before the
          whole thing fades and the panel closes. Rendered AFTER the backdrop
          (same z-index) so it paints on top; the card above it is held
          invisible by its exit animation. */}
      {phase !== 'chat' && (
        <div
          data-inv-veil="true"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
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
        html.inv-theme-transition,
        html.inv-theme-transition *,
        html.inv-theme-transition *::before,
        html.inv-theme-transition *::after {
          transition: background-color .55s ease, color .55s ease, border-color .55s ease, fill .55s ease, stroke .55s ease, box-shadow .55s ease !important;
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
          html.inv-theme-transition,
          html.inv-theme-transition *,
          html.inv-theme-transition *::before,
          html.inv-theme-transition *::after {
            transition: none !important;
          }
        }
      `}</style>
    </>
  )
}
