import { Badge, Box, Button, Card, CardContent, SelectField, Tabs, TabsList, TabsTrigger, Text } from '@bellum/ui'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, Plus, RefreshCw, Zap } from 'lucide-react'
import {
  PARTNER_ROLES,
  PARTNER_STAGES,
  type Consultant,
  type EsnRank2ObservationSummary,
  type PartnerGovernanceFields,
  type PartnerGovernanceReadiness,
  type PartnerGovernanceStatus,
  type PartnerCvPushOutcome,
  type PartnerRelationScore,
  type PartnerRole,
  type PartnerScoreAxis,
  type PartnerStage,
  type UpdatePartnerGovernance,
} from '@bellum/contracts'
import { BrowsableDialog } from '@/components/overlay/BrowsableDialog'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { formatDate } from '@/lib/locale'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { consultantsApi } from '@/features/consultants/api'
import { partnerFlow, type PartnerFlow } from '../model/partnerFlow'
import { PartnerStageBand } from './PartnerStageBand'
import { EMPTY_PARTNER_GOVERNANCE_FIELDS, PartnerGovernanceEditDialog } from './PartnerGovernanceEditDialog'
import {
  PARTNER_ON_ACCOUNTS_KEY,
  PARTNER_PIPELINE_KEY,
  createPartnerRelation,
  declarePartnerCvPushSent,
  fetchEsnOnMyAccounts,
  fetchPartnerCvPushes,
  fetchPartnerProfileMatches,
  fetchPartnerRelations,
  partnerCvPushesKey,
  partnerProfileMatchesKey,
  preparePartnerCvPush,
  recordPartnerCvPushOutcome,
  setPartnerNonSolicitation,
  setPartnerStage,
  updatePartnerGovernance,
} from '../api/partner-pipeline-api'

const TABS = ['mine', 'discover', 'onAccounts'] as const
type Tab = (typeof TABS)[number]

/** Les trois états de la clause. `unknown` est le seul qui soit vrai par
 *  défaut : personne ne l'a déclarée, ce qui n'est ni « oui » ni « non ». */
const CLAUSE_CHOICES = ['unknown', 'no', 'yes'] as const
const clauseValue = (declared: boolean | null): (typeof CLAUSE_CHOICES)[number] =>
  declared === null ? 'unknown' : declared ? 'yes' : 'no'
const clauseFrom = (choice: string): boolean | null => (choice === 'unknown' ? null : choice === 'yes')

interface RelationCard {
  id: string
  name: string
  stage: string
  roles: string[]
  needsReceived90d: number
  needsGiven90d: number
  /* #1428 — les deux compteurs de placement et la date d'activité voyagaient
     déjà sur le fil (`PartnerRelationView`) et n'étaient rendus NULLE PART :
     la donnée existait, c'est le rendu qui manquait. Voir `partnerFlow.ts`
     pour ce qu'on peut honnêtement en dire — trois d'entre eux n'ont aucun
     écrivain de production. */
  placementsActive: number
  placementsTotal: number
  lastActivityAt: string | null
  nonSolicitation: boolean | null
  score: PartnerRelationScore
  notCollected: { axis: PartnerScoreAxis; why: string }[]
  /* #2374.7 — même défaut de forme que les compteurs de placement (#1428
     ci-dessus) : la donnée voyage déjà sur le fil (`PartnerRelationView
     .contactName`) et n'avait aucun rendu — `RelationCard` ne la portait
     même pas, donc TypeScript la laissait tomber avant le JSX. */
  contactName: string | null
  /** #3270 — PARTNER READINESS, telle que le serveur l'a calculée. */
  governanceReadiness: PartnerGovernanceReadiness
  governanceStatus: PartnerGovernanceStatus
  /** #3270 — le cadre déclaré, tel quel — `undefined` sur une relation
   *  construite avant ce champ (les tests existants n'ont pas à le porter). */
  governance?: PartnerGovernanceFields
}

/**
 * #3270 (BEL-SC-241) — PARTNER READINESS : ce qui est cadré, ce qui manque,
 * le risque, les comptes/profils concernés, la prochaine validation.
 *
 * Un badge de statut, jamais un score nu : les dimensions manquantes restent
 * NOMMÉES (doctrine « un score n'est jamais nu »), et une relation sans aucun
 * cadre encore posé (`observed`) n'affiche que le badge, sans liste de trous
 * qui redirait ce que le badge dit déjà.
 */
/**
 * #3270.6 — SURFACES : exportée pour que la fiche Compte (`TabPartners.tsx`)
 * rende le MÊME panneau plutôt que d'en redériver un second (GA-26).
 */
export function PartnerReadinessPanel({
  status,
  readiness,
}: {
  status: PartnerGovernanceStatus
  readiness: PartnerGovernanceReadiness
}) {
  const { t } = useTranslation('partnerPipeline')
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <Box className="flex flex-col gap-1.5 rounded-lg border border-[var(--bellum-border)] p-2.5">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge
          variant={
            readiness.risk === 'blocking' ? 'destructive' : readiness.risk === 'attention' ? 'warning' : 'success'
          }
        >
          {t(`governance.status.${status}`)}
        </Badge>
        {readiness.framed.length > 0 && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('governance.framedCount', {
              framed: readiness.framed.length,
              total: readiness.framed.length + readiness.missing.length,
            })}
          </Text>
        )}
      </Box>
      {readiness.nextValidation && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('governance.nextValidation', { dimension: t(`governance.dimension.${readiness.nextValidation}`) })}
        </Text>
      )}
      {readiness.missing.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex items-center gap-1 self-start rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline pointer-coarse:min-h-11"
          >
            {open ? t('governance.missingHide') : t('governance.missingShow', { count: readiness.missing.length })}
            {open ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
          </button>
          {open && (
            <ul id={panelId} className="flex flex-col gap-0.5 border-l border-[var(--bellum-border)] pl-3">
              {readiness.missing.map(dimension => (
                <li key={dimension}>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(`governance.dimension.${dimension}`)}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Box>
  )
}

/**
 * Une relation partenaire, AVEC son score décomposé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * La carte affichait « 62 / 100 » dans une pastille, et rien d'autre. Un score
 * nu se lit comme une vérité complète : personne ne devinait que deux axes sur
 * cinq — la Marge et l'Accès — n'avaient tout simplement pas pu être évalués,
 * ni que le dénominateur réel était 55 points et non 100.
 *
 * Pire : ces deux axes-là ne sont pas « pas encore mesurés », ils ne sont
 * COLLECTÉS PAR PERSONNE. Aucune mission n'est rattachable à un partenaire
 * précis, et rien n'enregistre qu'un partenaire nous a ouvert un compte. Les
 * afficher du même gris qu'un axe en attente ferait attendre une valeur qui
 * n'arrivera pas — c'est exactement ce qui a laissé ces deux axes muets depuis
 * le premier jour. La carte les NOMME donc, avec la raison venue de l'API.
 *
 * Les axes vivent derrière une commande dépliable et non un survol : un survol
 * n'existe ni au doigt ni au clavier, et ce qui se clique se tabule (GA-35).
 */
function PartnerRelationCard({
  relation,
  flow,
  onStage,
  onClause,
  busy,
  consultants,
  onGovernanceSave,
  governanceSaving,
  autoFocus,
}: {
  relation: RelationCard
  /**
   * recette 10/09 — calculé UNE fois par le parent (`PartnerPipeline`), sur
   * la même date pour toutes les cartes de la page, et non plus ici : le
   * parent en a aussi besoin pour savoir s'il doit afficher l'explication
   * « flux non compté » une seule fois pour toute la liste (voir
   * `PartnerFlowLine` plus bas). Deux dérivations séparées de la même donnée
   * auraient fini par diverger — GA-26.
   */
  flow: PartnerFlow
  onStage: (stage: PartnerStage) => void
  onClause: (value: boolean | null) => void
  busy: boolean
  /** #2887 (#2371.8) — chargé UNE fois par `PartnerPipeline`, jamais par carte. */
  consultants: Consultant[]
  /** #3270 (reste) — LE FORMULAIRE GÉNÉRIQUE D'ÉDITION DU CADRE. */
  onGovernanceSave: (patch: UpdatePartnerGovernance) => void
  governanceSaving: boolean
  /** #3397.3 — la relation que « Qualifier la route rang 2 » désigne depuis le chat. */
  autoFocus?: boolean
}) {
  const { t } = useTranslation('partnerPipeline')
  const [open, setOpen] = useState(false)
  // #1319.5 — les sept autres étapes attendent derrière une commande.
  const [stagesOpen, setStagesOpen] = useState(false)
  const [governanceEditOpen, setGovernanceEditOpen] = useState(Boolean(autoFocus))
  const panelId = useId()
  const stagesId = useId()
  const clauseId = useId()
  const uncollected = new Map(relation.notCollected.map(item => [item.axis, item.why]))
  const cardRef = useRef<HTMLDivElement>(null)

  // #3397.3 — le lien de Laura amène directement sur CETTE carte, jamais sur
  // la liste nue : elle défile en vue ET son formulaire de cadre s'ouvre déjà
  // (la question posée par « qualifier la route rang 2 » est justement celle
  // que ce formulaire répond — marge plancher, non-contournement).
  useEffect(() => {
    if (autoFocus) cardRef.current?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'arrivée sur cette carte
  }, [])

  return (
    <div ref={cardRef}>
      <Card style={autoFocus ? { borderColor: 'var(--bellum-primary-500)' } : undefined}>
        <CardContent className="flex flex-col gap-2 p-4">
          {/* #1427 — « la carte contient trop de texte peu mis en scène ». Le nom
            de l'ESN se lisait au même poids que tout le reste ; il porte
            maintenant la hiérarchie, et le type de relation le suit.

            ⚠️ Le LOGO du partenaire reste refusé, et la raison n'a pas changé
            depuis #1319.3 : un partenaire n'est pas un compte, il vit dans sa
            propre table avec un SIREN et un nom, sans site web ; la colonne
            `domain` du référentiel ESN n'est JAMAIS renseignée, et 93 % des
            domaines du fichier d'origine étaient DÉRIVÉS du nom — c'est
            précisément pour ça qu'on ne les a pas repris. Afficher un logo ici
            reviendrait à deviner un domaine à partir d'un nom, donc à montrer
            le logo d'une autre société une fois sur deux. */}
          <Box display="flex" className="flex-wrap items-start justify-between gap-2">
            <Box display="flex" className="min-w-0 flex-wrap items-center gap-2">
              <Text size="base" weight="semibold" className="min-w-0 truncate">
                {relation.name}
              </Text>
              {relation.roles.map(role => (
                <Badge key={role} variant="info">
                  {t(`roles.${role}`, role)}
                </Badge>
              ))}
            </Box>
            {/* Le score, JAMAIS seul : la note, et combien d'axes n'ont pas pu
              être évalués. Son absence est MOTIVÉE — un zéro se lirait
              « mauvais partenaire » là où on n'a rien vécu ensemble. */}
            <Box display="flex" className="shrink-0 items-center gap-2">
              <ScoreWithAxes
                compact
                score={relation.score.score}
                max={100}
                reason={relation.score.reason}
                axes={relation.score.axes.map(axis => ({
                  label: t(`axes.${axis.axis}`, axis.axis),
                  score: axis.points,
                }))}
              />
              {/* #1429 — « il faut aussi pouvoir lancer une analyse d'ESN
                partenaire, pas seulement d'un client final ».
                Arbitrage de Louis du 04/09/2026 : on RÉUTILISE le chemin
                d'analyse existant. Le lien porte le nom de l'ESN jusqu'à
                `/search`, où le run est armé, le coût annoncé et la
                confirmation demandée — exactement comme pour le rail
                « comptes proches de ta cible ». Aucun second chemin
                d'analyse n'est créé, et le crédit se débite là où il
                s'annonce déjà. L'ESN atterrit ensuite dans Comptes comme
                n'importe quelle société : c'est la contrepartie, elle est
                assumée. */}
              <Link
                to="/search"
                search={{ company: relation.name }}
                aria-label={t('mine.analyseAria', { name: relation.name })}
                className="flex items-center gap-1 rounded-badge border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-2.5 py-1 text-xs text-[var(--accent-soft-text)] transition-colors hover:border-[var(--accent-soft-text)] pointer-coarse:min-h-11"
              >
                <Zap className="size-3" aria-hidden />
                {t('mine.analyse')}
              </Link>
            </Box>
          </Box>

          {/* #2374.7 — le contact de la relation, quand l'espace le connaît :
            seule donnée déjà collectée (`mine.form.contactName`) qui restait
            invisible une fois la relation créée. */}
          {relation.contactName ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('mine.contactLabel', { name: relation.contactName })}
            </Text>
          ) : null}

          {/* #1319.2 — « on ne comprend pas ce que mesure le score, d'où viennent
            les informations, ni sur quelle période ». La décomposition était
            déjà là ; la FENÊTRE et la SOURCE manquaient.

            ⚠️ L'issue proposait « calculé sur les 90 derniers jours ». C'est
            FAUX : le calcul lit `needsReceived12m`, `needsGiven12m` et le ratio
            des missions menées à terme — douze mois. Les compteurs à 90 jours
            juste en dessous mesurent le flux récent, pas le score. Livrer le
            littéral aurait écrit une phrase fausse sous un chiffre. */}
          {relation.score.score !== null && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('mine.scoreWindow')} {t('mine.scoreInternalOnly')}
            </Text>
          )}

          {/* #1428 — « afficher de vrais indicateurs : besoins reçus, confiés en
            retour, missions réalisées ensemble, flux actif / dormant ».

            ⚠️ Cette ligne écrivait « 0 besoin(s) reçu(s) · 0 confié(s) en
            retour, sur 90 jours » pour TOUT LE MONDE hors démonstration, et
            elle se lisait comme une mesure. En cherchant qui alimente ces
            compteurs, on ne trouve que le semis de démonstration : aucun
            service, aucune tâche, aucune migration de production n'écrit
            `needs_received_90d`, `needs_given_90d`, `placements_active` ni
            `placements_total`. Le service le savait déjà à moitié — il traite
            un compteur à zéro comme `null` pour le SCORE, afin que l'axe sorte
            du dénominateur — mais l'écran ne l'avait pas appris.

            `partnerFlow` tranche une fois : compté, ou pas compté. Ce qui n'est
            pas compté se DIT, avec ce qu'il faudrait pour le compter. */}
          <PartnerFlowLine flow={flow} />

          {relation.score.axes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex items-center gap-1 self-start rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline pointer-coarse:min-h-11"
              >
                {open ? t('axesHide') : t('axesShow')}
                {open ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
              </button>

              {/* Un `div` nu et non `Box` : `aria-controls` a besoin d'un `id`,
                que `Box` ne relaie pas. Sans lui, la commande et son panneau ne
                sont liés pour aucun lecteur d'écran. */}
              {open && (
                <div id={panelId} className="flex flex-col gap-2 border-l border-[var(--bellum-border)] pl-3">
                  {/* Le dénominateur RÉEL. « 62 sur 100 » alors que 55 points
                    seulement étaient mesurables mesurerait la complétude de
                    notre saisie, pas la qualité du partenaire. */}
                  {relation.score.score !== null && (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('scale', { max: relation.score.scoreMax })}
                    </Text>
                  )}
                  {relation.score.axes.map(axis => (
                    <Box key={axis.axis} display="flex" className="flex-col gap-0.5">
                      <Box display="flex" className="items-baseline justify-between gap-2">
                        <Text size="xs" weight="medium">
                          {t(`axes.${axis.axis}`, axis.axis)}
                        </Text>
                        {/* Un axe non mesuré porte la RAISON de son silence, pas
                          un « 0 » ni un tiret muet. */}
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {axis.points === null
                            ? uncollected.has(axis.axis)
                              ? t('availability.notCollected')
                              : t('availability.absent')
                            : t('axisPoints', { points: axis.points, max: axis.max })}
                        </Text>
                      </Box>
                      {/* #1319.4 — « au minimum une ligne de lecture visuelle des
                        axes évalués ». Une barre UNIQUEMENT pour un axe
                        réellement mesuré : en dessiner une vide sous un axe non
                        évaluable le peindrait à zéro, c'est-à-dire exactement
                        le contraire de ce que la carte dit juste à côté. Ce
                        n'est pas une donnée de plus, c'est la même, lisible
                        d'un coup d'œil.

                        `role="img"` avec son nom : la barre porte la valeur
                        pour qui ne la voit pas, et le chiffre reste écrit à
                        droite du libellé — la barre l'accompagne, elle ne le
                        remplace pas. */}
                      {axis.points !== null && axis.max > 0 && (
                        <Box
                          role="img"
                          aria-label={t('axisBarLabel', {
                            axis: t(`axes.${axis.axis}`, axis.axis),
                            points: axis.points,
                            max: axis.max,
                          })}
                          className="h-1 w-full overflow-hidden rounded-full bg-[var(--bellum-border)]"
                        >
                          <Box
                            className="h-full rounded-full bg-[var(--bellum-text-accent)]"
                            style={{ width: `${Math.round((axis.points / axis.max) * 100)}%` }}
                          />
                        </Box>
                      )}
                      {/* Ce que le calcul a écrit, puis — s'il n'y a personne pour
                        le renseigner — ce qu'il faudrait CONSTRUIRE. Les deux
                        n'appellent pas le même geste. */}
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {uncollected.get(axis.axis) ?? axis.evidence}
                      </Text>
                    </Box>
                  ))}
                </div>
              )}
            </>
          )}

          {/* #1319.5 — « les tags sont utiles, mais posés sans mise en scène ».
            Huit boutons alignés donnaient huit fois le même poids : l'étape
            COURANTE, qui est l'information, se lisait comme les sept autres,
            qui sont des gestes. Elle est maintenant affirmée, et les autres
            attendent derrière une commande.

            ⚠️ Les huit étapes RESTENT toutes atteignables : reléguer n'est pas
            retirer, et un retour en arrière (« Dormant » après « Flux actif »)
            est un geste légitime qu'aucun enchaînement ne doit interdire. */}
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Badge variant="primary">{t('stageCurrent', { stage: t(`stages.${relation.stage}`) })}</Badge>
            <button
              type="button"
              onClick={() => setStagesOpen(value => !value)}
              aria-expanded={stagesOpen}
              aria-controls={stagesId}
              className="rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline pointer-coarse:min-h-11"
            >
              {stagesOpen ? t('stageChangeHide') : t('stageChange')}
            </button>
          </Box>
          {stagesOpen && (
            <div id={stagesId} className="flex flex-wrap gap-1">
              {PARTNER_STAGES.filter(stage => stage !== relation.stage).map(stage => (
                <button
                  key={stage}
                  type="button"
                  disabled={busy}
                  onClick={() => onStage(stage)}
                  className="rounded-badge px-2 py-0.5 text-xs pointer-coarse:min-h-11"
                  style={{
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    background: 'transparent',
                  }}
                >
                  {t(`stages.${stage}`)}
                </button>
              ))}
            </div>
          )}

          {/* #3270 (BEL-SC-241) — PARTNER READINESS : le statut gouverné, ce qui
            est cadré, ce qui manque, la prochaine validation. */}
          <PartnerReadinessPanel status={relation.governanceStatus} readiness={relation.governanceReadiness} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => setGovernanceEditOpen(true)}
          >
            {t('governance.edit.open')}
          </Button>
          <PartnerGovernanceEditDialog
            open={governanceEditOpen}
            onOpenChange={setGovernanceEditOpen}
            partnerName={relation.name}
            fields={relation.governance ?? EMPTY_PARTNER_GOVERNANCE_FIELDS}
            busy={governanceSaving}
            onSave={patch => {
              onGovernanceSave(patch)
              setGovernanceEditOpen(false)
            }}
          />

          {/* La clause de non-sollicitation — la seule des deux gardes dures qui
            se DÉCLARE. Trois états, parce que « personne ne l'a déclarée » et
            « il n'y en a pas » n'autorisent pas le même geste. */}
          <Box display="flex" className="flex-wrap items-center gap-2">
            <label htmlFor={clauseId} className="text-xs text-[var(--bellum-text-muted)]">
              {t('clause.label')}
            </label>
            <SelectField
              id={clauseId}
              value={clauseValue(relation.nonSolicitation)}
              onChange={next => onClause(clauseFrom(next))}
              options={CLAUSE_CHOICES.map(choice => ({ value: choice, label: t(`clause.${choice}`) }))}
              disabled={busy}
            />
          </Box>

          {relation.score.recommendation && (
            <Text size="xs">{t(`recommendation.${relation.score.recommendation}`)}</Text>
          )}
          {/* La garde dure, DITE : on ne contourne pas celui qui a ouvert la
            porte, et l'écran explique pourquoi le bouton n'est pas là. */}
          {relation.score.rank1Blocked && (
            <Text size="xs" color="text-[var(--warning-soft-text)]">
              {relation.score.rank1Blocked}
            </Text>
          )}

          {/* #2887 (#2371.8) — la revue d'un CV poussé à CE partenaire. */}
          <PartnerCvPushSection partnerId={relation.id} consultants={consultants} />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * #2887 (#2371.8) — LA REVUE D'UN CV POUSSÉ À UN PARTENAIRE.
 *
 * Brief et TJM ne sont jamais saisis ici : ils viennent de la fiche
 * consultant (le serveur les recalcule à chaque lecture, GA-26). Le seul
 * champ propre à cette revue est le partage négocié avec CE partenaire, et il
 * se déclare ailleurs (fenêtre de déploiement — non exposé côté écran ce
 * lot : la revue affiche « non déclaré » plutôt que de deviner un partage).
 *
 * `status` ne porte jamais de preuve d'envoi (doctrine, Louis 21/09/2026) :
 * « déclaré envoyé » est un geste du commercial, jamais une vérification
 * technique — la même distinction que `contact_stops` ou l'UNDO d'action.
 */
function PartnerCvPushSection({ partnerId, consultants }: { partnerId: string; consultants: Consultant[] }) {
  const { t } = useTranslation('partnerPipeline')
  const [expanded, setExpanded] = useState(false)
  const [consultantId, setConsultantId] = useState('')
  const panelId = useId()
  const pickId = useId()
  const queryClient = useQueryClient()

  const pushes = useQuery({
    queryKey: partnerCvPushesKey(partnerId),
    queryFn: () => fetchPartnerCvPushes(partnerId),
    enabled: expanded,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: partnerCvPushesKey(partnerId) })
  const prepare = useMutation({
    mutationFn: (id: string) => preparePartnerCvPush(partnerId, id),
    onSuccess: () => {
      setConsultantId('')
      return invalidate()
    },
  })
  const declareSent = useMutation({
    mutationFn: (pushId: string) => declarePartnerCvPushSent(partnerId, pushId),
    onSuccess: invalidate,
  })
  const recordOutcome = useMutation({
    mutationFn: ({ pushId, outcome }: { pushId: string; outcome: PartnerCvPushOutcome }) =>
      recordPartnerCvPushOutcome(partnerId, pushId, outcome),
    onSuccess: invalidate,
  })

  return (
    <Box display="flex" className="flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex items-center gap-1 self-start rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline pointer-coarse:min-h-11"
      >
        {t('cvPush.toggle')}
        {expanded ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
      </button>
      {expanded && (
        <div id={panelId} className="flex flex-col gap-2 border-l border-[var(--bellum-border)] pl-3">
          <form
            onSubmit={event => {
              event.preventDefault()
              if (consultantId) prepare.mutate(consultantId)
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <Box display="flex" className="min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={pickId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('cvPush.pickConsultant')}
              </label>
              <SelectField
                id={pickId}
                value={consultantId}
                onChange={setConsultantId}
                emptyOption={{ label: t('cvPush.pickConsultantPlaceholder') }}
                options={consultants.map(consultant => ({
                  value: consultant.id,
                  label: consultant.full_name ?? consultant.id,
                }))}
              />
            </Box>
            <Button type="submit" size="sm" variant="outline" disabled={!consultantId || prepare.isPending}>
              {t('cvPush.prepare')}
            </Button>
          </form>

          {pushes.data && pushes.data.length === 0 && (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('cvPush.empty')}
            </Text>
          )}

          {pushes.data?.map(push => (
            <Card key={push.id}>
              <CardContent className="flex flex-col gap-1.5 p-3">
                <Text size="sm" weight="medium">
                  {push.brief.consultantName ?? t('cvPush.unknownConsultant')}
                </Text>
                {(push.brief.title ?? push.brief.seniority) && (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {[push.brief.title, t(`cvPush.seniority.${push.brief.seniority}`, push.brief.seniority)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
                {/* GA-18/GA-19 : un TJM ou un partage non déclaré ne fait AUCUNE ligne. */}
                {push.economics.tjm !== null && <Text size="xs">{t('cvPush.tjm', { tjm: push.economics.tjm })}</Text>}
                {push.economics.marginSharePct !== null && (
                  <Text size="xs">{t('cvPush.margin', { percent: push.economics.marginSharePct })}</Text>
                )}
                <Box display="flex" className="flex-wrap items-center gap-2">
                  <Badge variant="info" className="w-fit">
                    {t(`cvPush.status.${push.status}`)}
                  </Badge>
                  <Badge variant={push.outcome === 'retenu' ? 'success' : 'default'} className="w-fit">
                    {t(`cvPush.outcome.${push.outcome}`)}
                  </Badge>
                </Box>
                {/* ⚠️ Un geste DÉCLARATIF, jamais une preuve d'envoi. */}
                {push.status === 'preparee' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-start"
                    disabled={declareSent.isPending}
                    onClick={() => declareSent.mutate(push.id)}
                  >
                    {t('cvPush.declareSent')}
                  </Button>
                )}
                {push.status === 'envoyee_declaree' && push.outcome === 'en_attente' && (
                  <Box display="flex" className="gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={recordOutcome.isPending}
                      onClick={() => recordOutcome.mutate({ pushId: push.id, outcome: 'retenu' })}
                    >
                      {t('cvPush.outcome.retenu')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={recordOutcome.isPending}
                      onClick={() => recordOutcome.mutate({ pushId: push.id, outcome: 'refuse' })}
                    >
                      {t('cvPush.outcome.refuse')}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Box>
  )
}

/**
 * #1428 — LE FLUX DE LA RELATION, DIT HONNÊTEMENT.
 *
 * Trois situations, mais deux rendus par CARTE :
 *
 *  · `uncounted` — personne ne compte les échanges avec ce partenaire. Rien
 *    ne s'affiche ICI (recette 10/09) : la carte n'a pas de fait à porter sur
 *    CE partenaire précis, seulement une règle qui vaut pour toute la liste —
 *    « personne ne compte encore les échanges » explique un manque du
 *    produit, pas une propriété de cette relation. `PartnerPipeline` la dit
 *    UNE fois pour la page entière (loi 4 du tome 7 : mesuré à 7 répétitions
 *    identiques sur 7 partenaires, puisque `partnerFlow` rend `uncounted`
 *    pour tout le monde tant qu'aucun chemin n'écrit les quatre compteurs) ;
 *  · `dormant` — des échanges sont comptés, mais rien ne circule en ce moment ;
 *  · `active` — des besoins ont circulé et l'activité est fraîche.
 *
 * La barre de réciprocité n'apparaît QUE quand quelque chose a circulé : une
 * barre vide sous « réciprocité » peindrait à zéro une relation qu'on n'a pas
 * mesurée. Même règle que les barres d'axes du score, quinze lignes plus haut.
 */
function PartnerFlowLine({ flow }: { flow: PartnerFlow }) {
  const { t } = useTranslation('partnerPipeline')

  // #1799 (résidu du 10/09) — LA PHRASE-RÈGLE A DÉMÉNAGÉ, UNE FOIS, AU-DESSUS
  // DE LA LISTE (`PartnerRelationsList` ci-dessous).
  //
  // Mesuré en production sur l'onglet « Mes partenaires » : 7 partenaires,
  // le MÊME paragraphe de 45 mots à l'identique sur chacun. La phrase est
  // juste — elle tient exactement la doctrine « afficher 0 laisserait
  // croire que tu n'as rien fait » — mais une phrase qui explique une RÈGLE
  // se dit une fois pour la liste, pas une fois par ligne (le « blabla en
  // gris » que #1818.3 a déjà corrigé sur l'onglet Partenaires d'un compte,
  // famille jamais balayée ici). La carte garde un état COURT ; l'explication
  // complète vit une seule fois, au-dessus des cartes.
  if (flow.state === 'uncounted') {
    return (
      <Badge variant="info" className="w-fit">
        {t('flow.state.uncounted')}
      </Badge>
    )
  }

  const counted = flow.counted
  if (!counted) return null

  /* Les quatre compteurs, chacun muet quand il ne compte rien. « Missions
     menées à terme » = total − en cours, borné à zéro dans `partnerFlow` :
     deux compteurs indépendants peuvent se croiser. */
  const pieces = [
    counted.needsReceived90d > 0 ? t('flow.needsReceived', { count: counted.needsReceived90d }) : null,
    counted.needsGiven90d > 0 ? t('flow.needsGiven', { count: counted.needsGiven90d }) : null,
    counted.missionsCompleted > 0 ? t('flow.missionsCompleted', { count: counted.missionsCompleted }) : null,
    counted.placementsActive > 0 ? t('flow.missionsActive', { count: counted.placementsActive }) : null,
  ].filter((piece): piece is string => piece !== null)

  return (
    <Box display="flex" className="flex-col gap-1.5">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge variant={flow.state === 'active' ? 'success' : 'default'}>{t(`flow.state.${flow.state}`)}</Badge>
        {/* ⚠️ CHAQUE compteur se dit SEUL, et seulement s'il compte quelque
            chose. Une phrase toute faite « {{received}} reçus · {{given}}
            confiés » écrit « 0 besoin reçu » dès que l'un des deux est vide —
            elle AFFIRME donc un zéro non mesuré, dans le bloc même qui existe
            pour ne plus le faire. Un test l'a attrapé : avec `placementsTotal:
            1` et `placementsActive: 3`, la carte annonçait « 0 mission menée à
            terme ensemble ». */}
        {pieces.length > 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {pieces.join(' · ')}
          </Text>
        ) : null}
      </Box>
      {/* La réciprocité, en barre. `role="img"` avec son nom : elle porte la
          valeur pour qui ne la voit pas, et la part reste écrite à droite —
          la barre accompagne le chiffre, elle ne le remplace pas. */}
      {flow.reciprocity !== null ? (
        <Box display="flex" className="flex-col gap-0.5">
          <Box display="flex" className="items-baseline justify-between gap-2">
            <Text size="xs" weight="medium">
              {t('axes.reciprocite')}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('flow.reciprocityValue', { percent: Math.round(flow.reciprocity * 100) })}
            </Text>
          </Box>
          <Box
            role="img"
            aria-label={t('flow.reciprocityBar', { percent: Math.round(flow.reciprocity * 100) })}
            className="h-1 w-full overflow-hidden rounded-full bg-[var(--bellum-border)]"
          >
            <Box
              className="h-full rounded-full bg-[var(--bellum-text-accent)]"
              style={{ width: `${Math.round(flow.reciprocity * 100)}%` }}
            />
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

/**
 * DÉCLARER une relation partenaire (Louis, 01/09/2026).
 *
 * `POST /partners` existait, gardé, testé — et aucun écran ne l'appelait : la
 * lecture était plus large que l'écriture, le défaut n°1 de ce dépôt. L'écran
 * disait « un partenaire, c'est une ESN à qui tu confies des besoins » sans
 * offrir le moyen d'en déclarer une seule.
 *
 * Saisie INLINE et non modale : trois champs, dont deux ont un défaut vrai. Une
 * boîte de dialogue pour trois champs coûte une couche de focus à gérer pour
 * rien — et l'ajout se fait ici, à côté de la liste qu'il remplit.
 *
 * Le rôle a un état « pas encore décidé » qui n'écrit RIEN : une ESN qu'on
 * vient de rencontrer n'est ni cliente ni fournisseur, et choisir pour
 * l'utilisateur inventerait la donnée que la liste affichera ensuite.
 */
function AddPartnerForm({
  onCreate,
  onDone,
  busy,
  failed,
}: {
  onCreate: (input: { name: string; roles?: PartnerRole[]; stage?: PartnerStage }) => void
  onDone: () => void
  busy: boolean
  failed: boolean
}) {
  const { t } = useTranslation('partnerPipeline')
  const nameId = useId()
  const roleId = useId()
  const stageId = useId()
  const [name, setName] = useState('')
  const [role, setRole] = useState<PartnerRole | ''>('')
  const [stage, setStage] = useState<PartnerStage>('identifie')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    // Une relation sans nom ne désigne personne : rien ne part.
    if (!trimmed) return
    onCreate({ name: trimmed, ...(role ? { roles: [role] } : {}), stage })
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Box display="flex" className="flex-col gap-3 md:flex-row md:items-end">
            <Box display="flex" className="min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={nameId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('mine.form.name')}
              </label>
              <input
                id={nameId}
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={t('mine.form.namePlaceholder')}
                className="rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1.5 text-sm pointer-coarse:min-h-11"
              />
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <label htmlFor={roleId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('mine.form.role')}
              </label>
              <SelectField
                id={roleId}
                value={role}
                onChange={next => setRole(next as PartnerRole | '')}
                emptyOption={{ label: t('mine.form.roleNone') }}
                options={PARTNER_ROLES.map(value => ({ value: value, label: t(`roles.${value}`, value) }))}
              />
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <label htmlFor={stageId} className="text-xs text-[var(--bellum-text-muted)]">
                {t('mine.form.stage')}
              </label>
              <SelectField
                id={stageId}
                value={stage}
                onChange={next => setStage(next as PartnerStage)}
                options={PARTNER_STAGES.map(value => ({ value: value, label: t(`stages.${value}`, value) }))}
              />
            </Box>
          </Box>

          {/* L'échec se DIT, et il dit surtout que rien n'a été créé — sans
              quoi l'utilisateur ressaisit et crée deux fois. */}
          {failed && (
            <Text size="xs" color="text-[var(--danger-soft-text)]">
              {t('mine.form.error')}
            </Text>
          )}

          <Box display="flex" className="items-center gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t('mine.form.submit')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={busy}>
              {t('mine.form.cancel')}
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * #1798 — LE LISTING DES ESN QUI COLLENT AU PROFIL, SANS PASSER PAR LE
 * TERRITOIRE.
 *
 * Louis (10/09/2026) : « ici avoir juste le listing des ESN qui collent avec
 * le profil, ne plus passer par le territoire ». L'onglet ouvrait jusque-là
 * un simple lien vers l'écran Territoire — un aller-retour, une saisie de
 * département à refaire à chaque fois pour la même question.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE COÛT, ET LA BORNE
 * ─────────────────────────────────────────────────────────────────────────
 * Le calcul serveur (`PartnerPipelineService.profileMatches`) est une lecture
 * INDEXÉE sur 477 lignes de référentiel, sans appel externe ni modèle — la
 * borne posée ici est donc côté RÉSEAU/RE-RENDU, pas côté $ : `enabled`
 * n'arme la requête qu'à l'ouverture de CET onglet, et la clé de cache PORTE
 * les zones déjà lues du profil (`partnerProfileMatchesKey`) — rouvrir
 * l'onglet avec un profil INCHANGÉ sert le cache (React Query, `staleTime`
 * 30 min) ; un profil dont les zones ont changé retombe sur une clé neuve et
 * redéclenche l'appel tout seul. Le bouton « Actualiser » reste un geste
 * explicite pour ne jamais laisser l'utilisateur coincé derrière la fenêtre
 * de fraîcheur.
 */
function DiscoverProfileMatches() {
  const { t } = useTranslation('partnerPipeline')
  const profile = useEsnProfile()
  const geoZones = profile.data?.geo_zones ?? []
  const matches = useQuery({
    queryKey: partnerProfileMatchesKey(geoZones),
    queryFn: fetchPartnerProfileMatches,
    enabled: !!profile.data,
    staleTime: 30 * 60 * 1000,
  })

  return (
    <Box display="flex" className="flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          {matches.isLoading && (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('discover.loading')}
            </Text>
          )}

          {matches.data?.status === 'no_geo_signal' && (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {matches.data.reason === 'unset'
                ? t('discover.noGeoSignal.unset')
                : t('discover.noGeoSignal.unmappable', { zones: matches.data.geoZones.join(' · ') })}
            </Text>
          )}

          {matches.data?.status === 'matched' && (
            <>
              {matches.data.geoZones.length > 0 && (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('discover.sourceZones', { zones: matches.data.geoZones.join(' · ') })}
                </Text>
              )}
              {matches.data.matches.length === 0 && <Text size="sm">{t('discover.empty')}</Text>}
              <ResponsiveTable
                rows={matches.data.matches}
                rowKey={esn => esn.name}
                scrollLabel={t('tabs.discover')}
                columns={[
                  {
                    key: 'esn',
                    header: t('discover.columns.esn'),
                    mobile: 'title',
                    render: esn => (
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
                        >
                          {esn.name.trim().slice(0, 2).toUpperCase()}
                        </span>
                        <Text size="sm" weight="medium" className="min-w-0 truncate">
                          {esn.name}
                        </Text>
                      </span>
                    ),
                  },
                  {
                    key: 'location',
                    header: t('discover.columns.location'),
                    mobile: 'meta',
                    render: esn => {
                      const location =
                        esn.city && esn.department
                          ? t('discover.match.location', { city: esn.city, department: esn.department })
                          : (esn.city ??
                            (esn.department
                              ? t('discover.match.locationDepartmentOnly', { department: esn.department })
                              : null))
                      return location ? <span>{location}</span> : null
                    },
                  },
                  {
                    key: 'subcontracting',
                    header: t('discover.columns.subcontracting'),
                    render: esn =>
                      esn.openToSubcontracting !== 'inconnu' ? (
                        <Badge variant={esn.openToSubcontracting === 'oui' ? 'success' : 'default'}>
                          {t(`discover.match.subcontracting.${esn.openToSubcontracting}`, esn.openToSubcontracting)}
                        </Badge>
                      ) : null,
                  },
                  {
                    key: 'analyse',
                    header: t('discover.columns.analyse'),
                    render: esn => (
                      <Link
                        to="/search"
                        search={{ company: esn.name }}
                        aria-label={t('discover.match.analyseAria', { name: esn.name })}
                        className="inline-flex items-center gap-1 rounded-badge border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-2.5 py-1 text-xs text-[var(--accent-soft-text)] transition-colors hover:border-[var(--accent-soft-text)] pointer-coarse:min-h-11"
                      >
                        <Zap className="size-3" aria-hidden />
                        {t('discover.match.analyse')}
                      </Link>
                    ),
                  },
                ]}
              />
            </>
          )}

          {/* #1798 — geste EXPLICITE : la fenêtre de fraîcheur (30 min) ne
              doit jamais devenir un cul-de-sac pour qui vient de changer son
              profil ailleurs. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            disabled={matches.isFetching}
            onClick={() => void matches.refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t('discover.refresh')}
          </Button>
        </CardContent>
      </Card>

      {/* #1798 — une recherche plus précise RESTE, à la main de
          l'utilisateur : un département, une région, une ville, une fenêtre
          de recrutement que le profil ne peut pas remplacer (le rayon est
          parti avec le panneau territoire, #2486). */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('discover.preciseSearchLead')}
          </Text>
          {/* ⚠️ #1796.2 (10/09/2026) — l'écran Territoire a fusionné dans Découvrir et
          sa route a été retirée. Ce lien la visait encore : sans le typage des
          routes de TanStack Router, il serait parti en production comme un lien
          MORT, silencieux. Il vise Découvrir.
          #2486 (16/09/2026) — le panneau territoire a ensuite quitté Découvrir :
          le lien ne promet plus « l'écran Territoire » ni un rayon, il nomme ce
          que le rail de Découvrir filtre encore. */}
          <Link to="/discover" className="text-sm underline">
            {t('discover.link')}
          </Link>
        </CardContent>
      </Card>
    </Box>
  )
}

/**
 * L'écran Partenaires (tome 4 §13) — « les ESN de ton territoire : celles qui
 * te concurrencent, et celles qui pourraient te faire travailler ».
 *
 * Trois onglets pour trois questions qui ne se mélangent pas :
 * - **Mes partenaires** : la relation que j'ENTRETIENS, son étape, son score ;
 * - **À découvrir** : les ESN qui collent au PROFIL — calculées automatiquement
 *   depuis sa zone géographique (#1798), avec une recherche par territoire
 *   toujours possible pour une maille plus précise ;
 * - **Sur mes comptes** : celles qui sont EN PLACE chez mes clients — un
 *   concurrent, et en même temps une porte de rang 2.
 *
 * La même ESN peut apparaître dans les trois, et ce n'est pas un doublon :
 * c'est le point de départ du tome (« une ESN, trois rôles »).
 */
export function PartnerPipeline({ highlightPartnerId }: { highlightPartnerId?: string } = {}) {
  const { t } = useTranslation('partnerPipeline')
  const [tab, setTab] = useState<Tab>('mine')
  const [adding, setAdding] = useState(false)
  // #1431 — l'étape retenue par le bandeau de synthèse. `null` = tout voir.
  const [stageFilter, setStageFilter] = useState<ReadonlySet<PartnerStage>>(() => new Set())
  /**
   * #1799 — LE RANG ouvert dans `onAccounts.data`, exactement comme
   * `openIndex` dans `TabPartners` (#1818.1, même `BrowsableDialog`) : « le
   * rang est celui de la liste COURANTE, c'est l'appelant qui le calcule ».
   * Ici la liste courante est celle de CET onglet — transverse, une ligne par
   * ESN sur l'ensemble des comptes de l'espace — pas celle d'un compte.
   */
  const [onAccountsOpenIndex, setOnAccountsOpenIndex] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const relations = useQuery({ queryKey: PARTNER_PIPELINE_KEY, queryFn: fetchPartnerRelations })
  // #2887 (#2371.8) — chargés une fois pour toute la page, jamais par carte
  // (même clé que `apps/web/src/features/consultants/hooks.ts`, réutilisée,
  // pas dupliquée).
  const consultants = useQuery({ queryKey: ['consultants'], queryFn: consultantsApi.list, enabled: tab === 'mine' })
  const onAccounts = useQuery({
    queryKey: PARTNER_ON_ACCOUNTS_KEY,
    queryFn: fetchEsnOnMyAccounts,
    enabled: tab === 'onAccounts',
  })
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PartnerStage }) => setPartnerStage(id, stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTNER_PIPELINE_KEY }),
  })
  const declareClause = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean | null }) => setPartnerNonSolicitation(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTNER_PIPELINE_KEY }),
  })
  // #3270 (reste) — le formulaire générique du cadre partenaire (doctrine c75).
  const saveGovernance = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePartnerGovernance }) => updatePartnerGovernance(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTNER_PIPELINE_KEY }),
  })
  const declare = useMutation({
    mutationFn: createPartnerRelation,
    onSuccess: () => {
      setAdding(false)
      return queryClient.invalidateQueries({ queryKey: PARTNER_PIPELINE_KEY })
    },
  })

  const relationList = relations.data ?? []
  // #1431 — le bandeau filtre la liste. Le filtre porte sur ce qui est
  // AFFICHÉ ; le bandeau, lui, compte toujours sur la population entière —
  // sinon la pastille retenue tomberait à « son propre compte » et les sept
  // autres à zéro dès le premier clic.
  const visibleRelations =
    stageFilter.size > 0 ? relationList.filter(r => stageFilter.has(r.stage as PartnerStage)) : relationList
  /**
   * recette 10/09 — calculé UNE fois ici, sur la MÊME date pour toute la
   * page, plutôt que dans chaque carte : c'est ce qui permet de savoir s'il
   * faut dire « personne ne compte encore les échanges » une seule fois pour
   * la liste, au lieu de la répéter identique sous chacune (mesuré à 7
   * répétitions sur 7 partenaires — la phrase est juste, elle explique une
   * règle du produit, pas un fait de CE partenaire, donc elle se dit pour la
   * liste et pas pour la ligne, loi 4 du tome 7).
   */
  const now = new Date()
  const visibleFlows = visibleRelations.map(relation => partnerFlow(relation, now))
  const anyFlowUncounted = visibleFlows.some(flow => flow.state === 'uncounted')
  const tabCount = (name: Tab): number | null => {
    if (name === 'mine') return relationList.length > 0 ? relationList.length : null
    if (name === 'onAccounts') return onAccounts.data && onAccounts.data.length > 0 ? onAccounts.data.length : null
    return null
  }

  return (
    <Box display="flex" className="flex-col gap-4">
      {/* #1426 — la phrase d'introduction générique est PARTIE d'ici : elle
          doublait le sous-titre de l'entête de page (`ScreenIntro`), qui dit
          déjà à quoi sert l'écran. Deux paragraphes d'intro empilés, c'est la
          loi 4 du tome 7 — rien n'apparaît deux fois sous la même forme. Ce qui
          restait à dire (« celles qui peuvent t'aider à ouvrir ou délivrer
          chez tes clients ») a rejoint ce sous-titre, à un seul endroit. */}
      <Tabs value={tab} onValueChange={value => setTab(value as Tab)}>
        <TabsList variant="underline" aria-label={t('tabsLabel')} className="max-w-full overflow-x-auto">
          {TABS.map(name => (
            <TabsTrigger key={name} value={name} className="gap-2">
              {t(`tabs.${name}`)}
              {/* Théo — l'onglet dit ce qu'il compte (« Enregistrés 3 ») ; une absence ne fait aucun chiffre. */}
              {tabCount(name) ? (
                <span
                  className="text-xs tabular-nums text-[var(--bellum-text-muted)]"
                  data-testid={`partners-tab-count-${name}`}
                >
                  {tabCount(name)}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* #1430 — « les trois onglets existent mais leur valeur n'est pas assez
          nette : que chaque onglet ait une utilité évidente et non juste un
          changement de filtre ». Chacun DIT ce qu'il montre, sur l'onglet
          courant seulement — trois sous-titres empilés ne se lisent pas. */}
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {/* i18n keys: subtitle.mine | subtitle.discover | subtitle.onAccounts */}
        {t(`subtitle.${tab}`)}
      </Text>

      {tab === 'mine' && (
        <Box display="flex" className="flex-col gap-2">
          {/* #1431 — la synthèse du portefeuille de partenaires, et son filtre. */}
          <PartnerStageBand
            relations={relationList}
            selected={stageFilter}
            onSelect={stage =>
              setStageFilter(current => {
                const next = new Set(current)
                if (next.has(stage)) next.delete(stage)
                else next.add(stage)
                return next
              })
            }
          />
          {/* L'ajout est offert AVANT la liste, donc aussi quand elle est vide —
              c'est même le seul moment où la question « comment j'en ajoute
              un ? » se pose vraiment. */}
          {adding ? (
            <AddPartnerForm
              busy={declare.isPending}
              failed={declare.isError}
              onCreate={input => declare.mutate(input)}
              onDone={() => setAdding(false)}
            />
          ) : relationList.length === 0 && !relations.isLoading && !relations.isError ? null : (
            // Liste vide : le geste est porté par l'état vide lui-même, plus bas — une seule fois.
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" aria-hidden />
              {t('mine.add')}
            </Button>
          )}
          {/* Refonte Théo — les états se NOMMENT (chargement, échec, vide), jamais un silence. */}
          {relations.isLoading ? <ScreenState state="loading" title={t('mine.loading')} /> : null}
          {relations.isError ? <ScreenState state="error" title={t('mine.error')} /> : null}
          {!relations.isLoading && !relations.isError && relationList.length === 0 && (
            <ScreenState
              state="empty_never"
              title={t('mine.emptyTitle')}
              message={t('mine.empty')}
              action={adding ? null : { label: t('mine.add'), onClick: () => setAdding(true) }}
            />
          )}
          {/* Le filtre du bandeau ne peut PAS rendre une liste vide (une
              pastille à zéro est désactivée), mais il peut le devenir après un
              changement d'étape — et le silence se lirait alors « plus aucun
              partenaire ». */}
          {relationList.length > 0 && visibleRelations.length === 0 && (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('band.emptyFiltered')}
            </Text>
          )}
          {/* #1799 (résidu du 10/09) — LA RÈGLE, DITE UNE FOIS POUR LA LISTE.
              Mesuré en production : 7 partenaires « sans histoire » répétaient
              chacun le même paragraphe de 45 mots (`flow.uncounted`) — juste,
              mais une explication de RÈGLE se dit une fois, pas une fois par
              ligne (le « blabla en gris » de #1818.3, famille non balayée
              ici). Chaque carte garde son état COURT (`PartnerFlowLine` ci-
              dessus) ; l'explication complète ne disparaît PAS — elle vit ici,
              et seulement quand elle sert à au moins une carte affichée. */}
          {anyFlowUncounted && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('flow.uncounted')}
            </Text>
          )}
          {visibleRelations.map((relation, index) => (
            <PartnerRelationCard
              key={relation.id}
              relation={relation}
              flow={visibleFlows[index]!}
              busy={move.isPending || declareClause.isPending}
              onStage={stage => move.mutate({ id: relation.id, stage })}
              onClause={value => declareClause.mutate({ id: relation.id, value })}
              consultants={consultants.data ?? []}
              onGovernanceSave={patch => saveGovernance.mutate({ id: relation.id, patch })}
              governanceSaving={saveGovernance.isPending}
              autoFocus={relation.id === highlightPartnerId}
            />
          ))}
        </Box>
      )}

      {/* #1798 — le calcul ne PART qu'à l'ouverture de cet onglet (`enabled`
          dans `DiscoverProfileMatches`), pas au chargement de l'écran entier :
          c'est la borne de coût posée côté client. */}
      {tab === 'discover' && <DiscoverProfileMatches />}

      {tab === 'onAccounts' && (
        <Box display="flex" className="flex-col gap-2">
          {/* #1430 — « chaque vue doit avoir ses propres KPIs ». Celui-ci est
              le seul que la source permet : combien d'ESN distinctes sont en
              place, et sur combien de tes comptes. Il se COMPTE sur ce que la
              route rend (plafonnée à 50 ESN côté service) — le dénominateur
              est donc celui de la liste affichée, et la phrase le dit. */}
          {onAccounts.data && onAccounts.data.length > 0 && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('onAccounts.summary', {
                esn: onAccounts.data.length,
                accounts: onAccounts.data.reduce((sum, esn) => sum + esn.accounts, 0),
                rank1: onAccounts.data.reduce((sum, esn) => sum + esn.rank1, 0),
              })}
            </Text>
          )}
          {onAccounts.data?.length === 0 && (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('onAccounts.empty')}
            </Text>
          )}
          {/* #1799.2 puis #1799 (résidu) — « il faudrait pouvoir cliquer,
              interagir avec les ESN ». #1799.2 avait rendu chaque ligne
              atteignable via un vrai `<Link>` « Analyser » — déjà mieux qu'un
              `Card` nu, mais pas « le même geste » que la modale à flèches de
              l'onglet Partenaires d'une fiche compte (#1818.1). Ici, la
              carte ENTIÈRE ouvre cette modale, RÉUTILISÉE telle quelle
              (`EsnOnAccountsDetailModal`, `BrowsableDialog` — #1797) plutôt
              qu'une seconde construite pour ce seul onglet. Le lien
              « Analyser » a déménagé DANS la modale : un `<button>` ne peut
              pas envelopper un second élément interactif (`<a>`), et cette
              carte porte désormais les deux gestes côte à côte plutôt qu'un
              seul imbriqué dans l'autre. */}
          <ResponsiveTable
            rows={onAccounts.data ?? []}
            rowKey={esn => esn.name}
            scrollLabel={t('tabs.onAccounts')}
            onRowClick={esn => setOnAccountsOpenIndex((onAccounts.data ?? []).indexOf(esn))}
            columns={[
              {
                key: 'esn',
                header: t('onAccounts.columns.esn'),
                mobile: 'title',
                render: esn => (
                  <button
                    type="button"
                    onClick={() => setOnAccountsOpenIndex((onAccounts.data ?? []).indexOf(esn))}
                    aria-label={t('onAccounts.openDetailAria', { name: esn.name })}
                    className="flex items-center gap-2 text-left font-medium pointer-coarse:min-h-11"
                  >
                    <span
                      aria-hidden
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
                    >
                      {esn.name.trim().slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate">{esn.name}</span>
                  </button>
                ),
              },
              {
                key: 'accounts',
                header: t('onAccounts.columns.accounts'),
                render: esn => <Badge variant="info">{t('onAccounts.accounts', { count: esn.accounts })}</Badge>,
              },
              {
                key: 'rank1',
                header: t('onAccounts.columns.rank1'),
                // Une absence ne fait aucune puce : pas de rang 1, pas de « 0 ».
                render: esn =>
                  esn.rank1 > 0 ? <Badge variant="primary">{t('onAccounts.rank1', { count: esn.rank1 })}</Badge> : null,
              },
              {
                key: 'certainty',
                header: t('onAccounts.columns.certainty'),
                // #1799 — la certitude voyage à PART, jamais dans le nom.
                // Absente (fenêtre de déploiement) ou `null` : aucune pastille, jamais une valeur devinée.
                render: esn =>
                  esn.certainty ? (
                    <Badge
                      variant={esn.certainty === 'faible' ? 'warning' : esn.certainty === 'forte' ? 'success' : 'info'}
                    >
                      {t(`onAccounts.certainty.${esn.certainty}`)}
                    </Badge>
                  ) : null,
              },
            ]}
          />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('onAccounts.hint')}
          </Text>
        </Box>
      )}

      {/* #1799 — LA MODALE DE DÉTAIL, réutilisant `BrowsableDialog` — même
          principe que #1818.1 : « le premier qui en a besoin le pose là où le
          deuxième pourra le prendre », donc pas de seconde modale à flèches
          fabriquée ici. */}
      {onAccountsOpenIndex !== null && onAccounts.data?.[onAccountsOpenIndex] && (
        <EsnOnAccountsDetailModal
          esn={onAccounts.data[onAccountsOpenIndex]}
          index={onAccountsOpenIndex}
          total={onAccounts.data.length}
          onIndexChange={setOnAccountsOpenIndex}
          onClose={() => setOnAccountsOpenIndex(null)}
        />
      )}
    </Box>
  )
}

/**
 * #1799 — LE DÉTAIL D'UNE ESN TRANSVERSE, DANS LA MODALE.
 *
 * ⚠️ **Ce que « précédente »/« suivante » veulent dire ICI, et pourquoi ce
 * n'est PAS le même sens qu'à l'onglet Partenaires d'un compte (#1818.1).**
 * Là-bas, les flèches parcourent les ESN EN PLACE CHEZ CE COMPTE (« 3 sur
 * 6 »). Ici, l'onglet « Sur mes comptes » est TRANSVERSE — une ligne par ESN,
 * tous comptes confondus (`GET /partners/on-my-accounts`) — donc les flèches
 * parcourent les ESN de CETTE liste-là : la même liste que l'écran affiche
 * déjà, dans le même ordre. « ESN suivante » veut dire « l'ESN suivante de ta
 * liste Sur mes comptes », pas « chez le même client » — il n'y a qu'UN
 * compte par ligne ici (le TOTAL de comptes où elle est en place), donc
 * aucune autre lecture n'est possible : `BrowsableDialog` reçoit exactement
 * le rang et le total de la liste COURANTE, comme son contrat l'exige.
 */
function EsnOnAccountsDetailModal({
  esn,
  index,
  total,
  onIndexChange,
  onClose,
}: {
  esn: {
    name: string
    accounts: number
    rank1: number
    certainty?: 'forte' | 'moyenne' | 'faible' | null
    accountsList?: { id: string; name: string }[]
    /** #2298.8 — externalWorkforceObserved : main-d'œuvre externe OBSERVÉE
     *  par la mémoire marché, tous rangs confondus. Distinct de `accounts`
     *  (déclaré/détecté dans le CRM de cet espace) et de `rank2Observations`
     *  ci-dessous (une source de plus, jamais la même mesure). */
    observedAtAccounts?: number
    /** #2298.8 — comptes non mesurables par la mémoire marché, JAMAIS
     *  confondus avec « non observée » (GA-259). */
    unresolvedAtAccounts?: number
    /** #2298.8 — rank2Potential : un CONSTAT daté et sourcé, jamais un score. */
    rank2Observations?: EsnRank2ObservationSummary
  }
  index: number
  total: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation('partnerPipeline')

  return (
    <BrowsableDialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      index={index}
      total={total}
      onIndexChange={onIndexChange}
      contentKey={esn.name}
      title={esn.name}
      description={t('onAccounts.dialogDescription')}
      labels={{ previous: t('onAccounts.previousEsn'), next: t('onAccounts.nextEsn') }}
    >
      <Box className="space-y-3 p-4">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Badge variant="outline">{t('onAccounts.accounts', { count: esn.accounts })}</Badge>
          {esn.rank1 > 0 && <Badge variant="secondary">{t('onAccounts.rank1', { count: esn.rank1 })}</Badge>}
          {esn.certainty && (
            <Badge
              variant={esn.certainty === 'faible' ? 'outline' : 'secondary'}
              style={esn.certainty === 'faible' ? { opacity: 0.65 } : undefined}
            >
              {t(`onAccounts.certainty.${esn.certainty}`)}
            </Badge>
          )}
        </Box>
        {/* #2298.8 — TROIS NOTIONS VOISINES, TROIS SOURCES (registre
            `.claude/notes/registre-2026-09-17-lau-039-2298.md`) :
            `observedAtAccounts`/`unresolvedAtAccounts` viennent de la MÉMOIRE
            MARCHÉ (externalWorkforceObserved — un tiers a observé cette ESN
            chez un client, tous rangs confondus) ; `rank2Observations` vient
            du CRM de CET ESPACE (rank2Potential — cette ESN a déjà été
            détectée agissant SPÉCIFIQUEMENT en rang 2). Ni l'une ni l'autre
            ne dit si l'ESN ACCEPTE le rang 2 — ça, c'est `openToSubcontracting`,
            ailleurs (onglet Découvrir, `esn_directory`), une DISPOSITION
            déclarée, pas un constat. Une valeur absente ne rend AUCUNE ligne
            (GA-18/GA-19) : jamais un « non observée » deviné. */}
        {(typeof esn.observedAtAccounts === 'number' && esn.observedAtAccounts > 0) ||
        (typeof esn.unresolvedAtAccounts === 'number' && esn.unresolvedAtAccounts > 0) ||
        esn.rank2Observations?.measured ? (
          <Box display="flex" className="flex-wrap items-center gap-2">
            {typeof esn.observedAtAccounts === 'number' && esn.observedAtAccounts > 0 && (
              <Badge variant="outline">
                {t('onAccounts.externalWorkforceObserved', { count: esn.observedAtAccounts })}
              </Badge>
            )}
            {typeof esn.unresolvedAtAccounts === 'number' && esn.unresolvedAtAccounts > 0 && (
              <Badge variant="outline" style={{ opacity: 0.65 }}>
                {t('onAccounts.observationUnresolved', { count: esn.unresolvedAtAccounts })}
              </Badge>
            )}
            {esn.rank2Observations?.measured && (
              <Badge variant="secondary">
                {t('onAccounts.rank2Observed', {
                  count: esn.rank2Observations.count,
                  date: formatDate(esn.rank2Observations.mostRecentAt),
                })}
              </Badge>
            )}
          </Box>
        ) : null}
        <Link
          to="/search"
          search={{ company: esn.name }}
          aria-label={t('onAccounts.analyseAria', { name: esn.name })}
          className="flex w-fit items-center gap-1 rounded-badge border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-2.5 py-1 text-xs text-[var(--accent-soft-text)] transition-colors hover:border-[var(--accent-soft-text)] pointer-coarse:min-h-11"
        >
          <Zap className="size-3" aria-hidden />
          {t('onAccounts.analyse')}
        </Link>
        {/* #2151.62 — les comptes eux-mêmes, pas seulement leur nombre : un
            seul chemin de lecture (GA-26) avec l'onglet écosystème de la
            fiche compte, qui lit la même table `account_partners`. Absent
            (fenêtre de déploiement) : la carte garde son seul badge de compte. */}
        {esn.accountsList && esn.accountsList.length > 0 && (
          <Box className="space-y-1.5">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('onAccounts.accountsListTitle')}
            </Text>
            <Box display="flex" className="flex-wrap gap-1.5">
              {esn.accountsList.map(account =>
                account.name ? (
                  <Link
                    key={account.id}
                    to="/accounts/$id"
                    params={{ id: account.id }}
                    className="rounded-full border border-[var(--bellum-border)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
                  >
                    {account.name}
                  </Link>
                ) : null,
              )}
            </Box>
          </Box>
        )}
      </Box>
    </BrowsableDialog>
  )
}
