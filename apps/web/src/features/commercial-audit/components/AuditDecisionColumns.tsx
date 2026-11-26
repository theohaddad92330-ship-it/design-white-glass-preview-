import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { AuditFeedbackControls } from './AuditFeedbackControls'
import type { AuditColumn } from '../lib/build-audit'

/**
 * #2090.19 — cinq cartes par colonne, le reste ANNONCÉ derrière un « Voir
 * tout » — même patron que `INTERVENTION_VISIBLE_COUNT`
 * (`InterventionsBlock.tsx`) : une colonne qui déroule tout ce qu'un profil a
 * nommé n'est plus une décision, c'est une deuxième liste de tâches.
 */
const AUDIT_COLUMN_VISIBLE_COUNT = 5

/**
 * #2074.1 / #2074.2 / #2074.3 — ARRÊTER · GARDER · RENFORCER.
 *
 * Ce qu'on a REFUSÉ d'y mettre : un bloc « Actifs / Contraintes / Ruptures »
 * séparé (#2072.1-.3). Il aurait affiché exactement les mêmes phrases sous un
 * autre titre — les points d'évitement en « contraintes », les différenciateurs
 * en « actifs » — et rien n'apparaît deux fois sous la même forme avec le même
 * contenu. Les trois colonnes SONT cette matière, mise en décision.
 *
 * Chaque item porte sa SOURCE (#2072.4 / #2074.6) et sa porte de correction
 * (#2072.8 / #2074.7). La CONFIANCE demandée (#2072.5) n'est pas affichée :
 * aucun champ du profil n'en porte, et un niveau inventé serait précisément la
 * donnée fictive qu'on ne produit pas — un badge « mesuré » serait de toute
 * façon un score À UN AXE (mesuré / non mesuré), déjà dit par le null-check
 * ci-dessous : loi 4, rien n'apparaît deux fois sous la même forme.
 *
 * #2072.6 (CONSÉQUENCE par item) et #2072.7 (ACTION par item) restent, pour
 * la même raison, NON dupliqués ici : la conséquence existe déjà à l'échelle
 * de l'écran (`AuditConsequences`, rendu juste après ces colonnes) et
 * l'action existe déjà à l'échelle de la colonne (le lien « corriger »
 * ci-dessous, #2072.8). Un champ par PUCE individuelle supposerait une donnée
 * que `buildCommercialAudit` ne calcule pas à ce grain — l'ajouter est un
 * changement de contrat dans `lib/build-audit.ts`, hors de ce lot.
 */
/**
 * #2011.7 — « produite avec ton audit du 12 septembre », PAR RECOMMANDATION.
 *
 * `AuditHero.tsx:42` le dit déjà pour l'audit entier ; ce bloc de trois
 * colonnes est la SEULE section « recommandation » de l'écran (les autres —
 * verdict, chaîne, priorité, premiers mouvements — dérivent des mêmes
 * ruptures, pas d'une décision Arrêter/Garder/Renforcer). `version`/
 * `updatedAt` sont les MÊMES champs que `AuditHero` lit sur `CommercialAudit`
 * (`audit.version`/`audit.updatedAt`) — aucune deuxième source, aucune
 * deuxième horloge (GA-26). `null` = non mesuré : le libellé ne s'affiche
 * simplement pas, jamais une date devinée.
 */
function formatProducedWithDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function AuditDecisionColumns({
  columns,
  version = null,
  updatedAt = null,
  pendingReview = false,
}: {
  columns: AuditColumn[]
  /** #2011.7 — `null` = non mesuré, aucun libellé ne s'affiche. */
  version?: number | null
  updatedAt?: string | null
  /** #2011.9 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
   *  §1) : ces trois colonnes reposent sur une version qui n'a pas encore
   *  été validée (voir `lib/revision-review-state.ts`, scopé au SEUL audit). */
  pendingReview?: boolean
}) {
  const { t, i18n } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('columns.title')}
      </Text>
      {pendingReview && (
        <Text
          element="p"
          size="xs"
          data-testid="audit-columns-pending-review"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t('columns.pendingReview')}
        </Text>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {columns.map(column => (
          <AuditColumnCard key={column.key} column={column} />
        ))}
      </div>
      {version === null || updatedAt === null ? null : (
        <Text
          element="p"
          size="xs"
          data-testid="audit-columns-produced-with"
          className="text-[var(--bellum-text-muted)]"
        >
          {t('columns.producedWith', { date: formatProducedWithDate(updatedAt, i18n.language) })}
        </Text>
      )}
    </section>
  )
}

function AuditColumnCard({ column }: { column: AuditColumn }) {
  const { t } = useTranslation('commercialAudit')
  const [expanded, setExpanded] = useState(false)

  const items = column.items ?? []
  const shown = expanded ? items : items.slice(0, AUDIT_COLUMN_VISIBLE_COUNT)
  const hidden = items.length - shown.length

  return (
    <AuditCard className="space-y-2">
      <Text element="h3" size="sm" weight="semibold">
        {t(`columns.${column.key}`)}
      </Text>

      {column.items === null ? (
        // Le bloc source MANQUE : non mesuré. Une colonne vide qui dirait
        // « rien à arrêter » présenterait une absence de donnée comme une
        // faiblesse prouvée — c'est le point #2072.9.
        <div className="space-y-1">
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('common:unknownValue')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('columns.unmeasured')}
          </Text>
        </div>
      ) : column.items.length === 0 ? (
        // Le bloc EXISTE et n'a rien nommé : c'est un fait mesuré, et il
        // ne se dit pas comme un trou.
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('columns.empty')}
        </Text>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map(item => (
              <li key={item}>
                <Text element="p" size="sm">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
          {/* #2090.19 — pas plus de cinq éléments par colonne avant un « Voir
              tout » : le reste est ANNONCÉ, jamais coupé en silence. */}
          {hidden > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
              {t('columns.showAll', { count: hidden })}
            </Button>
          ) : null}
        </>
      )}

      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('columns.origin', { origin: t(`origin.${column.origin}`) })}
      </Text>
      <Link
        to="/settings/profile"
        className="inline-flex items-center pointer-coarse:min-h-11 text-xs font-medium text-[var(--bellum-text-accent)]"
      >
        {t('actions.correct')}
      </Link>
      {/* #2075.13 — refuser CETTE recommandation. `target_key` = `column.key`
          (`stop`/`keep`/`reinforce`) : l'audit ne porte pas d'identifiant plus
          fin que la colonne pour chaque puce (`build-audit.ts`). */}
      <AuditFeedbackControls targetKey={column.key} />
    </AuditCard>
  )
}
