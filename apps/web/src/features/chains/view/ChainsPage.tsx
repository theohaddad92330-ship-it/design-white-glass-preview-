import type { Chain, ChainKey } from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, SearchEmptyState, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFirstName } from '@/hooks/useFirstName'
import { useChainBoard, useChainPosition, useChainUndetermined, type ChainLane } from '../api'
import { boardTotals, countOf, needsAttention, slowestStep, undeterminedOf } from '../model/lane-health'
import { ChainEvidence } from './ChainEvidence'
import { ChainFlow } from './ChainFlow'

/**
 * LES PARCOURS — où les dossiers se bloquent (#1502, #1504, #1507, #1503).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN A CESSÉ D'ÊTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un écran qu'il fallait REMPLIR à la main. « Démarrer un parcours » était
 * l'entrée standard, donc l'écran affichait « Dossiers suivis 0 » et « 0 dossier
 * en cours » sur les sept pistes — personne ne cliquait, et le moteur, juste et
 * testé, n'avait aucun appelant.
 *
 * Les positions se DÉRIVENT maintenant des objets métier (#1503). Il n'y a plus
 * rien à démarrer ni à avancer : les boutons ont disparu parce que le geste
 * qu'ils portaient n'existe plus, pas parce qu'on les a cachés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION DE LA PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Où mes dossiers se bloquent-ils, et qu'est-ce que je dois débloquer
 * maintenant ? » — donc les parcours AVEC BLOCAGE d'abord, les autres derrière
 * un filtre.
 *
 * ⚠️ Le compteur et le filtre partagent UN prédicat (`needsAttention`). Deux
 * chemins qui décideraient chacun de leur côté afficheraient « 6 bloqués »
 * au-dessus de quatre cartes, sans qu'aucun test ne tombe.
 *
 * ⚠️ Ce que l'écran ne sait pas placer, il le DIT (#1507 §6) : « à déterminer »
 * avec sa raison, et le dossier reste atteignable. Le ranger à l'étape 1
 * remplirait la première colonne de dossiers dont personne ne sait rien.
 */
/** #4163.2 (Louis 15/10/2026) — Parcours est une SECTION de Pilotage › Pipe (`#parcours`), plus une page : le titre de l'écran est celui de Pipe. */
export function ChainsPage() {
  const { t, i18n } = useTranslation('chains')
  const firstName = useFirstName()
  const { data, isLoading, isError } = useChainBoard()
  const [selected, setSelected] = useState<{ chain: ChainKey; position: number | 'undetermined' } | null>(null)
  /**
   * `null` = personne n'a encore choisi, et le défaut se DÉRIVE de ce qu'il y a
   * à voir.
   *
   * Le retour demande « par défaut, un manager doit voir les blocages ». Pris au
   * pied de la lettre, un espace sans blocage s'ouvrirait sur un écran vide, ce
   * qui sert exactement l'inverse. Quand rien ne bloque, on montre tout ; les
   * deux pastilles portent leur compte réel, donc rien n'est caché.
   */
  const [scope, setScope] = useState<'blocked' | 'all' | null>(null)
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'

  const lanes = useMemo(() => data?.lanes ?? [], [data])
  const totals = useMemo(() => boardTotals(lanes), [lanes])
  const slowest = useMemo(() => slowestStep(lanes), [lanes])
  // MÊME prédicat que le compteur ci-dessus : le filtre garde ce que
  // `needsAttention` rend, et rien d'autre.
  const attention = useMemo(() => lanes.filter(needsAttention), [lanes])
  const effectiveScope = scope ?? (attention.length > 0 ? 'blocked' : 'all')
  const visible = effectiveScope === 'blocked' ? attention : lanes

  return (
    <section id="parcours" aria-label={t('page.title')}>
      <Box className="flex w-full flex-col gap-4 py-4">
        <Box className="flex flex-col gap-1">
          {/* #2456 — `element="h1"` : le titre de l'écran était DÉJÀ là, visible,
              mais rendu en `<p>`. L'entête de page se tait quand la barre d'onglets
              nomme déjà l'endroit (loi 4 du tome 7), si bien que le document n'avait
              aucun titre de niveau 1. Seule la balise change : rien ne bouge à l'œil. */}
          <Text element="h2" size="lg" weight="semibold">
            {firstName ? t('page.heading', { name: firstName }) : t('page.headingNoName')}
          </Text>
          <Text size="sm" color="text-muted-foreground">
            {t('page.subtitle')}
          </Text>
        </Box>

        {isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          // Un échec de lecture ne se rend jamais comme « aucun parcours ».
          <SearchEmptyState title={t('states.errorTitle')} description={t('states.errorDescription')} />
        ) : (
          <>
            <BoardKpis totals={totals} slowest={slowest} locale={locale} />

            <FilterChips
              ariaLabel={t('scope.aria')}
              options={[
                { value: 'blocked', label: t('scope.blocked', { count: attention.length }) },
                { value: 'all', label: t('scope.all', { count: lanes.length }) },
              ]}
              value={effectiveScope}
              onChange={next => next && setScope(next)}
            />

            {visible.length === 0 ? (
              // « Rien à débloquer » est une BONNE nouvelle, et elle ne doit pas
              // ressembler à « rien n'est suivi » : les deux phrases diffèrent.
              totals.tracked === 0 ? (
                // #2958.104 — « aucun dossier suivi » demandait de créer un
                // besoin, une affaire ou une mission sans dire où : la phrase
                // porte maintenant sa porte, le pipe des affaires.
                <Box className="flex flex-col items-start gap-2">
                  <Text size="sm" color="text-muted-foreground">
                    {t('states.nothingTracked')}
                  </Text>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/projects">{t('states.nothingTrackedCta')}</Link>
                  </Button>
                </Box>
              ) : (
                <Text size="sm" color="text-muted-foreground">
                  {t('states.nothingBlocked')}
                </Text>
              )
            ) : (
              <Box className="flex flex-col gap-4">
                {visible.map(lane => (
                  <Box key={lane.chain.key} className="flex flex-col gap-2">
                    <ChainRow
                      lane={lane}
                      locale={locale}
                      onSelect={position =>
                        setSelected(current =>
                          current?.chain === lane.chain.key && current.position === position
                            ? null
                            : { chain: lane.chain.key, position },
                        )
                      }
                    />
                    {/* Le panneau s'ouvre SOUS sa piste, jamais en bas de page.
                        Trouvé en recette : cliquer sur une étape de la première
                        chaîne ouvrait un panneau à sept pistes plus bas, hors
                        écran — l'utilisateur clique et rien ne semble se passer. */}
                    {selected?.chain === lane.chain.key ? (
                      <PositionPanel
                        chain={lane.chain}
                        position={selected.position}
                        locale={locale}
                        onClose={() => setSelected(null)}
                      />
                    ) : null}
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </section>
  )
}

/**
 * LES QUATRE CHIFFRES DE TÊTE (#1504).
 *
 * ⚠️ Le retour en demande quatre, dont « dossiers bloqués » ET « décisions
 * humaines attendues ». Dans ce moteur, ce sont le MÊME état : un dossier n'est
 * arrêté que devant une porte sans réponse. Les afficher côte à côte montrerait
 * deux fois le même nombre sous deux noms — la façon la plus sûre de faire
 * douter d'un tableau de bord.
 *
 * On garde donc « décisions attendues » (ce que c'est vraiment) et on met à côté
 * une mesure DIFFÉRENTE : les dossiers sans mouvement depuis plus d'une semaine,
 * porte ou pas. C'est celle qui répond à « ça n'avance plus ».
 */
function BoardKpis({
  totals,
  slowest,
  locale,
}: {
  totals: { tracked: number; awaitingDecision: number; stalled: number }
  slowest: { lane: ChainLane; position: number; days: number } | null
  locale: 'fr' | 'en'
}) {
  const { t } = useTranslation('chains')
  const slowestStepLabel = slowest
    ? (slowest.lane.chain.steps.find(step => step.position === slowest.position)?.label[locale] ?? null)
    : null

  return (
    <Box className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Kpi label={t('kpis.tracked')} value={String(totals.tracked)} />
      <Kpi label={t('kpis.awaitingDecision')} value={String(totals.awaitingDecision)} />
      <Kpi label={t('kpis.stalled')} value={String(totals.stalled)} />
      {/* ⚠️ Aucune durée quand rien n'est mesurable. « 0 jour » sur un espace
          sans dossier serait un chiffre faux, pas un chiffre neutre. */}
      <Kpi
        label={t('kpis.slowest')}
        value={slowestStepLabel ?? t('kpis.notMeasured')}
        hint={slowestStepLabel ? t('kpis.slowestDays', { count: Math.round(slowest?.days ?? 0) }) : undefined}
      />
    </Box>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <Box className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3">
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="span" size="xl" weight="semibold" className="truncate">
        {value}
      </Text>
      {hint ? (
        <Text element="span" size="xs" color="text-muted-foreground">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * UNE CARTE DE PARCOURS — son nom, sa finalité, et où ça coince (#1502, #1507).
 *
 * Le fil horizontal porte des NOMS MÉTIER et leur état. Chaque étape dit combien
 * de dossiers s'y trouvent et depuis combien de jours, en médiane, ils n'ont pas
 * bougé — quand c'est mesurable, et seulement là.
 */
function ChainRow({
  lane,
  locale,
  onSelect,
}: {
  lane: ChainLane
  locale: 'fr' | 'en'
  onSelect: (position: number | 'undetermined') => void
}) {
  const { t } = useTranslation('chains')
  const undetermined = undeterminedOf(lane)

  return (
    <Box className="rounded-xl border border-border bg-card p-3">
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Text element="span" size="base" weight="semibold">
          {lane.chain.label[locale]}
        </Text>
        {/* #1502 — la FINALITÉ. « Sourcing et matching » ne dit pas à quoi ça
            sert ; « transformer un besoin qualifié en profil accepté » le dit.

            ⚠️ Optionnelle À LA LECTURE, bien qu'obligatoire au contrat. Le web
            est servi par Vercel en deux minutes et l'API par Railway en dix :
            pendant ce quart d'heure, un écran neuf interroge l'API PRÉCÉDENTE.
            `purpose[locale]` sur un `undefined` ne dégrade pas — il JETTE, et
            tout l'écran tombe sur « Oups ». Mesuré en production le 05/09. */}
        {lane.chain.purpose ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {lane.chain.purpose[locale]}
          </Text>
        ) : null}
      </Box>

      <Box display="flex" className="mt-2 flex-wrap items-center gap-2">
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('lane.inProgress', { count: countOf(lane.total) })}
        </Text>
        {/* Une décision en attente n'est pas un dossier « en cours » : c'est
            quelqu'un qui attend une réponse, et c'est ce qui demande une action. */}
        {countOf(lane.awaitingDecision) > 0 ? (
          <Badge variant="warning">{t('lane.waiting', { count: countOf(lane.awaitingDecision) })}</Badge>
        ) : null}
        {countOf(lane.stalled) > 0 ? (
          <Badge variant="warning">{t('lane.stalled', { count: countOf(lane.stalled) })}</Badge>
        ) : null}
        {undetermined > 0 ? (
          // Ce qu'on ne sait pas placer ne se cache pas — et il s'OUVRE : une
          // alerte sans geste possible est une alerte qu'on apprend à ignorer.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => onSelect('undetermined')}
          >
            {t('lane.undetermined', { count: undetermined })}
          </Button>
        ) : null}
      </Box>

      <Box className="mt-2">
        <ChainFlow
          chain={lane.chain}
          locale={locale}
          cells={lane.positions.map(entry => ({
            position: entry.position,
            count: countOf(entry.count),
            medianDays: Number.isFinite(entry.medianDaysAtPosition) ? (entry.medianDaysAtPosition as number) : null,
            awaiting: countOf(entry.awaiting),
          }))}
          onSelect={onSelect}
        />
      </Box>

      <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
        {/* La boucle de retour : ce qui RAMÈNE un dossier en arrière. C'est ce
            qui distingue un parcours d'une liste de cases. */}
        {lane.chain.returnLoop[locale]}
      </Text>
    </Box>
  )
}

/**
 * LES DOSSIERS D'UNE ÉTAPE — ou ceux qu'on ne sait pas placer.
 *
 * ⚠️ Aucun bouton « avancer », « répondre » ou « abandonner » : la position se
 * dérive de l'objet, donc elle se change EN CHANGEANT L'OBJET. Un bouton ici
 * recréerait la seconde vérité que ce chantier supprime. Le clic ouvre le
 * dossier, et c'est là que le geste se fait.
 */
function PositionPanel({
  chain,
  position,
  locale,
  onClose,
}: {
  chain: Chain
  position: number | 'undetermined'
  locale: 'fr' | 'en'
  onClose: () => void
}) {
  const { t } = useTranslation('chains')
  const isUndetermined = position === 'undetermined'
  const placed = useChainPosition(isUndetermined ? null : chain.key, isUndetermined ? null : position)
  const unknown = useChainUndetermined(isUndetermined ? chain.key : null)
  const items = isUndetermined ? unknown.data : placed.data
  const isLoading = isUndetermined ? unknown.isLoading : placed.isLoading

  return (
    <Box className="rounded-xl border border-border bg-card p-3">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="span" size="sm" weight="medium">
          {isUndetermined
            ? t('flow.undetermined')
            : // #1507.1 — le NOM de l'étape, pas « Position 3 ».
              (chain.steps.find(step => step.position === position)?.label[locale] ?? t('panel.title', { position }))}
        </Text>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('common:actions.close')}
        </Button>
      </Box>

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : (items?.length ?? 0) === 0 ? (
        <Text size="sm" color="text-muted-foreground">
          {t('panel.empty')}
        </Text>
      ) : (
        <Box className="mt-2 space-y-2">
          {items?.map(row => (
            <Box key={row.subjectId} className="rounded-lg border border-border p-2">
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text element="span" size="sm" weight="medium">
                  {/* Un libellé absent veut dire « la ligne n'existe plus ».
                      L'écran le NOMME : du vide ferait passer une disparition
                      pour un dossier sans nom. */}
                  {row.label ?? t('panel.unknownSubject')}
                </Text>
                <Text element="span" size="xs" color="text-muted-foreground">
                  {/* « account » brut à l'écran ne dit rien à personne. */}
                  {t(`panel.subjects.${chain.subjectType}`)}
                </Text>
                {/* ⚠️ Aucune durée quand la date est illisible : « 0 jour »
                    serait une affirmation, pas une absence. */}
                {row.days === null || Math.round(row.days) < 1 ? null : (
                  <Badge variant={row.days > 7 ? 'warning' : 'outline'}>
                    {t('panel.days', { count: Math.round(row.days) })}
                  </Badge>
                )}
              </Box>
              <Box className="mt-1">
                <ChainEvidence chain={chain} derivation={row.derivation} locale={locale} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
