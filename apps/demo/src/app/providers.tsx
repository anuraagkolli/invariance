'use client'

import type { ReactNode } from 'react'
import { InvarianceProvider, CustomizationPanel } from 'invariance'
import type { InvarianceConfig, ThemeJson } from 'invariance'

import initialThemeJson from '../../invariance.theme.initial.json'

const config: InvarianceConfig = {
    "app": "@invariance/demo",
    "frontend": {
      "design": {
        "colors": {
          "mode": "palette",
          "palette": [
            "#111827",
            "#1F2937",
            "#4B5563",
            "#4F46E5",
            "#6366F1",
            "#6B7280",
            "#9CA3AF",
            "#D1D5DB",
            "#E5E7EB",
            "#EF4444",
            "#F3F4F6",
            "#F9FAFB",
            "#FFFFFF"
          ]
        },
        "fonts": {
          "allowed": [
            "ui-sans-serif, system-ui, sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\""
          ]
        },
        "spacing": {
          "scale": [
            6,
            8,
            12,
            16,
            20,
            24,
            36
          ]
        }
      },
      "structure": {
        "required_sections": [
          "section-1",
          "section-2",
          "section-3",
          "section-4",
          "section-5",
          "section-6"
        ],
        "locked_sections": [
          "section-1",
          "section-2",
          "section-3",
          "section-4",
          "section-5",
          "section-6"
        ],
        "section_order": {
          "first": "section-1",
          "last": "section-6"
        }
      },
      "accessibility": {
        "wcag_level": "AA",
        "color_contrast": ">= 4.5",
        "all_images": "must have alt text"
      },
      "pages": {
        "/": {
          "level": 0,
          "required": [
            "section-1",
            "section-2",
            "section-3",
            "section-4",
            "section-5",
            "section-6"
          ]
        }
      }
    }
  }

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <InvarianceProvider
      config={config}
      apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''}
      initialTheme={initialThemeJson as ThemeJson}
      storage="localStorage"
    >
      {children}
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
