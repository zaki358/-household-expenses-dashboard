import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'disabled'
export type ButtonSize = 'md' | 'sm'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-dark hover:bg-primary-pressed active:bg-primary-active',
  secondary: 'bg-transparent text-on-dark border border-hairline-dark hover:border-mute-dark',
  danger: 'bg-transparent text-warning border border-warning hover:opacity-80',
  disabled: 'bg-surface-dark-elevated text-mute-dark cursor-not-allowed',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'rounded-full px-[28px] py-sm font-bold text-[18px] leading-[1.25] tracking-[0.45px]',
  sm: 'rounded-full px-lg py-sm font-bold text-[15px] leading-[1.25] tracking-[0.3px]',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonProps) {
  const isDisabled = variant === 'disabled'

  return (
    <button
      type="button"
      data-variant={variant}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-body transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
