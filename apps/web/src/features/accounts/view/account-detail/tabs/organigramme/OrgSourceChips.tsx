import type { OrgSource } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { FileCheck2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * Les preuves d'un nœud ou d'un lien, telles que le graphe les porte.
 *
 * « Chaque nœud et edge porte source, date, statut et confiance » (DoD p32), et
 * `T5.md:804-813` le pose comme deux obligations SÉPARÉES et toutes deux
 * TOUJOURS dues : « source de l'inférence ✓ » et « date de la source ✓ ». La
 * confiance seule est un chiffre sans appui — c'est la NATURE de la source (site
 * officiel, registre, LinkedIn, inférence IA) et sa DATE qui disent au commercial
 * s'il peut s'appuyer dessus.
 *
 * ⚠️ #3037 (retour bêta, revirement du paragraphe ci-dessus) — une date
 * ABSENTE ne fait plus AUCUNE mention, ni « date inconnue » ni « unknown
 * date ». Doctrine #2613 (Louis 20/09/2026), étendue aux fiches de compte le
 * même jour : « on affiche pas ce qu'on a pas […] ça envoie juste un signal
 * negatif à l'user qui est pas utile ». La chip garde alors seulement le
 * LABEL de la source (« Registre », « Réseau professionnel »…), jamais un
 * repli inventé pour la date. Elle n'est évidemment pas remplacée par la date
 * du jour non plus — « un fait périmé redevient inconnu AVEC sa date ».
 * Gardé par `une-absence-ne-fait-pas-une-ligne.test.ts` (`FICHE_ABSENCE_ONLY_KEYS`).
 *
 * Rien à citer ⇒ `null`, et c'est à l'appelant de NOMMER l'absence : un nœud sans
 * aucune source n'a pas une preuve discrète, il n'en a pas. On ne fabrique pas
 * une source pour remplir la ligne. Une source dont la `ref` est une URL devient
 * un lien vérifiable ; sinon elle reste du texte (une citation de registre n'est
 * pas cliquable).
 */
export function OrgSourceChips({
  sources,
  max,
  className = 'mt-1',
}: {
  sources: OrgSource[]
  max?: number
  /** L'espacement dépend de l'endroit : sous un nœud on décale d'une ligne, sur
   *  la ligne d'un trait on s'aligne au texte voisin. */
  className?: string
}) {
  const { t } = useTranslation('accountOrg')
  if (sources.length === 0) return null

  const shown = typeof max === 'number' ? sources.slice(0, max) : sources
  const hidden = sources.length - shown.length

  return (
    <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1', className)}>
      <FileCheck2 className="size-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      {shown.map((source, i) => {
        const label = t(`orgGraph.sourceKinds.${source.kind}`, source.kind)
        // Une date illisible sort de `formatDate` en `null` : elle est alors
        // absente, pas « Invalid Date ». La locale est celle de l'APP.
        // #3037 — absente, elle ne fait AUCUNE mention (#2613) : la chip
        // garde son label seul, jamais un « date inconnue » de repli.
        const day = formatDate(source.date, { dateStyle: 'medium' })
        const text = day ? `${label} · ${day}` : label
        const key = `${source.id}-${i}`
        return source.ref && /^https?:\/\//.test(source.ref) ? (
          <a
            key={key}
            href={source.ref}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-[var(--info-soft-text)] underline-offset-2 hover:underline"
          >
            {text}
          </a>
        ) : (
          <span key={key} className="text-xs text-[var(--bellum-text-muted)]">
            {text}
          </span>
        )
      })}
      {hidden > 0 ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">{t('orgGraph.moreSources', { count: hidden })}</span>
      ) : null}
    </div>
  )
}
