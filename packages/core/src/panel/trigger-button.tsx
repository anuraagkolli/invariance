'use client'

interface TriggerButtonProps {
  onClick: () => void
}

const SparkleIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z"
      fill="currentColor"
    />
    <path
      d="M19 2 L19.8 5.2 L23 6 L19.8 6.8 L19 10 L18.2 6.8 L15 6 L18.2 5.2 Z"
      fill="currentColor"
      opacity="0.6"
    />
    <path
      d="M5 16 L5.6 18.4 L8 19 L5.6 19.6 L5 22 L4.4 19.6 L2 19 L4.4 18.4 Z"
      fill="currentColor"
      opacity="0.5"
    />
  </svg>
)

export function TriggerButton({ onClick }: TriggerButtonProps) {
  return (
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
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: 'none',
        background: '#ffffff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6366f1',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        padding: 0,
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 4px 14px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1)'
      }}
      onFocus={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.outline = '2px solid #6366f1'
        ;(e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px'
      }}
      onBlur={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.outline = 'none'
      }}
    >
      <SparkleIcon />
    </button>
  )
}
