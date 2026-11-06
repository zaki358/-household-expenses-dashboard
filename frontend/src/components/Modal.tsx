import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SectionTitle } from './SectionTitle'

export interface ModalProps {
  /** 見出し。aria-labelledby でダイアログに紐づける。 */
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * 最小のモーダル。DESIGN.md の dark card 語彙（surface-dark-card / 8px radius /
 * hairline-dark の枠）に従い、見出しは SectionTitle を再利用する。
 *
 * z-index が 60 なのは App.tsx のスマホ用下部タブバーが z-50 で固定されているため。
 * それより下だとタブバーがダイアログの上に重なる。
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId()

  // Escape で閉じる。開いている間は背面のスクロールを止める。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-md"
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 背景クリックで閉じるが、中身のクリックでは閉じない。
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-md border border-hairline-dark bg-surface-dark-card p-lg text-on-dark"
      >
        <div id={titleId}>
          <SectionTitle level="heading-lg" className="text-on-dark">
            {title}
          </SectionTitle>
        </div>
        <div className="mt-md">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
