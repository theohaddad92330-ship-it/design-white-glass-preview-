import {
  ACCOUNT_STRATEGY_5P_DIMENSIONS,
  isElementKnown,
  summarizeAccountStrategy5P,
  type AccountStrategy5P,
  type AccountStrategy5PDimension,
  type AccountStrategy5PElementStatus,
} from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { Compass, DoorOpen, ShieldCheck, TriangleAlert, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StrategyCitedEsns } from './StrategyCitedEsns'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { openProgramsDetail } from '../veille/SignalPrograms'

const DIMENSION_ICON: Record<AccountStrategy5PDimension, LucideIcon> = {
  perimeter: Compass,
  problem: TriangleAlert,
  people: Users,
  proof: ShieldCheck,
  passage: DoorOpen,
}

/**
 * BEL-SC-232 (#3261, P0) — « Compléter ce P », par dimension : l'onglet où le
 * geste se fait réellement. `problem` n'a pas d'onglet dédié — elle se
 * complète en Synthèse même (signaux, hypothèses) — et ne reçoit donc pas de
 * bouton. `passage` reçoit un LIBELLÉ différent plus bas (« Trouver une autre
 * route », mot pour mot le CTA du ticket) : les deux pointent le même onglet
 * Accès (`TAB_KEYS`, « par où on entre »), la question posée diffère.
 */
/**
 * #3715 — LES PORTES VERS LES VUES PROPRIÉTAIRES, par dimension. Les cinq cartes annexes qui
 * reprojetaient les mêmes personnes sont retirées ; leur seul apport légitime est ce lien, vers la
 * bonne vue et le bon périmètre. Libellés = ce que la vue montre (jamais une « Carte d'influence »
 * qui ouvrirait autre chose). Aucune ne porte un nom de personne : la liste reste dans sa vue.
 */
const DIMENSION_DOORS: Partial<Record<AccountStrategy5PDimension, readonly { tab: TabId; label: string }[]>> = {
  perimeter: [{ tab: 'sites', label: 'perimeter' }],
  people: [
    { tab: 'organigramme', label: 'orgInfluence' },
    { tab: 'committee', label: 'committee' },
  ],
  passage: [{ tab: 'partners', label: 'partners' }],
}

const DIMENSION_TAB: Partial<Record<AccountStrategy5PDimension, TabId>> = {
  perimeter: 'organigramme',
  people: 'contacts',
  proof: 'proofs',
  passage: 'access',
}

/**
 * BEL-SC-225 (#3254, P0) — LA CARTE DE LA PROJECTION 5P.
 *
 * Rend `AccountStrategy5P` tel qu'il arrive de la façade unique
 * (`useAccountStrategy5P`) : cinq dimensions, un décompte connu/total par
 * dimension (jamais un pourcentage — doctrine c26), et la dimension que la
 * readiness désigne comme prochaine action.
 *
 * ⚠️ `null` = la façade n'a pas répondu ; l'écran se TAIT (`return null`),
 * il n'affiche jamais « rien de connu » sur une lecture indisponible — même
 * discipline que `AccountCanonicalContextCard`.
 *
 * BEL-SC-232 (#3261, P0) rajoute, par dimension, un manque critique nommé et
 * un CTA Laura contextuel (« Compléter ce P » / « Trouver une autre route »),
 * et au niveau de la carte « Challenger la stratégie » (readiness bloquée)
 * ou « Préparer le premier mouvement » (les cinq P sont solides).
 */
/**
 * BEL-SC-232 (#3261, P0) — « manque critique », UNIQUEMENT à partir de
 * signaux DÉJÀ calculés par `deriveAccountStrategy5P` (jamais un second
 * calcul, GA-26) : `missing_proof` (P4) et `no_path` (P5) sont des booléens
 * canoniques, `missing_roles` (P3) une liste de rôles déjà résolue. Sur
 * `perimeter`/`problem`, qui n'ont pas de résumé booléen dédié, le manque se
 * dit sur le ratio connu/total déjà affiché juste au-dessus — jamais un champ
 * nommé au hasard parmi les siens.
 */
function criticalGapLabel(
  strategy: AccountStrategy5P,
  dimension: AccountStrategy5PDimension,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (dimension === 'proof' && strategy.proof.missing_proof.value === true) {
    return t('strategy5P.gap.missingProof')
  }
  // #3715 — « Aucune voie d'accès identifiée » se dit dans Passage même (la carte Écosystème est absorbée).
  if (dimension === 'people') {
    const missingRoles = strategy.people.missing_roles
    // LOIC-FIX2 RÔLES — un rôle manquant se NOMME (jamais « 1 rôle non identifié »). Un bloqueur non
    // identifié n'est pas un siège à pourvoir (ne pas en connaître n'est pas un manque) : il n'est pas affiché.
    const seats =
      missingRoles.status === 'not_applicable' ? [] : (missingRoles.value ?? []).filter(role => role !== 'blocker')
    if (seats.length > 0) {
      const roles = t('strategy5P.gap.missingRoles', {
        count: seats.length,
        roles: seats.map(role => t(`contacts:roles.${role}`)).join(', '),
      })
      // #4324.1 — un siège technique (DSI / RSSI) vide dit POURQUOI : collecte ou niveau, jamais un vide muet.
      const gap = strategy.people.technical_gap
      if (!gap || !seats.includes('technical')) return roles
      return `${roles} ${
        gap.reason === 'no_it_contact'
          ? t('strategy5P.gap.technicalNoIt')
          : t('strategy5P.gap.technicalBelowDirector', { count: gap.itContacts })
      }`
    }
  }
  return null
}

/**
 * #3675 — LES CINQ P SONT CINQ QUESTIONS DE TERRAIN, pas cinq colonnes de compteurs.
 *
 * Pour chaque dimension : la question, UNE réponse courte (ce que le dossier sait, dans l'ordre
 * d'utilité) et le détail dépliable. Plus de « N éléments connus sur M », plus de « Compléter ce P » :
 * une lacune déterminante devient UNE action précise (le libellé du plan, `strategy5P.planAction`),
 * jamais une case vide à remplir. Mêmes éléments, même règle de « connu » que le résumé
 * (`isElementKnown`, GA-26) — aucun second calcul.
 */
const ANSWER_FIELDS: Record<AccountStrategy5PDimension, readonly string[]> = {
  perimeter: ['selected_scope', 'program', 'project', 'direction', 'business_unit', 'subsidiary', 'site', 'team'],
  problem: ['operational_problem', 'trigger', 'business_impact', 'hypothesis'],
  people: ['economic_deciders', 'sponsors', 'champions', 'users'],
  // `relevant_consultant` (les NOMS) reste sous Passage : un nom ne s'affiche qu'une fois par carte (#3277).
  proof: ['mission_rex', 'client_case', 'comparable_reference', 'relationship_proof'],
  passage: ['existing_client', 'current_consultant', 'former_consultant', 'partner'],
}

const DETAIL_FIELDS: Record<AccountStrategy5PDimension, readonly string[]> = {
  perimeter: [
    'group',
    'parent_company',
    'subsidiary',
    'business_unit',
    'direction',
    'site',
    'team',
    'program',
    'project',
    'selected_scope',
    'excluded_scopes',
    'budget_scope',
  ],
  problem: [
    'trigger',
    'operational_problem',
    'business_impact',
    'urgency',
    'current_status',
    'evidence',
    'hypothesis',
    'expiry',
  ],
  people: [
    'users',
    'operational_relays',
    'champions',
    'technical_references',
    'sponsors',
    'economic_deciders',
    'procurement',
    'blockers',
    'hr',
    'known_relationships',
  ],
  proof: [
    'comparable_reference',
    'mission_rex',
    'client_case',
    'artifact',
    'benchmark',
    'sector_knowledge',
    'relationship_proof',
  ],
  passage: [
    'current_consultant',
    'former_consultant',
    'former_colleague',
    'common_relationship',
    'existing_client',
    'partner',
    'rank_2',
    'referenced_esn',
    'former_manager',
    'alumni',
    'event',
    'direct_recommendation',
  ],
}

type KnownField = { key: string; text: string }

/** Le texte d'une valeur d'élément : une chaîne, une liste de chaînes ou de personnes (leurs NOMS, en clair). */
function elementText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (Array.isArray(value)) {
    const parts = value
      .map(item => (typeof item === 'string' ? item.trim() : typeof item?.name === 'string' ? item.name.trim() : ''))
      .filter(part => part !== '')
    return parts.length > 0 ? parts.join(', ') : null
  }
  return null
}

/** Les champs CONNUS d'une dimension, dans l'ordre demandé — un champ absent ne fait aucune ligne. */
function knownFields(strategy: AccountStrategy5P, dimension: AccountStrategy5PDimension, keys: readonly string[]) {
  const source = strategy[dimension] as unknown as Record<
    string,
    { value: unknown; status: AccountStrategy5PElementStatus }
  >
  const out: KnownField[] = []
  for (const key of keys) {
    const element = source[key]
    if (!element || !isElementKnown(element.status)) continue
    const text = elementText(element.value)
    if (text) out.push({ key, text })
  }
  return out
}

export function AccountStrategy5PCard({
  strategy,
  onOpenTab,
  onAddToPlan,
  onOpenPartner,
}: {
  strategy: AccountStrategy5P | null
  /** La porte vers la vue où le geste se fait réellement. Optionnelle : un appelant qui ne navigue pas
   *  n'affiche simplement pas le bouton. */
  onOpenTab?: (tab: TabId) => void
  /** #3277.3 — écrit au plan l'action qui comble la dimension désignée. Absente, le bouton n'existe pas. */
  onAddToPlan?: (dimension: AccountStrategy5PDimension) => void
  /** #3684.2 — ouvre la ligne Partenaires d'une ESN citée. Absente, le bouton n'existe pas. */
  onOpenPartner?: (partnerId: string | null) => void
}) {
  const { t } = useTranslation('accountDetail')
  if (!strategy) return null

  const summaries = summarizeAccountStrategy5P(strategy)
  // Un nom (ou un texte) ne s'affiche qu'une fois par carte — réponse OU détail, jamais les deux.
  const shown = new Set<string>()

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <Text element="h3" size="sm" weight="semibold">
            {t('strategy5P.title')}
          </Text>
          <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-accent)]">
            {t(`strategy5P.readiness.${strategy.readiness}`)}
          </Text>
        </div>
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('strategy5P.subtitle')}
        </Text>
      </div>

      {ACCOUNT_STRATEGY_5P_DIMENSIONS.map(dimension => {
        const Icon = DIMENSION_ICON[dimension]
        const summary = summaries[dimension]
        const gap = criticalGapLabel(strategy, dimension, t)
        const answerKeys = ANSWER_FIELDS[dimension]
        const answers = knownFields(strategy, dimension, answerKeys)
          .filter(field => !shown.has(field.text))
          .slice(0, 2)
        answers.forEach(field => shown.add(field.text))
        const details = knownFields(strategy, dimension, DETAIL_FIELDS[dimension]).filter(
          field => !shown.has(field.text),
        )
        details.forEach(field => shown.add(field.text))
        const tab = DIMENSION_TAB[dimension]
        const noPath = dimension === 'passage' && strategy.passage.no_path.value === true
        // L'action précise de la dimension désignée : le libellé du plan (« Cadrer le périmètre visé… »),
        // « Trouver une autre route » quand aucune voie n'est connue.
        const action = summary.isNextAction
          ? noPath
            ? t('strategy5P.cta.findAnotherRoute')
            : t(`strategy5P.planAction.${dimension}.label`)
          : null
        const showOpen = onOpenTab && tab && summary.isNextAction

        return (
          <div key={dimension} className="border-t border-[var(--bellum-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
              <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                {t(`strategy5P.dimensions.${dimension}`)}
              </Text>
              <Text size="xs" className="min-w-0 truncate text-[var(--bellum-text-muted)]">
                {t(`strategy5P.questions.${dimension}`)}
              </Text>
            </div>
            {answers.length > 0 ? (
              <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-primary)]">
                {answers.map(field => field.text).join(' · ')}
              </Text>
            ) : dimension === 'passage' && (strategy.passage.cited_esns?.length ?? 0) > 0 ? null : (
              // #3684 — des ESN citées portent déjà leur réserve (dite une fois pour le bloc) : pas de « À vérifier. » en tête.
              <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
                {t('strategy5P.toVerify')}
              </Text>
            )}
            {dimension === 'passage' ? (
              <StrategyCitedEsns passage={strategy.passage} onOpenPartner={onOpenPartner} />
            ) : null}
            {noPath && answers.length === 0 ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {t('strategy5P.gap.noPath')}
              </Text>
            ) : null}
            {gap ? (
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                {gap}
              </Text>
            ) : null}
            {details.length > 0 ? (
              <details className="mt-1">
                <summary className="min-h-11 cursor-pointer py-2 text-xs text-[var(--bellum-text-secondary)]">
                  {t('strategy5P.detail')}
                </summary>
                <dl className="space-y-1 pb-1">
                  {details.map(field => (
                    <div key={field.key} className="flex min-w-0 flex-wrap gap-x-2">
                      <dt className="text-xs text-[var(--bellum-text-muted)]">
                        {t(`strategy5P.fields.${dimension}.${field.key}`)}
                      </dt>
                      <dd className="min-w-0 break-words text-xs text-[var(--bellum-text-secondary)]">{field.text}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            {/* #3677.6 — le programme cité renvoie à son détail UNIQUE (« Signaux et besoins »), il ne le recopie pas. */}
            {dimension === 'perimeter' && onOpenTab && knownFields(strategy, 'perimeter', ['program']).length > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="mt-1 pointer-coarse:min-h-11"
                onClick={() => openProgramsDetail(onOpenTab)}
              >
                {t('strategy5P.programDetail')}
              </Button>
            ) : null}
            {onOpenTab && DIMENSION_DOORS[dimension] ? (
              <div className="mt-1 flex flex-wrap gap-x-3">
                {DIMENSION_DOORS[dimension]?.map(door => (
                  <Button
                    key={door.tab}
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="min-h-11 px-0 text-[var(--bellum-text-secondary)]"
                    onClick={() => onOpenTab(door.tab)}
                  >
                    {t(`strategy5P.doors.${door.label}`)}
                  </Button>
                ))}
              </div>
            ) : null}
            {action ? (
              <div className="mt-2 flex flex-col items-start gap-2">
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t('strategy5P.nextAction', { action })}
                </Text>
                <div className="flex flex-wrap gap-2">
                  {showOpen ? (
                    <Button type="button" size="xs" variant="outline" onClick={() => onOpenTab(tab)}>
                      {t(`strategy5P.open.${dimension}`)}
                    </Button>
                  ) : null}
                  {/* #3277.3 — l'action de plan ne porte que sur LA dimension désignée. */}
                  {onAddToPlan ? (
                    <Button type="button" size="xs" variant="outline" onClick={() => onAddToPlan(dimension)}>
                      {t('strategy5P.cta.addToPlan')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}

      {strategy.next_action_dimension === null ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="sm" className="block text-[var(--bellum-text-secondary)]">
            {t('strategy5P.allSolid')}
          </Text>
          {/* #3261 — « Préparer le premier mouvement » : les cinq P sont
              solides, la seule action utile est d'agir. */}
          {onOpenTab ? (
            <Button type="button" size="xs" variant="black" className="mt-2" onClick={() => onOpenTab('plan')}>
              {t('strategy5P.cta.prepareFirstMove')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* #3261 — « Challenger la stratégie » : le lot bloque ou refuse la
          séquence, la vue d'ensemble à rouvrir est le plan lui-même — pas
          une sixième dimension inventée. */}
      {(strategy.readiness === 'BLOCKED' || strategy.readiness === 'NO_GO') && onOpenTab ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Button type="button" size="xs" variant="outline" onClick={() => onOpenTab('plan')}>
            {t('strategy5P.cta.challengeStrategy')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
