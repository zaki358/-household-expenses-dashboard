import type { InputHTMLAttributes } from 'react'

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

/**
 * Dark-mode text input. 4px radius, `hairline-dark` border, 2px `primary`
 * border on focus. Always on a dark surface.
 */
export function TextInput({ label, className = '', id, ...rest }: TextInputProps) {
  const inputId = id ?? rest.name

  return (
    <div className="flex flex-col gap-xxs">
      {label && (
        <label htmlFor={inputId} className="font-body text-[13px] leading-[1.8] text-mute-dark">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`rounded-sm border border-hairline-dark bg-surface-dark-elevated text-on-dark font-body text-[15px] leading-[1.7] px-sm py-xs outline-none focus:border-2 focus:border-primary placeholder:text-mute-dark ${className}`}
        {...rest}
      />
    </div>
  )
}
