import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { DiscoverCoverage, DiscoverDegradedSource } from '@/features/discover/lib/discover-types'

/**
 * « Combien d'entreprises n'ont PAS été regardées » — dit à part, et dit autrement.
 *
 * La résolution SIREN est bornée par nécessité (l'API coupe à 45 s ; 120
 * résolutions coûtent 85 à 144 s de file d'attente). Ce qui tombe sous la borne
 * n'a reçu **aucun verdict** : ni retenu, ni écarté. Simplement pas regardé.
 *
 * D'où un bandeau distinct du `DegradedBanner` :
 *
 * - **ton neutre, pas alarme** — une borne de couverture n'est pas une panne.
 *   L'ambre est réservé à ce qui est réellement cassé ;
 * - **vocabulaire séparé** — jamais « écartées », jamais « homonymie ». Ces mots
 *   décrivent un jugement rendu, et il n'y en a pas eu ;
 * - **le total est affiché** — « 25 sur 126 détectées » retire au chiffre de
 *   résultats son air de fait de marché. C'est la leçon de #631 : un écran qui
 *   dit « 3 résultats » quand 117 entreprises n'ont jamais été examinées ment,
 *   même si chacun des 3 est exact.
 */
export function CoverageNotice({
  coverage,
  notExamined,
  shown,
}: {
  coverage: DiscoverCoverage | null
  /** Entrée `degraded` de repli, si le backend ne renvoie pas encore `coverage`. */
  notExamined: DiscoverDegradedSource | null
  shown: number
}) {
  const { t } = useTranslation('discover')

  // Le bloc structuré fait foi ; l'entrée `degraded` est le filet de secours
  // quand le web est déployé avant l'IA. Sans ni l'un ni l'autre, rien à dire.
  const count = coverage?.notExamined ?? notExamined?.count ?? 0
  if (count <= 0) return null

  const found = coverage?.candidatesFound ?? 0
  const examined = coverage?.resolutionsAttempted ?? 0
  const rejected = (coverage?.rejectedAmbiguous ?? 0) + (coverage?.rejectedUnreachable ?? 0)

  const names = coverage?.notIdentifiedNames ?? []
  // Le compte reste exact : la liste est plafonnée côté IA, l'écran dit combien d'autres.
  const hiddenNames = names.length > 0 ? Math.max(0, count + rejected - names.length) : 0

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Search className="h-[13px] w-[13px]" />
        {t('coverage.title', { count })}
      </p>
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {t('coverage.description')}
      </p>
      {/* #4319.2 — « Je veux voir la liste » : les noms, pas seulement le nombre. Aucun nom => aucune ligne. */}
      {names.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t('coverage.namesTitle')}
          </p>
          <ul data-testid="coverage-names" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {names.map(name => (
              <li key={name} style={{ color: 'var(--text-primary)' }}>
                {name}
              </li>
            ))}
            {hiddenNames > 0 && (
              <li style={{ color: 'var(--text-muted)' }}>{t('coverage.namesMore', { count: hiddenNames })}</li>
            )}
          </ul>
        </div>
      )}
      {found > 0 && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('coverage.breakdown', { found, examined, shown, rejected, notExamined: count })}
        </p>
      )}
    </div>
  )
}
