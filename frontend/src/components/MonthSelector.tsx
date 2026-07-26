import { FilterPill } from './FilterPill'

export interface MonthSelectorProps {
  months: string[]
  selected: string
  onSelect: (month: string) => void
}

/**
 * Month picker built from `FilterPill` — shared by the Dashboard and Charts
 * tabs (mirrors the original app's single sidebar month dropdown, but
 * expressed in this design system's pill chrome vocabulary).
 */
export function MonthSelector({ months, selected, onSelect }: MonthSelectorProps) {
  return (
    <div
      className="flex gap-xs overflow-x-auto pb-1 snap-x md:flex-wrap md:overflow-visible md:pb-0"
      style={{ WebkitOverflowScrolling: 'touch' }}
      data-testid="month-selector"
    >
      {months.map((month) => (
        <span key={month} className="shrink-0 snap-start">
          <FilterPill active={month === selected} onClick={() => onSelect(month)}>
            {month}
          </FilterPill>
        </span>
      ))}
    </div>
  )
}
