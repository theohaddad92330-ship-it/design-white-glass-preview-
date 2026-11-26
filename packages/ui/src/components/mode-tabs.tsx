import { cn } from '../lib/utils'

export type ModeTabItem<T extends string> = {
  key: T
  label: string
}

export function ModeTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<ModeTabItem<T>>
  value: T
  onChange: (mode: T) => void
  className?: string
}) {
  return (
    // `overflow-x-auto` remplace `overflow-hidden` : sous 768px, une liste
    // d'onglets trop large défile dans SON conteneur au lieu de déborder de
    // la page (§5/§8 du design system) — même rendu tant que ça tient.
    <div
      className={cn(
        'inline-flex max-w-full overflow-x-auto rounded-lg border border-[var(--bellum-border)]',
        className,
      )}
    >
      {items.map(item => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              // shrink-0 : un onglet ne se comprime jamais, il pousse le
              // conteneur à défiler plutôt qu'à écraser son libellé.
              'h-9 shrink-0 border-r border-[var(--bellum-border)] px-4 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out last:border-r-0 active:scale-[0.98]',
              active
                ? 'bg-[var(--bellum-border)]'
                : 'bg-[var(--bellum-bg)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-bg-lighter)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
