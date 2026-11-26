import { Badge, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { TalentRow } from '@bellum/contracts'
import { Provenance } from '@/components/primitives/Provenance'
import { formatDate } from '@/lib/locale'
import { staffingProvenance } from '../lib/staffingProvenance'

const DERIVED_VARIANT: Record<TalentRow['staffing']['availability'], 'success' | 'info' | 'warning' | 'outline'> = {
  available: 'success',
  partial: 'info',
  busy: 'warning',
  busy_open_ended: 'warning',
  unknown: 'outline',
  // #3068 — interruption déclarée, disponibilité non confirmée : la même
  // attention que « en mission », jamais la couleur de « disponible ».
  a_confirmer: 'warning',
}

/**
 * Décision Louis (23/10/2026, lot TALENTS-REPRISE) — LA DISPONIBILITÉ DÉCLARÉE
 * GAGNE SUR LE PLANNING. Quand la fiche porte une déclaration (tout sauf
 * « inconnu »), le badge dit CE QUE LA PERSONNE A DÉCLARÉ ; le planning des
 * affectations reste nommé à côté (« Planning : … »), jamais caché, jamais
 * présenté comme une erreur à corriger. Sans déclaration, le planning reste
 * seul juge — et « à confirmer » quand il ne sait rien.
 */
const DECLARED_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'outline'> = {
  immediate: 'success',
  sous_1_mois: 'info',
  sous_3_mois: 'info',
  indisponible: 'warning',
  en_mission: 'warning',
  a_confirmer: 'warning',
}

export function declaredWins(row: Pick<TalentRow, 'declaredAvailability'>): boolean {
  return Boolean(row.declaredAvailability) && row.declaredAvailability !== 'inconnu'
}

function planningText(t: TFunction<'consultants'>, row: TalentRow): string {
  const freeFrom = formatDate(row.staffing.freeFrom)
  const derived = row.staffing.availability
  return derived === 'busy' && freeFrom ? t('staffing.busyUntil', { date: freeFrom }) : t(`staffing.${derived}`)
}

/** « Déclarée — gagne sur le planning · Planning : En mission jusqu'au … » — le planning n'est cité que s'il sait quelque chose. */
function declaredSecondary(t: TFunction<'consultants'>, row: TalentRow): string {
  const planning = row.staffing.availability === 'unknown' ? null : planningText(t, row)
  return [t('staffing.declaredWins'), planning ? t('staffing.planning', { value: planning }) : null]
    .filter(Boolean)
    .join(' · ')
}

function DeclaredFirst({ row, density }: { row: TalentRow; density: 'full' | 'row' }) {
  const { t } = useTranslation('consultants')
  const label = t(`availability.${row.declaredAvailability}`)
  const secondary = declaredSecondary(t, row)
  const planning =
    row.staffing.availability === 'unknown' ? null : t('staffing.planning', { value: planningText(t, row) })
  if (density === 'row') {
    return (
      <span className="flex min-w-0 flex-col gap-0.5" title={[label, secondary].join(' · ')}>
        <Badge
          variant={DECLARED_VARIANT[row.declaredAvailability] ?? 'outline'}
          className="max-w-full shrink-0 self-start overflow-hidden"
        >
          <span className="truncate">{label}</span>
        </Badge>
        <span className="sr-only">{t('staffing.declaredWins')}</span>
        {planning ? (
          <Text size="xs" className="min-w-0 truncate text-[var(--bellum-text-muted)]">
            {planning}
          </Text>
        ) : null}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1">
        <Badge variant={DECLARED_VARIANT[row.declaredAvailability] ?? 'outline'}>{label}</Badge>
      </span>
      <Text size="xs" className="min-w-0 truncate text-[var(--bellum-text-muted)]" title={t('staffing.declaredWins')}>
        {t('staffing.declaredWins')}
      </Text>
      <div className="min-w-0 truncate">
        <Provenance source="human" observedAt={row.updatedAt || null} detail={t('staffing.provenance.card')} />
      </div>
      {planning ? (
        <span className="min-w-0">
          <Text size="xs" className="min-w-0 truncate text-[var(--bellum-text-muted)]" title={planning}>
            {planning}
          </Text>
        </span>
      ) : null}
      <DeclaredSourceLine row={row} />
    </span>
  )
}

/**
 * La disponibilité d'un talent — dérivée quand on peut, déclarée sinon.
 *
 * Le calcul (`deriveStaffing`) existait, testé, exposé sur une route, et aucun
 * écran ne l'appelait : le vivier affichait le champ SAISI, dont le défaut en
 * base est « inconnu ». Une fiche pouvait donc annoncer « disponible tout de
 * suite » pendant que la personne était en mission jusqu'en mars.
 *
 * Deux règles d'affichage, toutes deux contre une lecture fausse :
 *
 *  - **aucune affectation ⇒ on ne conclut pas.** Le badge dit « à confirmer » et
 *    montre le déclaratif À CÔTÉ, marqué comme tel. Afficher « disponible »
 *    parce que la base est vide est exactement le mensonge que le §6.2 vise ;
 *  - **une affectation en cours l'emporte sur la fiche**, et la contradiction
 *    est montrée plutôt que masquée — c'est elle qui déclenche la mise à jour.
 */
/**
 * #3488 (recette 02/10) — « la fiche dit « Non renseignée » » est une phrase
 * bancale : la fiche ne dit RIEN. Une disponibilité jamais saisie s'écrit
 * « disponibilité non déclarée » ; une valeur saisie reste citée.
 */
function declaredText(t: TFunction<'consultants'>, row: TalentRow): string {
  return row.declaredAvailability === 'inconnu'
    ? t('staffing.declaredNone')
    : t('staffing.declared', { value: t(`availability.${row.declaredAvailability}`) })
}

export function TalentAvailabilityBadge({
  row,
  // #2737 — `row` : UNE ligne (badge + ce que la fiche déclare), la provenance
  // et la source au survol. Dans le tableau du vivier, les trois étages de la
  // forme complète faisaient monter chaque ligne ; la fiche garde la forme
  // complète, qui reste le défaut.
  density = 'full',
}: {
  row: TalentRow
  density?: 'full' | 'row'
}) {
  const { t } = useTranslation('consultants')
  const derived = row.staffing.availability
  // #4198 — JJ/MM/AAAA, jamais l'ISO brut ; une date illisible ne s'écrit pas.
  const freeFrom = formatDate(row.staffing.freeFrom)

  if (declaredWins(row)) return <DeclaredFirst row={row} density={density} />
  if (density === 'row') return <TalentAvailabilityLine row={row} />

  // ⚠️ #2500 (17/09/2026) — « À coDfismer » : le badge et le texte déclaratif
  // vivaient dans un `flex` SANS `min-w-0`, dans une colonne étroite
  // (`vivierColumnClass('availability')`, jusqu'à 10 % à 1 512 px). Un enfant
  // de flex garde par défaut sa largeur minimale de CONTENU (`min-width: auto`,
  // cause racine notée dans `index.css`) : le texte débordait sur la colonne
  // voisine au lieu de se tronquer. `min-w-0` sur la ligne, `truncate` sur le
  // texte — même patron que chaque autre cellule de `VivierTableRow.tsx`.
  if (derived === 'unknown') {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* #3488 (recette Y18) — « disponibilité non déclarée » se lisait « disponi… » :
            le texte retourne à la ligne sous le badge au lieu de se tronquer. Il ne
            déborde toujours pas (`min-w-0` + `break-words`). */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
          <Badge variant="outline">{t('staffing.unknown')}</Badge>
          {/* #2500.1 — mesuré en recette le 17/09/2026 : tronqué sans `title`,
              ce texte perdait son contenu sans recours dans les colonnes
              étroites (mode compact, #2526). */}
          <Text size="xs" className="min-w-0 break-words text-[var(--bellum-text-muted)]" title={declaredText(t, row)}>
            {declaredText(t, row)}
          </Text>
        </span>
        <StaffingProvenanceLine row={row} />
        <DeclaredSourceLine row={row} />
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1">
        <Badge variant={DERIVED_VARIANT[derived]}>
          {derived === 'busy' && freeFrom ? t('staffing.busyUntil', { date: freeFrom }) : t(`staffing.${derived}`)}
        </Badge>
        {/* Une fiche qui dit « disponible » alors qu'une mission court est une
            information : elle dit que quelqu'un doit la corriger. */}
        {row.declaredAvailability === 'immediate' && derived !== 'available' ? (
          // #2500.1 — voir la note ci-dessus : même patron.
          <Text size="xs" className="truncate text-[var(--warning-soft-text)]" title={t('staffing.contradicts')}>
            {t('staffing.contradicts')}
          </Text>
        ) : null}
      </span>
      <StaffingProvenanceLine row={row} />
    </span>
  )
}

/**
 * D'où sort la valeur affichée — la source ET la date (BEL-ATS-003).
 *
 * ⚠️ **Visible, pas au survol.** Le §1.4 la range « au survol » ; au clavier et
 * au toucher il n'y a pas de survol, et un `title=` n'est atteignable ni au
 * doigt ni à la tabulation — l'information n'existerait alors que pour une
 * souris. Une ligne toujours rendue est l'« autrement » le plus simple : aucun
 * geste à faire, lue dans l'ordre du document par un lecteur d'écran, et aucun
 * nouvel élément interactif à nommer ni à dimensionner (GA-30 / GA-32 / GA-35).
 *
 * Le composant en rendait déjà une dans deux de ses branches — celle-ci ne
 * change donc pas la densité de la colonne.
 */
function StaffingProvenanceLine({ row }: { row: TalentRow }) {
  const { t } = useTranslation('consultants')
  const provenance = staffingProvenance(row)

  if (provenance.kind === 'unknownSource') {
    return (
      <Text size="xs" className="truncate text-[var(--bellum-text-muted)]">
        {t('staffing.provenance.unknownSource')}
      </Text>
    )
  }

  // La DATE voyage dans la phrase quand la phrase la nomme (« une mission court
  // jusqu'au 30/09 »), et dans `observedAt` quand elle date l'observation. Elle
  // n'est jamais écrite deux fois, et jamais inventée quand elle manque.
  //
  // `Provenance` ne prend pas de `className` (primitive partagée, hors
  // périmètre de ce lot) : le `div truncate` l'enveloppe pour la même raison
  // que #2500 ci-dessus — `white-space: nowrap` hérite du parent, `truncate`
  // le tronque au bord de la colonne au lieu de le laisser déborder.
  if (provenance.kind === 'declared') {
    return (
      <div className="min-w-0 truncate">
        <Provenance source="human" observedAt={provenance.observedAt} detail={t('staffing.provenance.card')} />
      </div>
    )
  }

  const detail =
    provenance.detail === 'busyUntil'
      ? t('staffing.provenance.busyUntil', { date: formatDate(provenance.observedAt) })
      : t(`staffing.provenance.${provenance.detail}`)

  return (
    <div className="min-w-0 truncate">
      <Provenance
        source="pipeline"
        observedAt={provenance.detail === 'noneRunning' ? provenance.observedAt : null}
        detail={detail}
      />
    </div>
  )
}

/**
 * #2186.9 — CHAQUE ÉTAT DÉCLARÉ PORTE SA SOURCE.
 *
 * `consultants.source` (manuel, CV, import, ATS, cooptation) existait déjà,
 * testé et affiché sur les onglets Profil et Consentement de la fiche — mais
 * jamais relié à l'endroit où la disponibilité DÉCLARÉE elle-même s'affiche.
 * Un commercial qui lisait « la fiche dit disponible » ne pouvait pas savoir
 * si c'était une saisie manuelle, fraîche, ou une extraction de CV jamais
 * relue depuis. `row.source` est déjà calculé et présent sur `TalentRow` :
 * ce composant est l'APPELANT qui manquait, pas une nouvelle donnée.
 *
 * Réutilise `sources.*`, le MÊME vocabulaire que la fiche (`consent.source`) —
 * un second jeu de libellés pour la même colonne aurait fini par diverger.
 */
function DeclaredSourceLine({ row }: { row: TalentRow }) {
  const { t } = useTranslation('consultants')
  return (
    <Text size="xs" className="truncate text-[var(--bellum-text-muted)]">
      {row.source ? t(`sources.${row.source}`) : t('staffing.declaredSourceUnknown')}
    </Text>
  )
}

/**
 * #2737 — la disponibilité en UNE ligne, pour une cellule de tableau.
 *
 * Rien n'est retiré, tout est déplacé : le badge et la phrase qui compte (ce
 * que dit la fiche quand on ne sait pas, ou la contradiction à corriger)
 * restent à l'écran ; la provenance et la source passent dans l'infobulle de
 * la ligne entière, en texte — la fiche les montre en clair.
 */
function TalentAvailabilityLine({ row }: { row: TalentRow }) {
  const { t } = useTranslation('consultants')
  const derived = row.staffing.availability
  // #4198 — JJ/MM/AAAA, jamais l'ISO brut ; une date illisible ne s'écrit pas.
  const freeFrom = formatDate(row.staffing.freeFrom)
  const badge = derived === 'busy' && freeFrom ? t('staffing.busyUntil', { date: freeFrom }) : t(`staffing.${derived}`)
  const declared =
    derived === 'unknown'
      ? declaredText(t, row)
      : row.declaredAvailability === 'immediate' && derived !== 'available'
        ? t('staffing.contradicts')
        : null
  const provenance = staffingProvenance(row)
  const provenanceText =
    provenance.kind === 'unknownSource'
      ? t('staffing.provenance.unknownSource')
      : provenance.kind === 'declared'
        ? t('staffing.provenance.card')
        : provenance.detail === 'busyUntil'
          ? t('staffing.provenance.busyUntil', { date: formatDate(provenance.observedAt) })
          : t(`staffing.provenance.${provenance.detail}`)
  const source =
    derived === 'unknown' ? (row.source ? t(`sources.${row.source}`) : t('staffing.declaredSourceUnknown')) : null
  const title = [badge, declared, provenanceText, source].filter(Boolean).join(' · ')

  return (
    // #3488 (Y18) — inconnue : la phrase se lisait « disponi… » ; la replier faisait passer
    // la ligne du vivier à 74 px (garde #2737, 72 px). Le badge « À confirmer » dit déjà
    // l'inconnu : la précision « non déclarée » vit dans l'infobulle et pour le lecteur
    // d'écran, jamais tronquée à l'œil.
    <span className="flex min-w-0 items-center gap-1" title={title}>
      {/* Le badge d'abord ENTIER (`shrink-0`), borné à la cellule
          (`max-w-full`) : c'est la phrase secondaire qui se tronque. */}
      <Badge variant={DERIVED_VARIANT[derived]} className="max-w-full shrink-0 overflow-hidden">
        <span className="truncate">{badge}</span>
      </Badge>
      {declared && derived === 'unknown' ? <span className="sr-only">{declared}</span> : null}
      {declared && derived !== 'unknown' ? (
        <Text size="xs" className="min-w-0 truncate text-[var(--warning-soft-text)]">
          {declared}
        </Text>
      ) : null}
    </span>
  )
}
