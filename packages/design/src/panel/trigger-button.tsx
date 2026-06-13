'use client'

interface TriggerButtonProps {
  onClick: () => void
}

const WandIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <line x1="3" y1="21" x2="13" y2="11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M14 3 L14.9 6.6 L18.5 7.5 L14.9 8.4 L14 12 L13.1 8.4 L9.5 7.5 L13.1 6.6 Z" fill="currentColor" />
    <path d="M20 3 L20.5 4.8 L22.3 5.3 L20.5 5.8 L20 7.6 L19.5 5.8 L17.7 5.3 L19.5 4.8 Z" fill="currentColor" opacity="0.75" />
    <path d="M19 14 L19.4 15.4 L20.8 15.8 L19.4 16.2 L19 17.6 L18.6 16.2 L17.2 15.8 L18.6 15.4 Z" fill="currentColor" opacity="0.5" />
  </svg>
)

export function TriggerButton({ onClick }: TriggerButtonProps) {
  return (
    <>
      <style>{`
        @keyframes inv-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.5), 0 8px 24px rgba(0,0,0,0.5); }
          50%       { box-shadow: 0 0 0 6px rgba(139,92,246,0),  0 8px 24px rgba(0,0,0,0.5); }
        }
        [data-inv-trigger]:hover {
          transform: scale(1.1) !important;
          box-shadow: 0 0 0 0 rgba(139,92,246,0), 0 12px 32px rgba(0,0,0,0.6) !important;
        }
      `}</style>
      <button
        type="button"
        onClick={onClick}
        aria-label="Open customization panel"
        data-inv-trigger="true"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: '1px solid rgba(139,92,246,0.4)',
          background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0f1a 100%)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a78bfa',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          padding: 0,
          outline: 'none',
          animation: 'inv-pulse 2.8s ease-in-out infinite',
        }}
        onFocus={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.outline = '2px solid #8b5cf6'
          ;(e.currentTarget as HTMLButtonElement).style.outlineOffset = '3px'
        }}
        onBlur={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.outline = 'none'
        }}
      >
        <WandIcon />
      </button>
    </>
  )
}
