import { orgHasHierarchyEdges, type OrgGraph } from '@bellum/contracts'
import { Button, Card, HORIZONTAL_OVERSCROLL_CLASS, Text, cn } from '@bellum/ui'
import { ChevronRight, Network, PencilLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCount } from '@/lib/locale'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { OrgCorrectionDrawer } from './corrections/OrgCorrectionDrawer'
import { OrgCoverageBanner } from './OrgCoverageBanner'
import { OrgLinkMarker } from './OrgLinkMarker'
import { OrgNodeTypeBadge } from './OrgNodeTypeBadge'
import { buildOrgGroupView, type OrgGroupNode, type OrgGroupView as OrgGroupViewData } from './focalOrgData'
import { orgMarketMemoryLine } from './orgMarketMemoryLine'

/**
 * LA VUE GROUPE — « comment ce groupe est-il fait ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT REFUSÉ, ET CE QUI NE L'EST PLUS
 * ─────────────────────────────────────────────────────────────────────────
 * Cette maquette (alternative 01 du 27/08) proposait la vue Groupe **comme
 * écran d'arrivée**. Elle a été refusée deux fois : décision 3 du FINAL du
 * 27/08 (« vue Groupe comme home quotidienne : trop large pour préparer une
 * action ») puis `agent_docs/orggraph-contradictions-2026-08-30.md` §5, qui la
 * range parmi « les trois alternatives GPT écartées ».
 *
 * **Louis a levé ce refus le 31/08/2026** — dans une forme qui garde la raison
 * d'origine intacte : la vue Groupe devient une VUE COMMUTABLE, la focale reste
 * l'écran d'arrivée. « Trop large pour préparer une action » reste vrai ; ce
 * n'est simplement plus une raison de ne pas pouvoir la regarder.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX CHOSES QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * · **Il ne recompte rien.** L'arbre, les périmètres, la couverture et les deux
 *   parts du panneau qualité viennent tous de `buildOrgGroupView`, qui lit
 *   lui-même `deriveOrgCoverage` et `listFocalDirections`.
 * · **Il n'affiche pas de pourcentage inventé.** La maquette écrit « 90 %
 *   rattachés » ; le contrat REFUSE de produire le rattachement (trou nommé).
 *   La ligne dit donc « non mesuré » et pourquoi, jamais « 0 % ».
 *
 * ⚠️ **Le trait entre deux entités est une STRUCTURE, pas une preuve.** Il est
 * plein, mais son libellé ne dit pas « quelqu'un l'a observé » : la forme du
 * groupe et le rattachement d'une personne sont deux affirmations différentes,
 * et les dessiner pareil rendrait le trait plein ambigu partout ailleurs.
 */
export function GroupOrgView({
  graph,
  discovered,
  onOpenEntity,
  accountId,
}: {
  graph: OrgGraph
  /** Contacts découverts sur le DOSSIER. `undefined` = on ne sait pas ; jamais 0. */
  discovered?: number
  /** Ouvrir une entité, c'est passer à la vue Hiérarchie sur ce périmètre. */
  onOpenEntity: (entityId: string) => void
  /**
   * #2310.54 — absent = le geste « Corriger » ne se rend pas : « on n'affiche
   * pas ce qu'on ne peut pas brancher ». En usage réel `TabOrganigramme` le
   * fournit toujours ; les tests qui ne testent QUE la navigation l'omettent.
   */
  accountId?: string
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tAccounts } = useTranslation('accounts')
  const view = useMemo(() => buildOrgGroupView(graph, { discovered }), [graph, discovered])
  /** L'entité dont le tiroir de correction est ouvert — une seule à la fois. */
  const [editing, setEditing] = useState<{ entityId: string; entityName: string } | null>(null)
  // #2837 — même dérivation que la carte système (`OrgInfluenceMap`, GA-26) :
  // la ligne ne se pose QUE sur une entité de `depth === 0` (voir `EntityRow`
  // ci-dessous), jamais sur une filiale — `market_company_signal` est un
  // agrégat par ENTREPRISE, sans ventilation par entité (GA-391).
  const {
    data: marketContext,
    isPending: marketContextPending,
    isError: marketContextError,
  } = useAccountMarketContext(accountId, Boolean(accountId))
  const marketMemoryLine = orgMarketMemoryLine(tAccounts, {
    accountId,
    isPending: marketContextPending,
    isError: marketContextError,
    data: marketContext,
  })

  if (!view) return <NamedAbsence what={t('absence.view')} reason={t('absence.viewReason')} testId="org-view-absence" />

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Text element="h3" size="base" weight="semibold">
              {t('group.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('group.subtitle')}
            </Text>
          </div>
          <OrgCoverageBanner coverage={view.coverage} />
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Card className="min-w-0 p-4">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
            <Text element="h3" size="base" weight="semibold">
              {t('group.structureTitle')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('group.structureSubtitle')}
          </Text>

          {/* L'arbre défile dans SON conteneur — jamais le corps de la page, et
              jamais deux conteneurs défilants imbriqués.
              #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
          <div className={cn('mt-3 min-w-0 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
            <ul className="min-w-[20rem] space-y-2">
              {view.nodes.map(node => (
                <EntityRow
                  key={node.id}
                  node={node}
                  onOpen={onOpenEntity}
                  // #2310.54 — une entité se corrige comme une personne. Sans
                  // `accountId`, aucune écriture n'est possible : pas de bouton mort.
                  onCorrect={accountId ? (entityId, entityName) => setEditing({ entityId, entityName }) : undefined}
                  // #2837 — jamais sur une filiale (`depth > 0`), voir plus haut.
                  marketMemory={node.depth === 0 ? marketMemoryLine : null}
                />
              ))}
            </ul>
          </div>

          {/* Une personne que le graphe ne rattache à aucune entité n'est pas
              dans l'arbre — mais elle EXISTE. Un total muet ferait croire que
              l'arbre porte tout le monde. `0` y est vrai : toutes le sont. */}
          <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
            {t('group.unattached', { count: view.unattachedPeople })}
          </Text>
        </Card>

        <QualityPanel view={view} />
      </div>

      {/* LA porte d'écriture — la même que pour une personne (`OrgEditView`,
          `FocalOrgView`), avec `objectType="entity"` au lieu de `"person"`. */}
      {editing && accountId ? (
        <OrgCorrectionDrawer
          key={editing.entityId}
          accountId={accountId}
          graph={graph}
          objectType="entity"
          objectId={editing.entityId}
          objectName={editing.entityName}
          open
          withTrigger={false}
          onOpenChange={next => {
            if (!next) setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Une entité du groupe, CLIQUABLE — « cliquez sur une entité pour ouvrir sa
 * hiérarchie complète », dit la maquette.
 *
 * ⚠️ C'est un `<button type="button">`, pas un `<div onClick>` : ce qui se
 * clique se tabule (GA-35), répond à Entrée et s'annonce. Et il porte
 * `min-h-11` en pointeur grossier — 44 px, la cible tactile minimale.
 *
 * #2310.54 — le geste « Corriger » vit à CÔTÉ, pas DANS ce bouton : un bouton
 * ne peut pas en contenir un second (HTML), et « ouvrir la hiérarchie » et
 * « corriger cette entité » restent deux gestes distincts, comme sur une
 * carte de personne (`FocalOrgView`) où « corriger » n'est jamais confondu
 * avec le clic qui ouvrirait sa fiche.
 */
function EntityRow({
  node,
  onOpen,
  onCorrect,
  marketMemory,
}: {
  node: OrgGroupNode
  onOpen: (entityId: string) => void
  /** Absent = pas de geste d'écriture disponible ici — pas de bouton mort. */
  onCorrect?: (entityId: string, entityName: string) => void
  /** #2837 — `null`/absent sur toute entité `depth > 0` : l'appelant ne la
   *  fournit qu'à la racine (voir `GroupOrgView`, GA-391). */
  marketMemory?: string | null
}) {
  const { t } = useTranslation('accountOrg')
  return (
    <li style={{ marginInlineStart: `${node.depth * 1.5}rem` }}>
      <div className="flex w-full min-w-0 items-stretch gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 hover:border-[var(--bellum-text-accent)]">
        <button
          type="button"
          onClick={() => onOpen(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left pointer-coarse:min-h-11"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* #2284.6 — un badge : le kind s'il affine le type, sinon le type. */}
              <OrgNodeTypeBadge
                type={node.type}
                kind={node.kind}
                typeKey="entityType"
                variant="outline"
                unconfirmed={node.unconfirmed}
              />
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {node.name}
              </Text>
            </div>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {/* Recette 12/10/2026 — aucune personne placée sous cette entité : « 0 dans le périmètre · 0 rattachés »
                  se lit « cette entité est vide », or le graphe dit seulement qu'il n'y place personne (GA-18/19). */}
              {node.peopleCount === 0
                ? t('group.entityCountsNone')
                : t('group.entityCounts', {
                    scope: formatCount(node.peopleCount),
                    direct: formatCount(node.directPeopleCount),
                  })}
            </Text>
            {/* Le trait vers le parent, NOMMÉ : « appartenance au groupe ». Une
                racine n'en a pas, et elle n'en affiche donc aucun. */}
            {node.linkOrigin ? <OrgLinkMarker origin={node.linkOrigin} className="mt-1" /> : null}
            {/* #2837 — même ligne que la carte système, RACINE seulement. */}
            {marketMemory ? (
              <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                {marketMemory}
              </Text>
            ) : null}
          </div>
          <ChevronRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        </button>
        {onCorrect ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="shrink-0 gap-1.5 self-center pointer-coarse:min-h-11"
            aria-label={t('group.correctEntityAria', { name: node.name })}
            onClick={() => onCorrect(node.id, node.name)}
          >
            <PencilLine className="size-3" aria-hidden />
            {t('group.correctEntity')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * « COUVERTURE & QUALITÉ » — le panneau droit de la maquette.
 *
 * Chaque ligne sait être INCONNUE, et la première l'est presque toujours : le
 * rattachement à une entité est un trou NOMMÉ du contrat. Écrire « 0 % »
 * affirmerait que personne n'est rattaché — une tout autre phrase que « on ne
 * mesure pas encore ça ».
 */
function QualityPanel({ view }: { view: OrgGroupViewData }) {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4" role="group" aria-label={t('group.qualityTitle')}>
      <Text element="h3" size="base" weight="semibold">
        {t('group.qualityTitle')}
      </Text>
      <dl className="mt-3 space-y-2">
        <QualityRow
          label={t('group.quality.attached')}
          share={view.quality.attachedShare}
          unknownReason={t('focal.attachedUnknown')}
        />
        <QualityRow
          label={t('group.quality.leveled')}
          share={view.quality.leveledShare}
          unknownReason={t('group.quality.leveledUnknown')}
        />
        {/* Louis 13/10/2026 — même règle que le bandeau (orgHasHierarchyEdges, contrat) : sans arête,
            « 0 liens vérifiés / 0 zones à couvrir » se taisent. */}
        {orgHasHierarchyEdges(view.coverage) ? (
          <>
            {/* #1 (recette 13/10) — zéro vérifié se dit, il ne se chiffre pas. */}
            {view.coverage.hierarchyVerified === 0 ? (
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('focal.coverage.noneVerified')}
              </Text>
            ) : (
              <QualityRow label={t('focal.coverage.verifiedLinks')} count={view.coverage.hierarchyVerified} />
            )}
            <QualityRow label={t('focal.coverage.uncoveredZones')} count={view.coverage.uncoveredZones} />
          </>
        ) : null}
      </dl>
      {orgHasHierarchyEdges(view.coverage) ? null : (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('focal.coverage.noHierarchy')}
        </Text>
      )}
      {/* Le plancher de gris, quand il est MESURÉ et dépassé. `null` ne conclut
          rien : une mesure impossible ne dit jamais « tout va bien ». */}
      {view.colouring && view.colouring.meetsFloor === false && view.colouring.share !== null ? (
        <Text role="note" size="xs" className="mt-3 text-[var(--warning-soft-text)]">
          {t('focal.overColoured', {
            coloured: Math.round((1 - view.colouring.share) * 100),
            maxColoured: Math.round((1 - view.colouring.floor) * 100),
            count: view.colouring.unenriched,
          })}
        </Text>
      ) : null}
    </Card>
  )
}

/** Une ligne du panneau : soit une PART, soit un DÉNOMBREMENT. Jamais les deux,
 *  et jamais un « 0 » posé sur une absence. */
function QualityRow({
  label,
  share,
  count,
  unknownReason,
}: {
  label: string
  share?: number | null
  count?: number | null
  unknownReason?: string
}) {
  const { i18n } = useTranslation('accountOrg')
  const measured = share !== undefined ? share !== null : count !== null && count !== undefined
  return (
    // #2499 — DÉFAUT recette 17/09 (passage 7) : `dd` portait `shrink-0` sans
    // que la ligne accepte de passer à la ligne — une raison longue
    // (`UnknownValue`) écrasait `dt` (288 px de large, illisible). `flex-wrap`
    // ici et `min-w-0` sur `dd` (jamais `shrink-0`, qui fige la largeur de
    // contenu) : le même couple que `DossierReadBlocks.tsx`, pour qu'un texte
    // long passe à la ligne plutôt que de déborder.
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--bellum-border)] pb-1.5">
      <dt className="min-w-0">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0">
        {measured ? (
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {share !== undefined && share !== null
              ? new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(share)
              : formatCount(count as number)}
          </Text>
        ) : (
          <UnknownValue reason={unknownReason} />
        )}
      </dd>
    </div>
  )
}
