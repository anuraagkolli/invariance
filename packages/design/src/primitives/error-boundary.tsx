'use client'

import React from 'react'

interface ErrorBoundaryProps {
  slotName: string
  onReset: () => void
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error | undefined
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn(
      `[Invariance] Error in customized slot "${this.props.slotName}":`,
      error,
      errorInfo,
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#f3f4f6',
            padding: '16px',
            borderRadius: '8px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#374151' }}>
            This customization encountered an error.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: undefined })
              this.props.onReset()
            }}
            style={{
              background: '#6366f1',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reset this slot
          </button>
          {this.state.error && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#9ca3af' }}>
              {this.state.error.message}
            </p>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
