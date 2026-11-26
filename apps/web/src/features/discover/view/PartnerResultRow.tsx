import { useTranslation } from 'react-i18next'
import { Building2, MapPin, Users } from 'lucide-react'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSiren } from '@/features/discover/lib/discover-normalize'
import { publishedHeadcount } from '@/features/discover/lib/discover-types'
import type { DiscoverPartnerRow } from '@/features/discover/lib/discover-result-rows'
import { PartnerComplementarityBlock } from './PartnerComplementarityBlock'

/* ------------------------------------------------------------------ */
/*  #2166.34-.41 — UNE ESN, une ligne.                                  */
/*                                                                     */
/*  Le retournement du tome 4 existait comme FILTRE (« montre-moi les   */
/*  ESN plutôt que les clients ») ; il devient une lecture. Ce qui      */
/*  change : la ligne ne dit plus « voilà un compte à conquérir », elle */
/*  dit « voilà une ESN, et voilà ce qu'on observe d'elle ».            */
/*                                                                     */
/*  ⚠️ Rien ici n'est une RELATION supposée. `observed` ne contient que  */
/*  des faits datés que la même recherche a déjà rendus (marché         */
/*  attribué, recrutement, appel d'offres) ; l'absence de relation      */
/*  observée est écrite, jamais interprétée comme une absence de fait.  */
/* ------------------------------------------------------------------ */

interface PartnerResultRowProps {
  row: DiscoverPartnerRow
  /** #2166.41 — qualifier une ESN, c'est l'analyser comme n'importe quel compte. */
  onQualify: () => void
}

export function PartnerResultRow({ row, onQualify }: PartnerResultRowProps) {
  const { t } = useTranslation('discover')

  return (
    <div
      className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* #2489.3 — même règle que CandidateRow/CandidateCard : jamais deviné. */}
          <CompanyAvatar name={row.name} logoUrl={row.logoUrl} website={row.website} />
          <span className="max-w-full break-words text-sm font-semibold leading-tight text-[color:var(--text-primary)]">
            {row.name}
          </span>
          <span className="text-xs" style={{ fontFamily: "'Geist Mono', monospace", color: 'var(--text-ghost)' }}>
            {formatSiren(row.siren)}
          </span>
          {/* #2166.34 — l'ambiguïté du code d'activité est PORTÉE par la ligne,
              jamais tranchée au hasard d'un côté. */}
          {row.nafClass === 'ambiguous' && (
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
              title={t('partners.ambiguousHint')}
            >
              {t('partners.ambiguous')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {/* #2166.35 — l'expertise OBSERVABLE : le secteur résolu au registre. */}
          {row.sector && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-[10px] w-[10px]" aria-hidden />
              {row.sector}
            </span>
          )}
          {/* #2166.36 — le territoire. */}
          {(row.city || row.department) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-[10px] w-[10px]" aria-hidden />
              {[row.city, row.department].filter(Boolean).join(' · ')}
            </span>
          )}
          {/* #4436.3 — un libellé nul (« 0 salarié ») n'est pas un effectif : rien ne s'écrit. */}
          {publishedHeadcount(row.headcountRange) && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-[10px] w-[10px]" aria-hidden />
              {publishedHeadcount(row.headcountRange)}
            </span>
          )}
        </div>

        {/* #2166.37 — les relations OBSERVÉES, datées, avec leur détail. */}
        {row.observed.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {row.observed.slice(0, 3).map((signal, index) => (
              <li key={`${signal.type}:${signal.date}:${index}`}>
                {t('partners.observedTitle')} — {t(`signalTypes.${signal.type}`)} · {signal.label}
                {signal.detail ? ` · ${signal.detail}` : ''}
              </li>
            ))}
          </ul>
        )}

        {/* #2613 — la ligne « Non su : … » (#2166.40) est RETIRÉE : décision de
            Louis du 20/09/2026, une absence ne fait pas une ligne dans une
            liste. `row.unknown` reste au MODÈLE — il pilote encore le bloc de
            complémentarité juste en dessous. */}

        {/* #2165.56 / #2151.34, RENVERSÉ par #2613 le 20/09/2026.
            La veille on exigeait les TROIS états toujours rendus (« l'absence
            de signal EST l'état inconnu, jamais une absence d'affichage »).
            Louis a tranché l'inverse pour les listes : les deux états qui
            DISENT quelque chose restent, « Rang 2 : non su » ne s'écrit plus. */}
        {row.rank2 !== 'unknown' && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t(`partners.rank2.${row.rank2}`)}
          </p>
        )}

        {/* #2165.55 — RÉFUTÉ en prod 19/09 : 0 carte sur 24 portait le bloc
            complémentarité. `unknown` porte déjà « complémentarité » quand
            AUCUN axe n'est évalué (voir juste au-dessus) — le bloc ne rend
            donc rien de plus ici, jamais un bloc vide en double. */}
        {row.complementarity && !row.unknown.includes('complementarity') && (
          <PartnerComplementarityBlock result={row.complementarity} />
        )}
      </div>

      <button
        type="button"
        onClick={onQualify}
        className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm"
        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
      >
        {t('partners.qualify')}
      </button>
    </div>
  )
}
