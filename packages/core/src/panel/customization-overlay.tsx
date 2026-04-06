'use client'

import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from 'react'

import { useInvariance } from '../context/provider'
import { runPipeline, type PipelineStage } from '../agent/pipeline'
import type { ConvTurn } from '../agent/gatekeeper'

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
  builder: 'Producing changes...',
  verifying: 'Verifying invariants...',
  retry: 'Retrying...',
  applying: 'Applying changes...',
}

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
  } = useInvariance()

  const [input, setInput] = useState('')
  const saved = loadChatHistory(userId, appId)
  const [history, setHistory] = useState<HistoryItem[]>(saved.history)
  const [convHistory, setConvHistory] = useState<ConvTurn[]>(saved.convHistory)
  const [isThinking, setIsThinking] = useState(false)

  const historyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Persist chat history to localStorage whenever it changes
  useEffect(() => {
    saveChatHistory(userId, appId, history, convHistory)
  }, [userId, appId, history, convHistory])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history])

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const message = input.trim()
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
      },
      (stage) => {
        setHistory((h) =>
          h.map((item) =>
            item.id === id
              ? { ...item, progressText: PROGRESS_LABELS[stage] ?? 'Working...' }
              : item,
          ),
        )
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
      return
    }

    if (result.type === 'error') {
      setHistory((h) =>
        h.map((item) =>
          item.id === id ? { ...item, status: 'error' as const, reason: result.message } : item,
        ),
      )
      setIsThinking(false)
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
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  async function handleReset() {
    themeStore.clear()
    // Reset CSS variables
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      const props = Array.from({ length: root.style.length }, (_, i) => root.style.item(i))
      for (const prop of props) {
        if (prop.startsWith('--inv-')) {
          root.style.removeProperty(prop)
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 9998,
          animation: 'invariance-fade-in 0.15s ease',
        }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customization panel"
        data-inv-overlay="true"
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
          animation: 'invariance-slide-up 0.2s ease',
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
                height: '120px',
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
      `}</style>
    </>
  )
}
