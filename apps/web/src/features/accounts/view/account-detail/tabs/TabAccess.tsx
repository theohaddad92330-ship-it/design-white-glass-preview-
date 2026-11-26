import {
  ACCESS_MODES,
  ACCESS_STATUS_VALUES,
  ADDRESSABILITY_AXES,
  groupPersonalAccessPathsByVoie,
  isSegmentCollectionStale,
  segmentCapabilityAt,
  type AccessBarrier,
  type AccessCostEstimate,
  type DataforgeAccountAccess,
  type AccessFact,
  type AccessLevelFact,
  type AccessEntityAxis,
  type AccessEntityReasonFact,
  type AccessLockState,
  type AccessMode,
  type AccessModeFeasibility,
  type AccessStatusDeclaration,
  type Account,
  type AccountAccessLevel,
  type AccountMarketContext,
  type Addressability,
  type PartnerAccessContradiction,
  type PersonalAccessPath,
} from '@bellum/contracts'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { Badge, Box, Button, Card, CardContent, Input, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { entityFactText, entityScoreLine } from './entityScoreLine'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { BrowsableDialog } from '@/components/overlay/BrowsableDialog'
import { lastAnalyzedDate } from '../../../model/lastAnalyzed'
import { formatDate } from '@/lib/locale'
import { SegmentStaleCollectionNotice } from '../components/SegmentStaleCollectionNotice'
import { headcountContradictsHeader } from './headcountConsistency'
import { settleAccessEvidence } from './settleAccessEvidence'
import { useAccountCrmProvenance } from '@/features/crm/hooks/useAccountCrmProvenance'
import { ProcurementPractices } from './access/ProcurementPractices'
import { DataforgeAccessBlock } from './access/DataforgeAccessBlock'
import { DetailedReading } from '../components/DetailedReading'

/** #3504 — la capacité qui date l'effectif lu par la barrière d'achat (segment `signals`). */
const HEADCOUNT_CAPABILITY_ISSUE = '#3504'

/**
 * #3504 — « Proportion — Proportion — < 250… » : le libellé de certains axes
 * (`proportion`) s'ouvre déjà par le nom de l'axe, que la ligne préfixait une
 * seconde fois. Le nom de l'axe n'est ajouté que si le libellé ne le porte pas.
 */
/**
 * La raison du rang d'une entité, dite dans la langue de l'écran (#3473) ; le
 * texte FR du contrat ne sert que de repli.
 *
 * Un rang 1 SANS nom n'est PAS redit ici (#3562.3) : le badge de la même ligne
 * le porte (« un rang 1 est installé ») et le dire deux fois contredisait le
 * principe « rien n'apparaît deux fois ». Un rang 1 NOMMÉ reste dans la raison :
 * le badge ne porte pas le nom. Rend `''` quand il ne reste aucun fait à dire.
 */
export function entityReasonText(facts: AccessEntityReasonFact[] | undefined, fallback: string, t: TFunction): string {
  if (!facts) return fallback
  if (facts.length === 0) return t('entities.reasons.none')
  return facts
    .filter(fact => !(fact.code === 'rank1' && !fact.value))
    .map(fact => entityFactText(fact, t))
    .join(' · ')
}

function axisFactorLine(axisName: string, label: string): string {
  const own = label.trimStart().toLocaleLowerCase()
  const prefix = axisName.toLocaleLowerCase()
  return own === prefix || own.startsWith(`${prefix} —`) ? label : `${axisName} — ${label}`
}

/**
 * Le libellé d'un axe d'adressabilité : la clé traduite quand `label_key` est
 * là (posé côté IA depuis le 09/09 — `discover_scoring.py`), sinon `label` tel
 * quel. Un dossier analysé AVANT ce déploiement n'a pas `label_key` : ce repli
 * lui rend exactement l'affichage d'avant, en français — jamais une clé brute
 * ni un texte cassé.
 */
function axisFactorLabel(
  t: TFunction,
  factor: { label: string; label_key?: string; label_params?: Record<string, string | number> },
): string {
  if (!factor.label_key) return factor.label
  return t(factor.label_key, { ...(factor.label_params ?? {}), defaultValue: factor.label })
}

type Fresh = AccessFact & { freshness: 'fresh' | 'stale' | 'undated' }
type Community = {
  value: string | null
  isCommunity: boolean
  sourcesCount: number
  conflict: boolean
  communityAvailable: boolean
  values: { value: string; sourcesCount: number }[]
}
type Question = { moment: string; answers: string[] }
type Landscape = {
  lock: { state: AccessLockState; fact: Fresh | null }
  modes: { mode: AccessMode; feasibility: AccessModeFeasibility }[]
  cost: Fresh | null
  /** #4016.L4 — la déclaration de l'espace sur un compte au même verrou ; absent = ancien serveur. */
  costEstimate?: AccessCostEstimate | null
  /** Lot 776 — « Accès au compte · Base commune » ; absent ou null = pas de bloc. */
  dataforgeAccess?: DataforgeAccountAccess | null
  facts: Fresh[]
  entities: {
    id: string
    name: string
    kind: string
    rank1_incumbent: string
    score: number
    reason: string
    reason_facts?: AccessEntityReasonFact[]
    /** #4016 L9 — les axes sans fait, NOMMÉS sous le score (absent = ancien serveur). */
    missing_axes?: AccessEntityAxis[]
  }[]
  avoidGroupEntry: boolean
  /** #3473 — entités cartographiées par l'analyse, déclarées ou non (absent = ancien serveur). */
  analysisEntityCount?: number
  warning: { kind: string; date: string | null; label: string; url: string | null } | null
  /** La barrière d'achat DÉCOMPOSÉE, sans son avertissement — il est servi à
   *  côté, hors barème. `null` = pas d'estimation lisible pour ce compte. */
  barrier: Omit<AccessBarrier, 'warning'> | null
  /** Les cinq axes d'adressabilité (verrou · proportion · chemin · relation ·
   *  coût d'accès).
   *
   *  ⚠️ CORRIGÉ — ce commentaire disait « `null` aujourd'hui sur TOUT compte ».
   *  C'est FAUX depuis la PR #1689 (06/09/2026) : `phase1_research.py:1518`
   *  persiste `raw_analysis.addressability` à chaque analyse. Seul un compte
   *  analysé AVANT cette date porte encore `null` — et la carte le dit, plutôt
   *  que d'écrire un « 0/20 » qui se lirait « hors de portée ».
   *
   *  Trois axes sur cinq sont mesurables aujourd'hui — verrou, proportion, et
   *  la RELATION depuis #1631.5 (dès que le CRM connecté de l'ESN a retrouvé le
   *  compte). Les deux autres sont NOMMÉS avec leur raison dans la carte, et
   *  les raisons ne sont pas les mêmes : le chemin attend un ingrédient, le
   *  coût d'accès est un refus (il se déclare, il ne s'estime jamais). */
  addressability: Addressability | null
  /** #2298.4 — la date du dernier calcul de l'adressabilité (= le dernier
   *  `signals_collected_at`), pour dire honnêtement qu'un calcul est
   *  antérieur à la capacité `access_relation` (voir le docblock de
   *  `AccessLandscape.addressabilityCollectedAt` côté API). `null` = ce
   *  compte n'a jamais été analysé. */
  addressabilityCollectedAt: string | null
  /** #3504 — le serveur a sorti l'effectif périmé du calcul (barrière + proportion). */
  headcountToRecheck?: boolean
  community: Community | null
  question: Question | null
  /** #2646.1 (décision Louis 20/09/2026) — l'accès NOMMÉ : `direct` / `rang2` /
   *  `rang3_plus` / `inconnu`. Un état, jamais une probabilité. */
  accessLevel: AccountAccessLevel
  /** #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui fonde
   *  `accessLevel` : `null` seulement pour `inconnu`, où rien n'est établi. */
  accessLevelFact: AccessLevelFact | null
  /** #4802 — l'état d'accès POSÉ À LA MAIN (inconnu / référencé / à bâtir) ; `null` tant que personne ne l'a posé.
   *  `.optional()` : une API antérieure ne le rend pas. Il réordonne les interlocuteurs, jamais ne les filtre. */
  accessStatus?: AccessStatusDeclaration | null
  /** #3403 — les voies d'accès PERSONNELLES : par QUI, jamais par quelle
   *  structure (`modes` ci-dessus répond à cette seconde question). Voir le
   *  docblock du champ sur `AccessLandscape` (`account-access.service.ts`). */
  personalPaths: PersonalAccessPath[]
  /** #2130.102 — la même entité « concurrent » côté Partenaires ET verrouillée
   *  côté Accès (matrice minimale). `.optional()` : une API antérieure ne le
   *  rend pas. Vide = aucune ligne. */
  contradictions?: PartnerAccessContradiction[]
}

/** #2646.1 — la couleur suit l'état, jamais une seconde mesure : `direct` est
 *  la seule porte ouverte à coup sûr, `rang3_plus` la seule fermée à coup
 *  sûr, les deux autres restent neutres. */
const ACCESS_LEVEL_VARIANT: Record<AccountAccessLevel, 'success' | 'primary' | 'danger' | 'outline'> = {
  direct: 'success',
  rang2: 'primary',
  rang3_plus: 'danger',
  inconnu: 'outline',
}

/**
 * L'onglet Accès — « par où on entre chez ce compte » (tome 1 §13, BEL-ACC-003).
 *
 * L'organigramme dit qui travaille là. Cet onglet dit comment on rentre : ce qui
 * verrouille, les sept portes et leur faisabilité, ce que l'entrée coûte.
 *
 * La liste des ESN en place n'est PAS ici : elle vit dans l'onglet Partenaires,
 * où elle était déjà (décision de Louis du 22/08). Deux listes de la même chose
 * sur deux onglets donneraient deux vérités.
 */
/** #3777 (R41) — le rang 1 d'une entité est-il ÉTABLI (installé ou aucun) ? `unknown` n'est pas une voie. */
function isRank1Known(entity: { rank1_incumbent: string }): boolean {
  return entity.rank1_incumbent === 'yes' || entity.rank1_incumbent === 'no'
}

export function TabAccess({ account, firstName }: { account: Account; firstName?: string }) {
  const { t, i18n } = useTranslation('access')
  const { t: tAccounts } = useTranslation('accounts')
  // #4680 — des contacts CONNUS (import / CRM) déjà en base : la raison « ton CRM n'est pas connecté » serait fausse.
  const knownContactsCount = useAccountCrmProvenance()?.knownContacts?.count ?? null
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [cost, setCost] = useState('')
  // #2298.10 — le rang OUVERT dans `data.modes`, sur le modèle exact
  // d'`onAccountsOpenIndex` (`PartnerPipeline.tsx`, #1799) : `null` = fermée.
  const [modeDetailIndex, setModeDetailIndex] = useState<number | null>(null)

  /**
   * #1631.7 — « Densité d'écosystème ». MÊME donnée que le popover de la liste
   * (#1582) et le dossier (#1640.3) : `esn_observed`, servi par la même route
   * `GET /accounts/:id/market-context` — aucun champ nouveau.
   *
   * ⚠️ Interrogée directement par `apiFetch` + `useQuery`, comme le RESTE de
   * cet écran (`data`/`isLoading` ci-dessus), et PAS via `useAccountMarketContext`
   * : ce hook partagé gate sa requête sur `useSession()`, une dépendance que
   * `TabAccess` n'a jamais eue jusqu'ici. L'introduire ici aurait exigé un
   * `SessionProvider` autour de CHAQUE test de cet écran, y compris les deux
   * suites voisines (`TabAccess.barrier.test.tsx`,
   * `TabAccess.addressability.test.tsx`) qui n'ont rien à voir avec la mémoire
   * marché — « un hook qui fait tomber vingt tests d'à côté » est exactement
   * le défaut que ce choix évite. La clé de requête reste IDENTIQUE à celle du
   * hook partagé (`['accounts', 'market-context', id]`) : les deux écrans
   * partagent le même cache React Query, sans code partagé de plus.
   *
   * Binaire, pas un barème Forte/Moyenne/Faible sur le nombre brut — le retour
   * l'interdit explicitement (« ne pas dire "Compte saturé" sur le seul
   * nombre d'ESN »), et un seuil gradué sur un COMPTAGE brut serait
   * mécaniquement corrélé à la taille de l'entreprise, exactement comme pour
   * `paths_observed` (doctrine, `market-memory.ts`). La seule question posée
   * ici est « a-t-on observé au moins une ESN autour de ce compte ? » — pas
   * combien, pas depuis quand.
   */
  const { data: marketContext } = useQuery<AccountMarketContext | null>({
    queryKey: ['accounts', 'market-context', account.id],
    // #1608 — `?? null` : un compte non couvert rend un corps VIDE, donc
    // `undefined`, que React Query v5 refuse. La clé de cache est partagée avec
    // `useAccountMarketContext` (ci-dessus) : si une seule des deux portes
    // normalisait, la même entrée vaudrait `null` ou une erreur selon l'onglet
    // ouvert en premier.
    queryFn: async () =>
      (await apiFetch<AccountMarketContext | null>({ path: `/accounts/${account.id}/market-context` })) ?? null,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const ecosystemDense = Boolean(marketContext && marketContext.esn_observed > 0)

  const { data, isLoading } = useQuery({
    queryKey: ['access', account.id],
    queryFn: () => apiFetch<Landscape>({ path: `/accounts/${account.id}/access` }),
  })

  /**
   * Répondre à la question du moment — un clic, et la carte disparaît.
   *
   * Elle ne revient jamais : la trace est posée quand la question est SERVIE,
   * parce qu'on ne saura jamais qu'elle a été ignorée (tome 2 §24.1).
   */
  const answer = useMutation<{ recorded: boolean }, Error, { moment: string; answer: string }>({
    mutationFn: body =>
      apiFetch<{ recorded: boolean }, typeof body>({
        path: `/accounts/${account.id}/access/answer`,
        method: 'POST',
        body,
      }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['access', account.id] })
      // « Noté. Tu es le troisième à le dire » : la réciprocité rendue visible.
      // Sans elle, contribuer est un don ; avec elle, c'est un échange.
      toast.success(result.recorded ? t('question.thanksRecorded') : t('question.thanksNothing'))
    },
    onError: error => toast.error(t('question.failed'), { description: error.message }),
  })

  const declare = useMutation<AccessFact, Error, { kind: string; value: string; detail?: string }>({
    mutationFn: body =>
      apiFetch<AccessFact, typeof body>({ path: `/accounts/${account.id}/access`, method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access', account.id] })
      toast.success(t('declared'))
    },
    onError: error => toast.error(t('declareFailed'), { description: error.message }),
  })

  if (isLoading || !data) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }

  /** La date de l'analyse qui a produit la barrière. `null` sur un dossier qui
   *  n'a jamais terminé d'analyse — et l'écran le dit au lieu d'en inventer une. */
  const analyzedOn = lastAnalyzedDate(account)

  // #3504 — même critère que le bandeau `SegmentStaleCollectionNotice` (GA-26, un seul endroit décide),
  // daté sur la capacité #3504 elle-même : l'epoch `signals` avance avec chaque capacité suivante (#3922.3).
  const headcountCapabilityAt = segmentCapabilityAt('signals', HEADCOUNT_CAPABILITY_ISSUE)
  const headcountStale = headcountCapabilityAt
    ? isSegmentCollectionStale(account.signals_collected_at ?? null, headcountCapabilityAt)
    : false

  /**
   * #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui fonde le
   * badge d'accès, jamais l'état seul (doctrine : un score n'est jamais nu).
   * `null` (⇒ `inconnu`) ne rend RIEN ici : la ligne d'aide générique dit déjà
   * qu'aucun rang 1 n'est établi, en inventer une raison serait mentir.
   */
  const accessLevelFactLine = (fact: AccessLevelFact): string => {
    const entities = fact.entities.join(', ')
    if (fact.kind === 'no_incumbent') return t('level.fact.no_incumbent', { entities })
    if (fact.kind === 'incumbent_with_partner') {
      return t('level.fact.incumbent_with_partner', { entities, partner: fact.partner })
    }
    return t('level.fact.incumbent_without_partner', { entities })
  }

  /** Une information d'accès ne s'affiche JAMAIS sans sa source et sa date, et
   *  une information périmée le DIT plutôt que de disparaître (§10.3). */
  const provenanceLine = (fact: Fresh): string => {
    const when = fact.observed_at ? formatDate(new Date(fact.observed_at)) : null
    if (fact.freshness === 'stale' && when) return t('staleOn', { source: fact.source, date: when })
    if (fact.freshness === 'undated') return t('undated', { source: fact.source })
    return t('freshOn', { source: fact.source, date: when ?? '—' })
  }

  /** #4802 — l'état posé nomme QUI l'a déclaré et QUAND, comme toute information d'accès : c'est un auteur, pas
   *  une source de données (garde #1912.11). */
  const declaredStatusLine = (status: AccessStatusDeclaration): string =>
    status.observed_at
      ? t('freshOn', { source: status.source, date: formatDate(new Date(status.observed_at)) })
      : t('undated', { source: status.source })

  // #5106.8 — l'avertissement procédure collective reste visible en TÊTE de page (alerte, jamais repliée).
  const procedureWarning = (
    <>
      {/* L'avertissement hors barème (tome 3 §28). Il est SÉPARÉ du verrou et
          du score : une entreprise en redressement est souvent très joignable,
          et ranger « accessible » un compte qui ne signera pas est le piège que
          le tome nomme. Sans date, on le dit — taire un risque faute de date
          serait pire que l'afficher approximatif. */}
      {data.warning && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <Text size="sm" color="text-[var(--warning-soft-text)]">
              {data.warning.date
                ? t('warning.procedure_collective.dated', { date: formatDate(new Date(data.warning.date)) })
                : t('warning.procedure_collective.undated')}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('warning.procedure_collective.help')}
            </Text>
            {/* #3916.1 / #3922 — un risque qui justifie de ne pas engager de
                temps doit être VÉRIFIABLE d'un clic ; sans lien, on le dit
                plutôt que de laisser l'absence muette passer pour un fait
                aussi sûr qu'un fait prouvé. */}
            {data.warning.url ? (
              <a
                href={data.warning.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('warning.procedure_collective.openAnnouncement')}
              </a>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )

  return (
    <Box display="flex" className="flex-col gap-4">
      {procedureWarning}
      <ProcurementPractices account={account} firstName={firstName} />
      <DataforgeAccessBlock access={data.dataforgeAccess} />
      {/* #5106.8 — les blocs d'avant, dans leur ordre, sous la grille ; rien n'est retiré. */}
      <DetailedReading testId="access-detailed-reading" label={tAccounts('procurement.detailed')}>
        {/* #4802 — LE GESTE : poser l'état d'accès du compte. Il réordonne la liste des interlocuteurs (jamais ne la
          filtre, c76) ; une correction humaine gagne toujours. Absent = « Accès inconnu » ci-dessous, rien de plus. */}
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('status.title')}
            </Text>
            <Box display="flex" role="group" aria-label={t('status.title')} className="flex-wrap items-center gap-2">
              {ACCESS_STATUS_VALUES.map(value => (
                <Button
                  key={value}
                  size="sm"
                  variant={data.accessStatus?.state === value ? 'default' : 'outline'}
                  aria-pressed={data.accessStatus?.state === value}
                  disabled={declare.isPending}
                  className="min-h-11"
                  onClick={() => declare.mutate({ kind: 'access_status', value })}
                >
                  {t(`status.value.${value}`)}
                </Button>
              ))}
            </Box>
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t(`status.help.${data.accessStatus?.state ?? 'none'}`)}
            </Text>
            {data.accessStatus && (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {declaredStatusLine(data.accessStatus)}
              </Text>
            )}
          </CardContent>
        </Card>

        {/* #2646.1 — l'accès NOMMÉ, dès l'ouverture de l'onglet : un état, jamais
          une chance de réussite (doctrine refusée six fois). */}
        {/* #4802.2 — « Accès inconnu » ne reste pas dit à côté d'un état choisi (Référencé / À bâtir) : l'état posé parle, l'absence de rang n'est plus affichée. */}
        {!(
          data.accessLevel === 'inconnu' &&
          (data.accessStatus?.state === 'referenced' || data.accessStatus?.state === 'to_build')
        ) && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('level.title')}
              </Text>
              <Box display="flex" className="items-center gap-2">
                <Badge variant={ACCESS_LEVEL_VARIANT[data.accessLevel]}>{t(`level.state.${data.accessLevel}`)}</Badge>
              </Box>
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t(`level.help.${data.accessLevel}`)}
              </Text>
              {/* #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui
                fonde l'état, même mécanisme que la carte « verrou » ci-dessous
                (`provenanceLine`) : jamais un état sans ce sur quoi il repose. */}
              {data.accessLevelFact && (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {accessLevelFactLine(data.accessLevelFact)}
                </Text>
              )}
            </CardContent>
          </Card>
        )}

        {/* #3403 — LES VOIES D'ACCÈS PERSONNELLES : « par qui », jamais « par
          quelle structure » (les portes ci-dessous, `modes`, répondent à cette
          seconde question). Une voie sans instance ne rend AUCUNE ligne
          (doctrine « on n'affiche pas ce qu'on n'a pas ») : la carte entière
          disparaît plutôt que de montrer onze catégories vides. */}
        {data.personalPaths && data.personalPaths.length > 0 && <PersonalAccessPathsCard paths={data.personalPaths} />}

        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('lock.title')}
            </Text>
            <Box display="flex" className="items-center gap-2">
              <Badge variant={data.lock.state === 'inconnu' ? 'outline' : 'secondary'}>
                {t(`lock.state.${data.lock.state}`)}
              </Badge>
            </Box>
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t(`lock.help.${data.lock.state}`)}
            </Text>
            {data.lock.fact && (
              <>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {provenanceLine(data.lock.fact)}
                </Text>
                {data.lock.fact.detail && (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {data.lock.fact.detail}
                  </Text>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── LA BARRIÈRE D'ACHAT (tome 3 §4, §5.1 bloc 8, §8) ───────────────
          « Cette organisation sait-elle acheter à une ESN comme la tienne ? »
          — l'autre question, celle que le verrou ci-dessus ne pose pas. Un
          compte peut être parfaitement joignable ET totalement verrouillé
          (D71), et c'est ce cas-là qui coûte huit mois.

          Le calcul tournait à CHAQUE analyse et n'arrivait sur aucun écran du
          dossier : le service n'en tirait que deux booléens. On payait le
          calcul, personne ne le voyait.

          Trois règles, et elles sont toutes visibles ici :
          — le score n'est jamais nu : ses six proxies, chacun avec sa preuve ;
          — un proxy non mesuré est NOMMÉ et ne porte AUCUN chiffre ;
          — sous trois proxies mesurés, aucune classe — « non estimable » se
            dit, parce que le taire ferait lire l'absence comme une classe A. */}
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('barrier.title')}
            </Text>
            {data.barrier ? (
              // #3504 — la barrière s'écrit à la recherche Phase 1 (segment `signals`) : un compte
              // collecté avant la correction de l'effectif le DIT, il n'est jamais rejoué tout seul.
              <SegmentStaleCollectionNotice
                dimension="signals"
                collectedAt={account.signals_collected_at ?? null}
                i18nPrefix="accessTab.barrierStaleCollection"
                capabilityIssue={HEADCOUNT_CAPABILITY_ISSUE}
              />
            ) : null}
            {!data.barrier ? (
              /* Cassé et non mesurable se ressemblent : faire disparaître la
               carte laisserait croire que la capacité n'existe pas. Un « 0/10 »
               dirait « ouvert probable », c'est-à-dire l'inverse de la vérité. */
              <>
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {t('barrier.absent')}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('barrier.absentHelp')}
                </Text>
              </>
            ) : (
              <>
                {data.barrier.measurable && data.barrier.score !== null && data.barrier.access_class ? (
                  <Box display="flex" className="items-center gap-2">
                    {/* La CLASSE vient de sa clé (A/B/C/D) et non du libellé
                      renvoyé par le serveur : celui-ci est écrit en français
                      par le moteur, et l'afficher tel quel laisserait l'anglais
                      lire « Semi-ouvert ». Les BORNES, elles, restent au seul
                      endroit qui les possède — le moteur. */}
                    {/* ⚠️ Le paramètre s'appelle `value` et non `score` : GA-58
                      refuse tout `score` rendu par cet écran, parce que c'est
                      celui du RANG D'ENTRÉE d'une entité qu'elle protège. La
                      barrière est un homonyme, elle est exemptée nommément —
                      et une variable locale nommée `score` rouvrirait la porte
                      que la garde ferme. */}
                    <Badge variant="secondary">
                      {t('barrier.badge', {
                        label: t(`barrier.class.${data.barrier.access_class}`),
                        value: formatDecimal(data.barrier.score, i18n.language),
                      })}
                    </Badge>
                  </Box>
                ) : (
                  <Text size="sm" color="text-[var(--warning-soft-text)]">
                    {t('barrier.unmeasurable', {
                      proxies: data.barrier.missing.map(key => t(`barrier.proxies.${key}`, key)).join(', '),
                    })}
                  </Text>
                )}
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {data.barrier.measurable ? t('barrier.help') : t('barrier.unmeasurableHelp')}
                </Text>
                {/* La source ET la date. La barrière est estimée au moment de
                  l'analyse : sa fraîcheur est celle du dossier, et
                  `lastAnalyzedDate` est la seule dérivation qui la connaisse —
                  la refaire ici en donnerait deux, qui divergeraient. */}
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {analyzedOn
                    ? t('barrier.provenance', { date: formatDate(new Date(analyzedOn)) })
                    : t('barrier.provenanceUndated')}
                </Text>
                {data.barrier.proxies.map(proxy => (
                  <Box key={proxy.key} display="flex" className="items-start gap-2 py-0.5">
                    {/* ⚠️ Les couleurs sont l'INVERSE de celles d'un facteur de
                      score : ici une contribution POSITIVE monte la barrière,
                      donc elle bloque. Le vert d'un « +4,05 » se lirait comme
                      une bonne nouvelle alors qu'il désigne la porte la plus
                      dure du dossier.

                      Et un zéro MESURÉ reste neutre : « six établissements,
                      donc pas de décentralisation » est un fait vrai, ni un
                      blocage ni une ouverture. Le peindre en vert dirait
                      « bonne nouvelle » sur une mesure qui ne dit rien. */}
                    <Text
                      size="xs"
                      color={
                        proxy.measurable && proxy.contribution > 0
                          ? 'text-[var(--danger-soft-text)]'
                          : proxy.measurable && proxy.contribution < 0
                            ? 'text-[var(--success-soft-text)]'
                            : 'text-[var(--bellum-text-muted)]'
                      }
                      className="w-16 shrink-0 text-right"
                    >
                      {proxy.measurable ? formatSigned(proxy.contribution, i18n.language) : t('barrier.notMeasured')}
                    </Text>
                    <Box className="min-w-0">
                      <Text size="xs">{t(`barrier.proxies.${proxy.key}`, proxy.key)}</Text>
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {/* #3504 — l'effectif a UNE source (l'en-tête, relue à chaque affichage) :
                          une barrière écrite avant la correction de sa lecture ne le redit pas. */}
                        {proxy.key === 'effectif' &&
                        (data.headcountToRecheck ||
                          (proxy.measurable &&
                            (headcountStale || headcountContradictsHeader(proxy.evidence, account.employees))))
                          ? t('barrier.headcountStale')
                          : settleAccessEvidence(proxy.evidence)}
                      </Text>
                    </Box>
                  </Box>
                ))}
                {/* Les corrections DATÉES (§7) — la seule chose qui transforme un
                  « non » en rendez-vous. Elles s'affichent après les proxies
                  parce qu'elles s'appliquent après le score de base. */}
                {data.barrier.corrections.map(correction => (
                  <Text key={correction.key} size="xs" color="text-[var(--bellum-text-muted)]">
                    {/* `correction.label` est écrit en FRANÇAIS par
                      `access_scoring.correcting_signals` — traduit par son `key`
                      STABLE (`echeance_proche`), déjà transporté par le contrat.
                      Repli sur le libellé brut pour une correction future que ce
                      catalogue ne connaît pas encore. */}
                    {t(`barrier.corrections.${correction.key}`, correction.label)} — {correction.evidence}
                  </Text>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── L'ADRESSABILITÉ — les cinq axes (tome 1 §6) ────────────────────
          « Peux-tu ENTRER chez ce compte ? », face à « pourquoi c'est
          intéressant » (le score d'intérêt, ailleurs dans le dossier). Les
          deux ne se fondent jamais (§6.4) : un compte peut être parfait et
          hors de portée, et un score unique ne le dirait pas.

          ⚠️ CORRIGÉ #1606/#1631 — ce commentaire disait « aucun producteur
          ne l'écrit encore » ; c'est FAUX depuis la PR #1689 (06/09/2026,
          #1580/#1579) : `phase1_research.py:1518` pose désormais
          `raw_analysis.addressability` à CHAQUE analyse, comme la barrière
          juste au-dessus. Seul un compte analysé AVANT cette PR porte encore
          `data.addressability` à `null` — et la carte le dit honnêtement
          plutôt que d'inventer un score : cassé et non mesurable se
          ressemblent, un "0/20" dirait "hors de portée" là où la vérité est
          "pas encore recalculé depuis". */}
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('addressability.title')}
            </Text>
            {!data.addressability ? (
              <>
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {t('addressability.absent')}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('addressability.absentHelp')}
                </Text>
              </>
            ) : (
              <>
                {/* #2298.4 — L'AVEU DE FRAÎCHEUR DE L'AXE RELATION.
                  ACTIA (analysé avant la capacité) disait « CRM non connecté »,
                  LVMH (après) disait « CRM connecté » — deux comptes du même
                  espace se contredisant sur l'état d'un connecteur, mesuré en
                  production le 19/09. `raw_analysis.addressability` est un
                  résultat STOCKÉ au moment de l'analyse, jamais recalculé ici
                  (GA-26 : une dérivation vit à un seul endroit, côté IA) — ce
                  bandeau dit honnêtement lequel des deux calculs est
                  antérieur, plutôt que de laisser lire une contradiction comme
                  un fait. */}
                <SegmentStaleCollectionNotice
                  dimension="access_relation"
                  collectedAt={data.addressabilityCollectedAt}
                />
                {data.addressability.score !== null && data.addressability.max > 0 ? (
                  <Box display="flex" className="items-center gap-2">
                    {/* ⚠️ Le paramètre s'appelle `value` et non `score`, comme
                      pour la barrière ci-dessus : GA-58 refuse tout `score`
                      rendu par cet écran, parce que c'est celui du RANG
                      D'ENTRÉE d'une entité qu'elle protège. L'adressabilité
                      est un second homonyme, exemptée nommément — mais une
                      clé d'interpolation littéralement nommée `score`
                      resterait un mot « score » nu sur la ligne, même une
                      fois la lecture `.score` reconnue comme homonyme. */}
                    <Badge variant="secondary">
                      {t('addressability.badge', { value: data.addressability.score, max: data.addressability.max })}
                    </Badge>
                    {/* recette 10/09 — « 9/9 » se lit « accessibilité maximale »
                      alors que 2 axes sur 5 seulement ont pu être mesurés : le
                      CALCUL suit déjà la doctrine (`max` = la somme des seuls
                      axes mesurés, un axe non évaluable sort du dénominateur),
                      c'est l'AFFICHAGE qui ne disait pas sur combien d'axes le
                      score est établi. Un texte affiché à côté du chiffre,
                      jamais un `title=` (invisible au clavier et au tactile). */}
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('addressability.measuredOn', {
                        count: data.addressability.factors.length,
                        total: ADDRESSABILITY_AXES.length,
                      })}
                    </Text>
                  </Box>
                ) : (
                  <Text size="sm" color="text-[var(--warning-soft-text)]">
                    {t('addressability.notMeasured')}
                  </Text>
                )}
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {t('addressability.help')}
                </Text>
                {/* #2298.6 — un chemin se dit sans nommer personne : le facteur
                  'relation' (« un chemin existe dans ton équipe ») est rendu tel
                  quel, jamais recomposé depuis une donnée CRM — l'IA ne lui
                  transmet que l'EXISTENCE (`discover_scoring.py::_relation_axis`,
                  #1606.3), donc cet écran ne peut structurellement pas nommer un
                  collègue. */}
                {data.addressability.factors.map(factor => (
                  <Box key={factor.axis} display="flex" className="items-start gap-2 py-0.5">
                    <Text size="xs" className="w-16 shrink-0 text-right" color="text-[var(--bellum-text-muted)]">
                      {formatDecimal(factor.points, i18n.language)}
                    </Text>
                    <Box className="min-w-0">
                      <Text size="xs">
                        {axisFactorLine(
                          t(`addressability.axes.${factor.axis}`, factor.axis),
                          axisFactorLabel(t, factor),
                        )}
                      </Text>
                      {factor.evidence && (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {factor.evidence}
                        </Text>
                      )}
                      {/* #1606.6 — l'axe CHEMIN mesuré nomme une observation de la
                        mémoire marché « à qualifier » : la qualification elle-même
                        se fait dans Partenaires, où vit la liste des ESN (décision
                        de Louis du 22/08 — voir le docblock de la carte
                        « Densité d'écosystème » plus bas). Rendu SEULEMENT quand
                        l'axe est mesuré : sur un chemin non mesuré on ne sait pas
                        s'il y a quoi que ce soit à explorer. */}
                      {factor.axis === 'path' && (
                        <Box className="pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate({
                                to: '/accounts/$id',
                                params: { id: account.id },
                                search: { tab: 'partners' },
                              })
                            }
                          >
                            {t('addressability.pathCta')}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
                {/* ── CE QU'ON N'A PAS PU REGARDER, ET POURQUOI ───────────────
                  Nommer les axes ne suffisait pas : « Axes non mesurables :
                  Chemin, Relation, Coût d'accès. » se lit comme un trou dans
                  le produit, alors que les raisons sont DIFFÉRENTES et que
                  l'une d'elles est un refus assumé (le coût d'accès se
                  déclare, il ne s'estime jamais — D60). Chaque axe porte donc
                  sa raison, et deux d'entre elles sont ACTIONNABLES par le
                  commercial (compléter la taille de son ESN, connecter son
                  CRM). Aucun chiffre ici : un axe non mesuré n'a pas de
                  valeur, surtout pas « 0 ». */}
                {data.addressability.unmeasured.length > 0 && (
                  <>
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('addressability.unmeasuredTitle')}
                    </Text>
                    {data.addressability.unmeasured.map(axis => {
                      // `defaultValue: ''` sert d'INTERRUPTEUR, pas de repli : le
                      // contrat type `unmeasured` en `string[]`, donc un axe
                      // inconnu de cet écran reste NOMMÉ sans qu'on lui invente
                      // une raison. Les cinq axes du barème en ont une.
                      const reason =
                        axis === 'relation' && knownContactsCount !== null
                          ? t('addressability.unmeasuredReason.relationKnown', { count: knownContactsCount })
                          : t(`addressability.unmeasuredReason.${axis}`, { defaultValue: '' })
                      const line = reason
                        ? `${t(`addressability.axes.${axis}`, axis)} — ${reason}`
                        : t(`addressability.axes.${axis}`, axis)
                      // #1606.4 — le coût d'accès n'est PAS un axe qu'on n'a pas pu
                      // regarder : c'est un refus assumé (D60), déclaratif, et
                      // actionnable tout de suite (le champ juste plus bas sur cet
                      // onglet). Le rendre identique à « chemin » ou « relation »
                      // — deux axes qui, eux, ATTENDENT une donnée — fait lire un
                      // trou là où il y a une décision produit. Le badge distingue
                      // les deux familles, sans changer le texte de la raison.
                      if (axis === 'access_cost') {
                        return (
                          <Box key={axis} display="flex" className="items-start gap-2">
                            <Badge variant="outline" className="mt-0.5 shrink-0 px-1 py-0 text-xs">
                              {t('addressability.declarative')}
                            </Badge>
                            <Text size="xs" color="text-[var(--bellum-text-muted)]">
                              {line}
                            </Text>
                          </Box>
                        )
                      }
                      return (
                        <Text key={axis} size="xs" color="text-[var(--bellum-text-muted)]">
                          {line}
                        </Text>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* #2130.102 — Partenaires et Accès se contredisent : même mécanisme que
          l'avertissement ci-dessus (carte, texte d'alerte, aide). Aucune ligne
          quand rien ne se contredit. */}
        {data.contradictions && data.contradictions.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              {data.contradictions.map(item => (
                <Text key={item.partner_id} size="sm" color="text-[var(--warning-soft-text)]">
                  {t('contradiction.line', { name: item.partner_name })}
                </Text>
              ))}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('contradiction.help')}
              </Text>
            </CardContent>
          </Card>
        )}

        {/* Ce que les AUTRES espaces disent (tome 2 §25). Jamais qui le dit : deux
          ESN concurrentes contribuent sans le savoir. */}
        {data.community &&
          (data.community.isCommunity || data.community.communityAvailable || data.community.conflict) && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4">
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                  {t('community.title')}
                </Text>
                {data.community.communityAvailable ? (
                  <Text size="sm" color="text-[var(--bellum-text-muted)]">
                    {t('community.locked')}
                  </Text>
                ) : data.community.conflict ? (
                  <Text size="sm" color="text-[var(--bellum-text-muted)]">
                    {t('community.conflict', {
                      values: data.community.values
                        .map(v =>
                          t('community.value', { value: t(`lock.state.${v.value}`, v.value), count: v.sourcesCount }),
                        )
                        .join(' · '),
                    })}
                  </Text>
                ) : (
                  <Text size="sm">
                    {t('community.confirmed', {
                      value: t(`lock.state.${data.community.value ?? 'inconnu'}`, data.community.value ?? ''),
                      count: data.community.sourcesCount,
                    })}
                  </Text>
                )}
              </CardContent>
            </Card>
          )}

        {/* La question du moment — une par compte et par espace, un clic, jamais
          une fenêtre modale (tome 2 §24). */}
        {data.question && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <Text size="sm">{t(`question.ask.${data.question.moment}`)}</Text>
              <Box display="flex" className="flex-wrap items-center gap-2">
                {data.question.answers.map(value => (
                  <Button
                    key={value}
                    size="sm"
                    variant="outline"
                    disabled={answer.isPending}
                    onClick={() => answer.mutate({ moment: data.question?.moment ?? '', answer: value })}
                  >
                    {t(`question.answer.${value}`)}
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('modes.title')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('modes.help')}
            </Text>
            {data.modes.map(({ mode, feasibility }, index) => (
              <button
                key={mode}
                type="button"
                onClick={() => setModeDetailIndex(index)}
                aria-label={t('modes.openDetailAria', { mode: t(`modes.${mode}`) })}
                className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left pointer-coarse:min-h-11"
              >
                <Text size="sm">{t(`modes.${mode}`)}</Text>
                <Badge
                  variant={feasibility === 'available' ? 'secondary' : 'outline'}
                  className="px-1 py-0 text-xs"
                  style={feasibility === 'blocked' ? { opacity: 0.55 } : undefined}
                >
                  {t(`feasibility.${feasibility}`)}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* #2298.10 — LA ROUTE EN SEPT ÉLÉMENTS, PAR MODE (GA-26, un seul
          catalogue). Décision Louis du 21/09/2026, qui REMPLACE celle du
          20/09 sur le septième élément : la « route déconseillée » se rédige
          elle aussi PAR MODE, au même titre que les six autres — jamais une
          phrase unique pour toutes les portes. Une porte SANS raison écrite
          ne porte AUCUNE mention (doctrine « on n'affiche pas ce qu'on n'a
          pas ») ; le repli générique ne reste que si AUCUNE porte du
          catalogue n'en a une (`shouldShowAccessModeFallbackReason`). */}
        {modeDetailIndex !== null && data.modes[modeDetailIndex] && (
          <AccessModeDetailModal
            mode={data.modes[modeDetailIndex].mode}
            index={modeDetailIndex}
            total={data.modes.length}
            onIndexChange={setModeDetailIndex}
            onClose={() => setModeDetailIndex(null)}
          />
        )}

        {/* #1631.7 — « Densité d'écosystème » (Market Memory, tome 1 §13). La
          liste des ESN en PLACE reste dans l'onglet Partenaires (décision de
          Louis du 22/08, voir le docblock du composant) ; ici, uniquement une
          LECTURE — « l'environnement de ce compte a déjà des sociétés de
          services observées autour de lui » — sans jamais lister lesquelles
          ni combien.

          ⚠️ Aucun NO-GO automatique : ce n'est pas un blocage, seulement une
          invitation à qualifier davantage avant une approche directe — c'est
          pourquoi elle ne porte AUCUNE couleur d'alerte (ni `warning`, ni
          `danger`), contrairement à l'avertissement hors barème ci-dessus. */}
        {ecosystemDense && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('ecosystem.title')}
              </Text>
              <Badge variant="outline">{t('ecosystem.dense')}</Badge>
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('ecosystem.help')}
              </Text>
              <Box>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({ to: '/accounts/$id', params: { id: account.id }, search: { tab: 'partners' } })
                  }
                >
                  {t('ecosystem.cta')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* La porte de filiale, quand elle existe. « J'irais attaquer chacune des
          filiales plutôt que le siège » est le conseil que Théo donne de vive
          voix ; il vivait dans les prompts et dans le jeu de démonstration,
          jamais comme une recommandation à l'écran. */}
        {/* #3473 (Y18) — sans entité DÉCLARÉE le bloc se taisait (La Poste, prod) :
          il nomme maintenant l'absence, sans jamais classer une entité inventée. */}
        {data.entities.length === 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('entities.title')}
              </Text>
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {data.analysisEntityCount && data.analysisEntityCount > 0
                  ? t('entities.absentKnown', { count: data.analysisEntityCount })
                  : t('entities.absentNone')}
              </Text>
            </CardContent>
          </Card>
        )}
        {data.entities.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('entities.title')}
              </Text>
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('entities.help')}
              </Text>
              {/* « Ne pas attaquer le siège » — la phrase du tome 3, affichée
                seulement quand la barrière la justifie (classe C ou D). Une
                barrière non estimable ne la déclenche PAS : écarter le groupe
                faute d'information reviendrait à conclure d'un silence. */}
              {data.avoidGroupEntry && (
                <Text size="sm" color="text-[var(--warning-soft-text)]">
                  {t('entities.avoidGroup')}
                </Text>
              )}
              {data.entities.filter(isRank1Known).map(entity => {
                const reasonLine = entityReasonText(entity.reason_facts, entity.reason, t)
                const scoreLine = entityScoreLine(entity, t)
                return (
                  <Box key={entity.id} display="flex" className="items-start justify-between gap-2 py-0.5">
                    <Box>
                      <Text size="sm">{entity.name}</Text>
                      {/* La RAISON de son rang. Un classement sans raison est un
                      classement qu'on subit — et celui-ci décide par où un
                      commercial entre chez un groupe de 90 000 personnes. */}
                      {reasonLine && (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {reasonLine}
                        </Text>
                      )}
                      {/* #4016 L9 — le score ne sort que dans cette ligne, qui
                        porte avec lui les points de chaque axe et nomme ceux
                        qu'on n'a pas pu évaluer. */}
                      {scoreLine && (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {scoreLine}
                        </Text>
                      )}
                    </Box>
                    {/* Un rang 1 INSTALLÉ et un rang 1 INCONNU mènent à deux
                    stratégies opposées : dans un cas on cherche l'information,
                    dans l'autre on attaque en direct. Les afficher pareil
                    reviendrait à trancher à la place de l'utilisateur. */}
                    <Badge
                      variant={entity.rank1_incumbent === 'no' ? 'secondary' : 'outline'}
                      className="px-1 py-0 text-xs"
                    >
                      {t(`entities.rank1.${entity.rank1_incumbent}`)}
                    </Badge>
                  </Box>
                )
              })}
              {/* #3777 (R41) — « rang 1 inconnu » ×9 : une absence ne fait pas de ligne. Les entités dont le rang 1
                n'est pas établi se disent en UNE phrase (le compte ; jamais neuf pastilles identiques). */}
              {data.entities.some(entity => !isRank1Known(entity)) && (
                <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="entities-rank1-unknown">
                  {t(data.entities.some(isRank1Known) ? 'entities.rank1UnknownSome' : 'entities.rank1UnknownAll', {
                    count: data.entities.filter(entity => !isRank1Known(entity)).length,
                  })}
                </Text>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
              {t('cost.title')}
            </Text>
            {/* Jamais moyenné (D60) : une moyenne de marché appliquée à un cas
              particulier serait un chiffre inventé, et c'est sur ce chiffre qu'on
              négocie. #4016.L4 (Louis 11/10) — sans déclaration ICI, UNE
              déclaration de ton espace sur un compte au même verrou, badgée
              « estimé », nommée et datée ; jamais un coût d'un autre espace. */}
            {!data.cost && data.costEstimate ? (
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {data.costEstimate.value}
                </Text>
                <EstimatedBadge
                  basis={t('cost.estimateBasis', {
                    company: data.costEstimate.basis.companyName,
                    date:
                      formatDate(data.costEstimate.basis.observedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }) ?? data.costEstimate.basis.observedAt,
                  })}
                />
              </Box>
            ) : (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {data.cost ? data.cost.value : t('cost.unknown')}
              </Text>
            )}
            {data.cost && (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {provenanceLine(data.cost)}
              </Text>
            )}
            <Box display="flex" className="items-center gap-2 pt-1">
              <Input
                value={cost}
                maxLength={120}
                placeholder={t('cost.placeholder')}
                onChange={event => setCost(event.target.value)}
                className="max-w-sm"
              />
              <Button
                size="sm"
                disabled={cost.trim().length === 0 || declare.isPending}
                onClick={() => {
                  declare.mutate({ kind: 'cost', value: cost.trim() })
                  setCost('')
                }}
              >
                {t('cost.declare')}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {data.facts.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-1.5 p-4">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('history.title')}
              </Text>
              {/* Un fait périmé reste LISTÉ. Le supprimer ferait repartir de zéro
                un compte qu'on connaissait ; le garder sans le dater le ferait
                passer pour frais. */}
              {data.facts.map(fact => (
                <Box key={fact.id} display="flex" className="flex-col gap-0.5 py-0.5">
                  <Text size="sm">
                    {t(`kind.${fact.kind}`)} — {fact.value}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {provenanceLine(fact)}
                  </Text>
                </Box>
              ))}
            </CardContent>
          </Card>
        )}
      </DetailedReading>
    </Box>
  )
}

/**
 * #3403 — LA CARTE DES VOIES D'ACCÈS PERSONNELLES.
 *
 * Groupée par voie (`groupPersonalAccessPathsByVoie`, `@bellum/contracts`) —
 * jamais une liste plate qui mélangerait un ancien collègue et un partenaire
 * en rang 2. Une voie sans instance n'apparaît PAS : la fonction de
 * regroupement l'a déjà exclue avant que ce composant ne la voie.
 *
 * #3403.14 — chaque ligne dit sa CERTITUDE avant tout : une relation probable
 * ne se lit jamais comme un accès garanti, et le badge le porte, pas la seule
 * couleur (doctrine : un score — ici un état — n'est jamais nu).
 */
function PersonalAccessPathsCard({ paths }: { paths: PersonalAccessPath[] }) {
  const { t } = useTranslation('access')
  const groups = groupPersonalAccessPathsByVoie(paths)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
          {t('personalPaths.title')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('personalPaths.help')}
        </Text>
        {groups.map(group => (
          <Box key={group.voie} className="flex flex-col gap-1.5">
            <Text size="sm" weight="medium">
              {t(`personalPaths.voie.${group.voie}`)}
            </Text>
            {/* #3403.12 — la demande acceptable : une MÉTHODE fixe par voie,
                jamais une phrase inventée pour ce compte. Une fois par voie,
                pas répétée sur chaque ligne. */}
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`personalPaths.ask.${group.voie}`)}
            </Text>
            {group.items.map(item => (
              <Box
                key={item.id}
                display="flex"
                className="flex-col gap-0.5 rounded-md border border-[var(--bellum-border)] p-2"
              >
                <Box display="flex" className="items-center justify-between gap-2">
                  <Text size="sm" className="min-w-0 truncate">
                    {item.subject}
                  </Text>
                  {/* #3777 (décision 13/10) — la même pastille et le même prédicat que la liste Contacts. */}
                  <DecisionMakerBadge role={item.decisionRole} />
                  {/* #3403.14 — jamais garanti sans confirmation : le badge NOMME
                      la certitude, en variante neutre dès qu'elle n'est pas
                      vérifiée. */}
                  <Badge variant={item.certainty === 'verified_access' ? 'success' : 'outline'}>
                    {t(`personalPaths.certainty.${item.certainty}`)}
                  </Badge>
                </Box>
                {item.proof && (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('personalPaths.proof', { proof: item.proof })}
                  </Text>
                )}
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {item.observedAt
                    ? t('personalPaths.sourceSince', {
                        source: t(`personalPaths.source.${item.sourceKind}`),
                        date: formatDate(new Date(item.observedAt)),
                      })
                    : t('personalPaths.sourceUndated', { source: t(`personalPaths.source.${item.sourceKind}`) })}
                </Text>
                {/* #3403.12 — la chaleur du lien, seulement quand un humain l'a
                    DÉCLARÉE (jamais devinée, jamais « distant » par défaut). */}
                {item.warmth && (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('personalPaths.warmth', { level: t(`personalPaths.warmthLevel.${item.warmth}`) })}
                  </Text>
                )}
                {/* #3403.12 — l'action recommandée suit la CERTITUDE : on ne
                    pousse jamais une voie non confirmée comme acquise. */}
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t(`personalPaths.action.${item.certainty}`)}
                </Text>
                {/* #3403.16 — le risque nommé, jamais un chiffre inventé — et
                    absent quand rien ne le justifie. */}
                {item.risk && (
                  <Text size="xs" color="text-[var(--warning-soft-text)]">
                    {t(`personalPaths.risk.${item.risk}`)}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * #2298.10 — LE DÉTAIL D'UNE PORTE D'ENTRÉE, EN SEPT ÉLÉMENTS.
 *
 * Décision Louis du 20/09/2026 (QCM) : les sept éléments demandés — voie
 * recommandée · prérequis · première personne · question à poser · condition
 * suivante · repli · route déconseillée — se rédigent PAR MODE D'ACCÈS, à
 * partir de ce que le produit sait déjà (le catalogue des sept `AccessMode`,
 * déjà réel, `access.json`), jamais inventés. Le contenu vit en DONNÉES
 * relisibles (i18n, `modes.detail.<mode>.*`) — pas en dur dans ce composant —
 * pour que Louis puisse le relire et le corriger sans toucher au code.
 *
 * Décision Louis du 21/09/2026, qui REMPLACE celle du 20/09 sur le seul
 * septième élément : la « route déconseillée » N'EST PLUS une phrase unique
 * pour toutes les portes. Chaque porte déconseillée dit POURQUOI, écrite dans
 * le même catalogue et à la même place que les six autres (`notRecommended`,
 * dans `ACCESS_MODE_DETAIL_FIELDS`) — jamais une raison inventée : une porte
 * dont personne n'a écrit la raison ne porte AUCUNE mention (doctrine « on
 * n'affiche pas ce qu'on n'a pas », appliquée ici à une LISTE de champs).
 * `notRecommendedMissing` reste, mais seulement comme repli GLOBAL — tant
 * qu'aucune porte du catalogue n'a de raison écrite — pour ne jamais se taire
 * en silence sur une régression de contenu (`shouldShowAccessModeFallbackReason`).
 *
 * Réutilise `BrowsableDialog` (#1797), comme `EsnOnAccountsDetailModal`
 * (`PartnerPipeline.tsx`) — le premier qui en a besoin le pose là où le
 * deuxième peut le prendre, pas une seconde modale à flèches fabriquée ici.
 */
const ACCESS_MODE_DETAIL_FIELDS = [
  'recommendedPath',
  'prerequisite',
  'firstPerson',
  'questionToAsk',
  'nextCondition',
  'fallback',
  'notRecommended',
] as const

/**
 * #2298.10 — la raison déconseillée de chaque porte, QUAND elle est écrite.
 *
 * Une porte absente de cette table N'A PAS de raison — on ne lui en invente
 * pas une. `defaultValue: ''` sert d'INTERRUPTEUR, pas de repli : même
 * pattern que les axes non mesurés de l'adressabilité plus haut sur cet
 * écran (`addressability.unmeasuredReason.${axis}`).
 */
function accessModeNotRecommendedReasons(t: TFunction): Partial<Record<AccessMode, string>> {
  const reasons: Partial<Record<AccessMode, string>> = {}
  for (const candidate of ACCESS_MODES) {
    const reason = t(`modes.detail.${candidate}.notRecommended`, { defaultValue: '' })
    if (reason) reasons[candidate] = reason
  }
  return reasons
}

/**
 * #2298.10 — le repli GLOBAL : vrai tant qu'AUCUNE porte du catalogue ne
 * porte de raison déconseillée écrite.
 *
 * Fonction PURE, sans `t()`, pour rester exerçable même le jour où le contenu
 * réel couvre les sept portes — sinon cette branche ne serait plus jamais
 * testable qu'en truquant les fixtures i18n.
 */
export function shouldShowAccessModeFallbackReason(reasonsByMode: Partial<Record<AccessMode, string>>): boolean {
  return Object.keys(reasonsByMode).length === 0
}

function AccessModeDetailModal({
  mode,
  index,
  total,
  onIndexChange,
  onClose,
}: {
  mode: AccessMode
  index: number
  total: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation('access')

  return (
    <BrowsableDialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      index={index}
      total={total}
      onIndexChange={onIndexChange}
      contentKey={mode}
      title={t(`modes.${mode}`)}
      description={t('modes.dialogDescription')}
      labels={{ previous: t('modes.previousMode'), next: t('modes.nextMode') }}
    >
      <Box className="space-y-3 p-4">
        {ACCESS_MODE_DETAIL_FIELDS.map(field => {
          // #2298.10 — une porte SANS raison déconseillée écrite ne porte
          // AUCUNE mention : ni le label, ni une valeur inventée. Les six
          // autres champs sont toujours écrits pour les sept modes ; celui-ci
          // ne l'est pas forcément.
          const value =
            field === 'notRecommended'
              ? t(`modes.detail.${mode}.notRecommended`, { defaultValue: '' })
              : t(`modes.detail.${mode}.${field}`)
          if (field === 'notRecommended' && !value) return null
          return (
            <Box key={field} className="space-y-0.5">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t(`modes.detailLabels.${field}`)}
              </Text>
              <Text size="sm">{value}</Text>
            </Box>
          )
        })}
        {shouldShowAccessModeFallbackReason(accessModeNotRecommendedReasons(t)) && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('modes.detailLabels.notRecommendedMissing')}
          </Text>
        )}
      </Box>
    </BrowsableDialog>
  )
}

/**
 * Un nombre décimal dans la langue de l'utilisateur — « 6,1 » en français,
 * « 6.1 » en anglais.
 *
 * Écrit à la main (`score.toFixed(1)`), il aurait rendu « 6.1 » aux deux, et un
 * point décimal en français se lit comme une traduction oubliée. Deux décimales
 * au plus : la contribution du statut vaut 4,05 au centième, et l'arrondir au
 * dixième ferait que les six lignes ne retombent plus sur le total affiché
 * juste au-dessus — un écran qui ne s'additionne pas est un écran qu'on cesse
 * de croire.
 */
function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

/**
 * La même chose, mais SIGNÉE : « +4,05 » monte la barrière, « -0,8 » la baisse.
 * Le signe est ce qui permet de lire la colonne sans légende.
 *
 * `exceptZero` et non `always` : un proxy mesuré qui ne pèse rien — « six
 * établissements, donc pas de décentralisation » — s'écrit « 0 » et non
 * « +0 », qui suggérerait une contribution positive minuscule là où il n'y en a
 * aucune. Ce zéro-là est MESURÉ, donc il s'affiche ; celui d'un proxy non
 * mesuré ne s'affiche jamais, il porte le mot « non mesuré ».
 */
function formatSigned(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { signDisplay: 'exceptZero', maximumFractionDigits: 2 }).format(value)
}
