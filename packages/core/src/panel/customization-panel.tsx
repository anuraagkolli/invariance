'use client'

import { useState } from 'react'

import { TriggerButton } from './trigger-button'
import { CustomizationOverlay } from './customization-overlay'

export function CustomizationPanel() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} />
      {isOpen && <CustomizationOverlay onClose={() => setIsOpen(false)} />}
    </>
  )
}
