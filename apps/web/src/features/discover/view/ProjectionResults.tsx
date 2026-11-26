import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { NeedResultRow } from './NeedResultRow'
import { PartnerResultRow } from './PartnerResultRow'
import { ContactResultRow } from './ContactResultRow'
import { PersonNameResults, type PersonNameRequest } from './PersonNameResults'
import {
  filterNeedRows,
  needRowsHiddenBreakdown,
  type DiscoverNeedsProjection,
  type DiscoverPartnersProjection,
} from '@/features/discover/lib/discover-result-rows'
import {
  filterContactRows,
  type DiscoverContactFilters,
  type DiscoverContactRow,
} from '@/features/discover/lib/discover-contact-rows'
import type { DiscoverSignal } from '@/features/discover/lib/discover-types'
import { WHY_NOW_GROUP_ORDER, signalFamilyOf } from '@/features/discover/lib/discover-why-now'
import type { RelationChipImpact, RelationChipKey } from '@/features/discover/lib/discover-filters'

/* #4634 — les référentiels des filtres (relation, niveau, expertise) ont suivi les champs dans le volet :
   `ProjectionSearchFields.tsx`. */

/* ------------------------------------------------------------------ */
/*  #2165.62 — LES COMMANDES CHANGENT AVEC LE TYPE DE RÉSULTAT.         */
/*                                                                     */
/*  Trier des besoins « par score d'intérêt », exporter des partenaires */
/*  avec les colonnes d'un compte, cocher « à fort potentiel » sur une  */
/*  ligne d'appel d'offres : trois commandes qui n'ont pas de sens hors */
/*  du type « Comptes ». Elles ne sont donc pas grisées, elles ne sont  */
/*  pas là — et à leur place vivent les deux qui ont un sens ici.       */
/*                                                                     */
/*  Ce que ces deux listes ne montrent PAS est écrit au-dessus d'elles  */
/*  (`withoutSignal`, `unresolvedNaf`) : une entreprise qu'on n'a pas   */
/*  su classer n'est ni dedans, ni « non ».                             */
/* ------------------------------------------------------------------ */

interface NeedsResultsProps {
  projection: DiscoverNeedsProjection
  /** #4634 — nature, preuve directe et entreprise se posent dans le volet (`ProjectionSearchFields`) ; la liste les lit. */
  nature: DiscoverSignal['type'] | 'any'
  directOnly: boolean
  /** #4999.1 — « Uniquement freelance » sur les besoins. */
  freelanceOnly?: boolean
  /** #2165.47 — texte libre cherché dans l'ENTREPRISE porteuse. Vide = aucune contrainte. */
  company: string
  /** #2165.44 — la fenêtre de fraîcheur du rail (`activeFilters.sinceDays`),
   *  appliquée cette fois À LA LIGNE (RÉFUTÉ en prod 19/09 : elle ne
   *  s'appliquait qu'à la requête). `null` = aucune contrainte. */
  sinceDays: number | null
  /** #2165.48 — les départements choisis au rail, déjà PARSÉS
   *  (`parseDepartments(activeFilters.department)`). Vide = aucune contrainte. */
  departments: readonly string[]
  /** Horloge injectable — jamais `Date.now()` en dur ici, sans quoi les tests
   *  dépendraient de l'heure réelle d'exécution. Absent = `Date.now()`. */
  nowMs?: number
  onQualify: (siren: string) => void
}

export function NeedsResults({
  projection,
  nature,
  directOnly,
  freelanceOnly,
  company,
  sinceDays,
  departments,
  nowMs,
  onQualify,
}: NeedsResultsProps) {
  const { t } = useTranslation('discover')
  // #2165.44/.48 — le pool APRÈS nature/compte (ordinaires), AVANT
  // direct/fenêtre/zone : sert à la fois aux lignes finales ET au compteur de
  // retrait (`needRowsHiddenBreakdown`), un seul calcul pour les deux (GA-26).
  const preFilterPool = useMemo(
    () => filterNeedRows(projection.rows, { nature, directOnly: false, company }),
    [projection.rows, nature, company],
  )
  const rows = useMemo(
    () =>
      filterNeedRows(preFilterPool, {
        nature: 'any',
        directOnly,
        freelanceOnly,
        company: '',
        sinceDays,
        departments,
        nowMs,
      }),
    [preFilterPool, directOnly, freelanceOnly, sinceDays, departments, nowMs],
  )
  const hiddenBreakdown = useMemo(
    () => needRowsHiddenBreakdown(preFilterPool, { directOnly, freelanceOnly, sinceDays, departments, nowMs }),
    [preFilterPool, directOnly, freelanceOnly, sinceDays, departments, nowMs],
  )

  // #4999.2 — « aucun signal freelance » ne se dit que si AUCUNE ligne de la recherche ne l'est (pas seulement les affichées).
  const hasFreelanceSignal = useMemo(() => preFilterPool.some(row => row.contractType === 'FREELANCE'), [preFilterPool])
  const groupsId = useId()
  const groups = useMemo(
    () =>
      WHY_NOW_GROUP_ORDER.map(key => ({ key, rows: rows.filter(row => signalFamilyOf(row.nature) === key) })).filter(
        group => group.rows.length > 0,
      ),
    [rows],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('resultType.count', { count: rows.length })}
        </span>
      </div>

      {/* #2941 / #2169.9 — la file « Pistes à qualifier » (lentille portefeuille
          des Opportunités) doit être accessible depuis le Pipe ET Découvrir.
          Même geste que le lien « Où positionner un consultant ? » ci-dessus :
          un LIEN vers la capacité qui existe déjà, jamais un second écran. */}
      <Link
        to="/projects"
        search={{ pistes: 1 }}
        className="min-h-11 text-xs font-medium underline underline-offset-2"
        style={{ color: 'var(--accent-soft-text)' }}
      >
        {t('needs.openQualificationQueue')}
      </Link>

      {/* Ce que la liste ne contient pas, et pourquoi — jamais un silence. */}
      {projection.withoutSignal > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('needs.withoutSignal', { count: projection.withoutSignal })}
        </p>
      )}
      {/* #2165.44/.46/.48 — RÉFUTÉ en prod 19/09 : la fenêtre, la zone et le
          niveau de preuve retiraient 0 ligne. Chaque motif compté à part —
          jamais un total qui en tairait deux (même règle que ResultsToolbar,
          `HiddenBreakdown`). */}
      {hiddenBreakdown.direct > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('needs.hiddenByDirect', { count: hiddenBreakdown.direct })}
        </p>
      )}
      {freelanceOnly && hiddenBreakdown.freelance > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {!hasFreelanceSignal
            ? t('needs.noFreelanceSignal', { count: hiddenBreakdown.freelance })
            : t('needs.hiddenByFreelance', { count: hiddenBreakdown.freelance })}
        </p>
      )}
      {hiddenBreakdown.window > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('needs.hiddenByWindow', { count: hiddenBreakdown.window })}
        </p>
      )}
      {hiddenBreakdown.zone > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('needs.hiddenByZone', { count: hiddenBreakdown.zone })}
        </p>
      )}

      {rows.length === 0 ? (
        // #4999.1 — « aucun signal daté, coche un signal » ne se dit que si la recherche n'en a rendu AUCUN ;
        // si des besoins existent mais qu'un filtre les masque, les lignes ci-dessus disent déjà pourquoi.
        preFilterPool.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('needs.empty')}
          </p>
        ) : null
      ) : (
        // #4045.9 — les besoins rangés par FAMILLE de signal, chacune sous son intitulé ;
        // une famille sans besoin n'a ni intitulé ni ligne (on n'affiche pas ce qu'on n'a pas).
        <div className="flex flex-col gap-4">
          {groups.map(group => (
            <section
              key={group.key}
              role="group"
              aria-labelledby={`${groupsId}-${group.key}`}
              data-testid={`needs-group-${group.key}`}
              className="flex flex-col gap-2"
            >
              <h3
                id={`${groupsId}-${group.key}`}
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t(`card.signalGroup.${group.key}`)}
              </h3>
              {group.rows.map(row => (
                <NeedResultRow key={row.key} row={row} onQualify={() => onQualify(row.siren)} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

interface ContactsResultsProps {
  rows: DiscoverContactRow[]
  /** #4634 — posés dans le volet (`ProjectionSearchFields`) ; la liste les LIT, elle n'en rend plus aucun contrôle. */
  filters: DiscoverContactFilters
  /** #4634 — la liste vient de `GET /contacts`, qui a déjà appliqué `peopleSearchCriteria` : ils ne se réappliquent pas. */
  searched?: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  /**
   * #2621.1 — le nom EXACT que le marché du workspace attend dans `location`
   * (`MARKET_COUNTRY_NAMES`, `@bellum/contracts`). `null`/absent tant que le
   * marché n'est pas encore résolu : aucune contrainte de pays n'est posée
   * (voir `filterContactRows`).
   */
  workspaceCountryName?: string | null
  /**
   * SIMON-FIX S.11 — le geste d'élargissement de l'onglet Comptes (`states.emptyWiden`), offert aussi quand
   * la recherche de personnes ne rend rien. Absent = aucun bouton (jamais un geste sans effet).
   */
  onWiden?: () => void
  /** #4574 — le nom lu dans le champ libre du rail : ses homonymes se rendent au-dessus de la liste. */
  personName?: PersonNameRequest | null
}

/**
 * #2165.34/.36/.39/.41 + #2166.15-.25 — la liste de PERSONNES, et ses filtres
 * exprimables.
 *
 * La portée est écrite en une phrase — dans le volet de recherche depuis #4634
 * (`ProjectionSearchFields`), avec les champs qu'elle explique : ces personnes
 * viennent de l'espace. Sans elle, un commercial lirait « Découvrir » et
 * conclurait que le produit va chercher des gens dehors — ce qu'il ne fait
 * pas, et ce qu'il ne fera pas sans se faire passer pour quelqu'un d'autre.
 *
 * #2621.1 — par défaut, la liste reste au pays du workspace (mesuré :
 * `contacts.service.ts` porte un `country` Apollo jamais rapproché du marché
 * de l'espace — chercher « DHL » pouvait montrer des contacts hors France).
 * Une bascule EXPLICITE (« Monde entier ») ouvre au monde, connues et
 * inconnues comprises.
 */
export function ContactsResults({
  rows,
  filters,
  searched = false,
  isFetching,
  isError,
  onRetry,
  workspaceCountryName,
  onWiden,
  personName,
}: ContactsResultsProps) {
  const { t } = useTranslation('discover')
  const visible = useMemo(
    () => filterContactRows(rows, filters, workspaceCountryName, { searched }),
    [rows, filters, workspaceCountryName, searched],
  )

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('states.errorTitle')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          {t('states.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* #2727 — le parcours « je tape un nom, je vois les homonymes, je choisis ».
          #4574 — revient sur #2727 : la saisie est celle du rail, il ne reste ici que les homonymes. */}
      <PersonNameResults request={personName ?? null} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('contactsResult.count', { count: visible.length })}
        </span>
      </div>

      {isFetching ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('states.loadingTitle')}
        </p>
      ) : visible.length === 0 && filters.companies.length > 0 ? (
        // #2166.57 — jamais un « 0 » muet sur un filtre de sélection : la
        // ligne NOMME les entreprises cherchées (aucun contact connu POUR
        // ELLES, pas « recherche vide » en général), et propose d'ouvrir
        // chaque fiche pour y lancer une recherche de contacts — le geste
        // payant existant (`ContactsEmptyState`), coût annoncé là-bas.
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('contactsResult.emptyCompanies', { companies: filters.companies.join(', ') })}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {filters.companies.map(company => (
              <Link
                key={company}
                to="/accounts"
                search={{ q: company }}
                className="min-h-11 text-xs font-medium underline underline-offset-2"
                style={{ color: 'var(--accent-soft-text)' }}
              >
                {t('contactsResult.emptyCompaniesAction', { company })}
              </Link>
            ))}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('contactsResult.empty')}
          </p>
          {/* SIMON-FIX S.11 — même geste, même libellé que l'état vide des Comptes. */}
          {onWiden ? (
            <button
              type="button"
              onClick={onWiden}
              className="min-h-11 rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
            >
              {t('states.emptyWiden')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(row => (
            <ContactResultRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PartnersResultsProps {
  projection: DiscoverPartnersProjection
  onQualify: (siren: string) => void
  /**
   * #2151.33 / #2151.34 — le filtre dit ce qu'il a retiré, inconnu ≠ non.
   * L'impact de chaque chip relationnel ACTIF (relation déjà qualifiée /
   * rang 2 / clients observés) — vide si aucun n'est actif. Une ligne dont
   * `removedCount` est à 0 n'est jamais rendue (un chip actif qui n'a rien
   * retiré n'a rien à dire).
   */
  relationChipImpacts?: RelationChipImpact[]
  /**
   * La liste est-elle VIDE parce que ces chips l'ont vidée (jamais parce que
   * la recherche elle-même n'a rien trouvé) ? Décidé à l'écran appelant
   * (`Discover.tsx`, qui seul connaît le pool AVANT ces chips) — remplace
   * `partners.empty` par le détail de `relationChipImpacts` ci-dessus.
   */
  emptiedByRelationChips?: boolean
  /** Désactive le chip nommé depuis le résultat — l'écran qui affirme le
   *  retrait doit aussi pouvoir le défaire, sans repasser par le rail. */
  onDisableRelationChip?: (key: RelationChipKey) => void
}

export function PartnersResults({
  projection,
  onQualify,
  relationChipImpacts = [],
  emptiedByRelationChips = false,
  onDisableRelationChip,
}: PartnersResultsProps) {
  const { t } = useTranslation('discover')
  // #2151.33 / #2151.34 — un chip actif qui n'a RIEN retiré n'a rien à dire :
  // seules les lignes dont `removedCount > 0` sont montrées.
  const activeChipImpacts = relationChipImpacts.filter(impact => impact.removedCount > 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('resultType.count', { count: projection.rows.length })}
        </span>
        {/* #2165.17 (18/09/2026) — le preset « où positionner un consultant »
            ne se CONSTRUIT pas ici (pas d'écran, pas de sélecteur de
            consultant dans Découvrir) : un LIEN vers la capacité qui existe
            déjà, ouverte depuis le vivier (`/consultants/$id/reverse-market`,
            même destination que le raccourci de Laura). */}
        <Link
          to="/consultants"
          className="min-h-11 text-xs font-medium underline underline-offset-2"
          style={{ color: 'var(--accent-soft-text)' }}
        >
          {t('partners.positionConsultant')}
        </Link>
      </div>

      {/* #2151.33 / #2151.34 — le filtre dit ce qu'il a retiré, inconnu ≠
          non. DÉCISION Louis 18/09 (registre #2151.34) : « une valeur non
          mesurée n'est jamais comptée « non » : elle reste « inconnu », et
          le filtre le dit. » Défaut mesuré en prod le 18/09 : ce bloc était
          absent, et `partners.empty` affirmait « aucune ESN » quand
          c'étaient en réalité CES chips qui les avaient retirées. */}
      {activeChipImpacts.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeChipImpacts.map(impact => (
            <div
              key={impact.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-xs"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-raised, rgba(148,163,184,0.06))' }}
            >
              <span>
                {t('partners.chipRemoved', { count: impact.removedCount, chip: t(`rail.${impact.key}Chip`) })}
                {impact.unknownCount > 0 &&
                  ' ' +
                    t('partners.chipRemovedUnknown', {
                      count: impact.unknownCount,
                      total: impact.removedCount,
                    })}
              </span>
              {onDisableRelationChip && (
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-medium underline underline-offset-2"
                  style={{ color: 'var(--accent-soft-text)' }}
                  onClick={() => onDisableRelationChip(impact.key)}
                >
                  {t('partners.removeChipFilter')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ni rangées ici, ni déclarées « pas des ESN » : aucun verdict rendu. */}
      {projection.unresolvedNaf > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('partners.unresolvedNaf', { count: projection.unresolvedNaf })}
        </p>
      )}

      {projection.rows.length === 0 ? (
        // #2151.33 / #2151.34 — `partners.empty` ne s'affiche plus que
        // lorsque la recherche elle-même n'a trouvé aucune ESN : quand ce
        // sont les chips qui ont vidé la liste, le détail ci-dessus a déjà
        // tout dit, jamais en plus d'un mensonge générique.
        !emptiedByRelationChips && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('partners.empty')}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {projection.rows.map(row => (
            <PartnerResultRow key={row.siren} row={row} onQualify={() => onQualify(row.siren)} />
          ))}
        </div>
      )}
    </div>
  )
}
