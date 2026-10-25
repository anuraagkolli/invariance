'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { useVariant } from '@invariance/design'

import { buttonRecipe } from './recipes'
import type { ButtonLook } from './variants'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'secondary'
  /** Pin a look regardless of the theme (otherwise the `button` variant). */
  look?: ButtonLook
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'primary', look, className, type = 'button', ...rest },
  ref,
) {
  const themed = useVariant<ButtonLook>('button', 'solid')
  return (
    <button
      ref={ref}
      type={type}
      data-inv-variant={look ?? themed}
      className={buttonRecipe({ look: look ?? themed, tone, class: className })}
      {...rest}
    />
  )
})
