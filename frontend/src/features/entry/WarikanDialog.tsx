import { useEffect, useState } from 'react'
import { getWarikanUsers, reflectToWarikan } from '../../api/client'
import type { IndexedEntry, WarikanUser } from '../../api/types'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { formatYen } from '../../utils/currency'
import { formatEntryDate } from './entryParts'

export interface WarikanDialogProps {
  month: string
  entry: IndexedEntry
  onClose: () => void
  /** 反映成功時に呼ばれる。呼び出し側が一覧を取り直す。 */
  onDone: () => void
}

/**
 * 「割り勘に反映」のポップアップ。
 *
 * 支払者の候補は割り勘アプリの users から取ってくる（表示名は割り勘側で変えられるので
 * 家計簿側に名前を持たない）。相手が一度も割り勘アプリを開いていないと候補が1人しか
 * 出ないため、その場合は理由を添える。
 */
export function WarikanDialog({ month, entry, onClose, onDone }: WarikanDialogProps) {
  const [users, setUsers] = useState<WarikanUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getWarikanUsers()
      .then((data) => {
        if (!active) return
        setUsers(data)
        // 候補が1人しかいなければ選ぶ手間を省く。
        if (data.length === 1) setPaidBy(data[0].user_id)
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : '支払者の取得に失敗しました')
      })
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async () => {
    if (!paidBy) {
      setError('支払った人を選択してください')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // レスポンスは全グループ・全月のエントリなので使わない。
      // 一覧の再取得は呼び出し側（絞り込み条件を知っている側）に任せる。
      await reflectToWarikan(entry.id, paidBy)
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '反映に失敗しました')
      setSubmitting(false)
    }
  }

  const dateLabel = formatEntryDate(month, entry.日)

  return (
    <Modal title="割り勘に反映" onClose={onClose}>
      <dl className="flex flex-col gap-xxs font-body text-[13px] leading-[1.6]">
        <div className="flex gap-sm">
          <dt className="w-[72px] shrink-0 text-mute-dark">日付</dt>
          <dd>{dateLabel ?? '—'}</dd>
        </div>
        <div className="flex gap-sm">
          <dt className="w-[72px] shrink-0 text-mute-dark">カテゴリ</dt>
          <dd>{entry.カテゴリ}</dd>
        </div>
        <div className="flex gap-sm">
          <dt className="w-[72px] shrink-0 text-mute-dark">金額</dt>
          <dd>{formatYen(entry.金額)}</dd>
        </div>
        <div className="flex gap-sm">
          <dt className="w-[72px] shrink-0 text-mute-dark">詳細</dt>
          <dd>{entry.備考 || `（空欄のため「${entry.カテゴリ}」として送ります）`}</dd>
        </div>
      </dl>

      <p className="mt-lg font-body text-[13px] leading-[1.8] text-mute-dark">支払った人</p>

      {loadError !== null ? (
        <p className="mt-xs font-body text-[13px] text-warning">{loadError}</p>
      ) : users === null ? (
        <p className="mt-xs font-body text-[13px] text-mute-dark">読み込み中...</p>
      ) : users.length === 0 ? (
        <p className="mt-xs font-body text-[13px] text-warning">
          割り勘アプリにユーザーが登録されていません。先に割り勘アプリを開いてください。
        </p>
      ) : (
        <>
          <div className="mt-xs flex flex-wrap gap-sm" role="radiogroup" aria-label="支払った人">
            {users.map((user) => (
              <Button
                key={user.user_id}
                size="sm"
                variant={paidBy === user.user_id ? 'primary' : 'secondary'}
                role="radio"
                aria-checked={paidBy === user.user_id}
                onClick={() => setPaidBy(user.user_id)}
              >
                {user.display_name}
              </Button>
            ))}
          </div>
          {users.length === 1 && (
            <p className="mt-xs font-body text-[12px] leading-[1.5] text-mute-dark">
              候補が1人だけです。相手が割り勘アプリを一度も開いていない場合は候補に出ません。
            </p>
          )}
        </>
      )}

      {error !== null && <p className="mt-sm font-body text-[13px] text-warning">{error}</p>}

      <div className="mt-lg flex flex-wrap gap-sm">
        <Button
          size="sm"
          variant={submitting || !paidBy ? 'disabled' : 'primary'}
          onClick={handleSubmit}
        >
          {submitting ? '反映中...' : '反映する'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
      </div>
    </Modal>
  )
}
