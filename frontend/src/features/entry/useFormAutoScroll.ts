import { useLayoutEffect, useRef, type RefObject } from 'react'

// Tailwind の md（768px）未満＝スマホ幅。下部タブバー（md:hidden）と同じ境界。
const MOBILE_QUERY = '(max-width: 767px)'

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_QUERY).matches
}

/** スマホ幅のときだけ、要素を画面中央へ一瞬で移す（スムーズスクロールの動きは出さない）。 */
export function scrollFormIntoView(el: HTMLElement | null): void {
  if (!el || typeof el.scrollIntoView !== 'function' || !isMobileViewport()) return
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
}

/**
 * scrollRequest が変わったら（サブタブを押した・入力タブを開いた）追加フォームを中央へ。
 * 描画前（useLayoutEffect）に位置を合わせるので、スクロールの動きは見えない。
 * 一覧の読み込み完了で行が増えるとフォームの位置がずれるため、要求後の最初の読み込み完了時にもう一度合わせる。
 * 追加・編集・削除後の再読込は loading を切り替えないので、ここではスクロールしない。
 */
export function useFormAutoScroll(formRef: RefObject<HTMLElement | null>, scrollRequest: number, loading: boolean): void {
  const lastRequest = useRef<number | null>(null)
  const realignOnLoad = useRef(false)
  const prevLoading = useRef(loading)

  useLayoutEffect(() => {
    const finishedLoading = prevLoading.current && !loading
    prevLoading.current = loading
    if (!scrollRequest) return
    if (lastRequest.current !== scrollRequest) {
      lastRequest.current = scrollRequest
      realignOnLoad.current = true
      scrollFormIntoView(formRef.current)
    } else if (finishedLoading && realignOnLoad.current) {
      realignOnLoad.current = false
      scrollFormIntoView(formRef.current)
    }
  }, [formRef, scrollRequest, loading])
}
