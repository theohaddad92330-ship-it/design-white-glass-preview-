import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Building2, ChevronRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import type {
  Consultant,
  Contact,
  InverseMatch,
  MarketContextMatch,
  MarketDemand,
  MarketRecruiter,
  MarketVerificationState,
  MarketVerificationStateRow,
  MatchNeed,
  MatchResult,
  PlacementTargets,
  RankedContact,
} from '@bellum/contracts'
import { deriveMatchVerdict } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  FilterChips,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@bellum/ui'
import { CustomerPage } from '@/components/page/CustomerPage'
import { TheoCard, TheoPill } from '@/components/page/theo-page-grammar'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatSignalDate } from '@/lib/signal-date'
import { Provenance } from '@/components/primitives/Provenance'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
// #2968 — les deux gestes de #2188 (ACTIONS) qui manquaient encore sur cette
// carte : « Créer une cible » et « Créer une opportunité ». Réemploi ASSUMÉ,
// même discipline que le matching inverse juste en dessous — ni l'un ni
// l'autre n'a de raison d'être réécrit pour ce sens de lecture.
import { useCreateTargetFromAccount } from '@/features/target-lists/useCreateTargetFromAccount'
import { CreateProjectDialog } from '@/features/projects/view/CreateProjectDialog'
// Réemploi assumé : l'appel qui déclenche le matching inverse existe déjà,
// journalisé et testé, dans la feature `matching`. Le dupliquer ici en
// écrirait un second qui dériverait du premier — cf. reverse-market.ts côté
// API, qui tient le même principe pour la veille territoriale.
import { matchingApi } from '@/features/matching/api'
import { TransparencyBanner } from '@/features/matching/view/TransparencyBanner'
// #1625 — le MÊME moteur que « Marché externe » n'est PAS réutilisable ici
// (celui-là lit la veille territoriale) : « Environnements compatibles »
// interroge `MarketMemoryService.searchByFilters`, déjà exposé côté web par
// #1626 (livré la nuit d'avant ce lot) pour Découvrir. Réutilisé TEL QUEL.
import { marketFitFor, sortByCompatibility } from '@/features/discover/lib/market-context'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import {
  useConsultant,
  useLaunchMarketVerifications,
  useMarketVerificationStates,
  useReverseMarket,
  useReverseMarketDismissedCompanies,
  useSetReverseMarketDismissed,
} from '../../hooks'
import { apiFetch } from '@/lib/api'
import { hasPermissions, useUserPermissions } from '@/lib/permissions'
import {
  accessStateFor,
  buildCompatibleEnvironmentsQuery,
  compatibleEnvironmentBuckets,
  consultantSkillsForFit,
  externalRecourseObserved,
  refusedTechnologyObservedAt,
  reverseMarketVerdictFor,
  type CompatibleEnvironmentBuckets,
  type ReverseMarketVerdict,
} from '../../lib/compatibleEnvironments'
import { talentNameText } from '../../lib/talentName'
import { useTalentSkills } from '../../talent-api'
import { MatchRadar } from '../../matching/MatchRadar'
import { RADAR_MAX_PROFILES, type RadarProfile } from '../../matching/radarGeometry'
import { CurrentSignalCell } from './CurrentSignalCell'
import { VerificationPlanDialog } from './VerificationPlanDialog'
import { ProposeProfileButton } from './ProposeProfileButton'
import { AccountsForTalentList } from './AccountsForTalentList'
import { MatchDirectionSwitch } from '@/features/matching/view/MatchDirectionSwitch'
import { groupNeedsByAccount } from './accountsForTalent'

/**
 * #2288.2 (décision Louis, 18/09/2026) — LANCER une vérification : le MÊME
 * lanceur qu'« Analyser » (`POST /analysis/start`, même corps par défaut que
 * `/search` et que les cartes du copilote — périmètre `groupe` omis). Le
 * serveur débite selon SON plan de lancement : 0 pour un dossier déjà analysé,
 * 0 en démo. `idempotent` : le démarrage est dédoublonné côté serveur (`jobId`
 * déterministe), un rejeu de transport ne débite pas deux fois.
 *
 * Il vit ICI, dans le module qui monte le devis (`VerificationPlanDialog`),
 * parce que GA-86 tient la route : un module qui fait partir une analyse monte
 * l'annonce de son coût.
 *
 * #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION : quand
 * l'entreprise candidate porte un SIREN déjà enregistré dans ce workspace
 * (`stateOf`, lu plus bas — jamais deviné depuis le nom), il accompagne le
 * lancement pour que l'entité analysée soit certaine. Sans SIREN connu :
 * comportement inchangé (`company_name` seul).
 */
function startVerificationAnalysis(companyName: string, siren?: string) {
  return apiFetch<{ accountId: string; launched?: boolean }, { company_name: string; siren?: string }>({
    path: '/analysis/start',
    method: 'POST',
    idempotent: true,
    body: siren ? { company_name: companyName, siren } : { company_name: companyName },
  })
}

/**
 * « Où placer ce profil ? » — la PROSPECTION INVERSÉE vue depuis un consultant
 * (PDF 5 §6.2, PDF 1 §Section 4, BEL-ATS-010).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX SOURCES, DEUX SECTIONS, LE MÊME PRINCIPE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §6.2 en nomme trois : les besoins ouverts de l'espace, les offres
 * publiées, les ESN qui recrutent. Cet écran montre les trois, mais ne les
 * calcule qu'à deux endroits :
 *
 *  - « Besoins internes » réutilise le matching inverse EXISTANT
 *    (`matchingApi.inverse`, déjà journalisé côté serveur) et l'illustre avec
 *    le radar 12 axes plutôt qu'une simple liste — la même donnée, lue une
 *    fois de plus ;
 *  - « Marché externe » lit `GET /consultants/:id/reverse-market`, qui lui-même
 *    ne fait QUE relire la veille territoriale déjà collectée.
 *
 * Aucune des deux ne collecte quoi que ce soit de nouveau.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE MATCHING INTERNE RESTE UN GESTE, PAS UN CHARGEMENT AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────
 * `match-inverse` JOURNALISE un run (c'est pour ça qu'il exige
 * `records:write` côté API). Le lancer au montage de l'écran créerait une
 * entrée de journal à chaque visite, pour quelqu'un qui n'a peut-être fait que
 * passer. `InverseMatchPanel` (l'écran existant) le sait déjà et demande un
 * clic — ce panneau applique la même règle plutôt que d'en inventer une autre.
 *
 * `reverse-market`, à l'inverse, est une LECTURE pure (aucun crédit, aucun
 * journal, la route est un `@Get`) : elle se charge sans geste, comme
 * n'importe quelle fiche.
 */
export function ReverseMarketPage({
  talentId,
  initialScope,
}: {
  talentId: string
  /** #1933.5 — la portée de « Besoins internes » amorcée depuis le lien (`?scope=`). */
  initialScope?: 'mine' | 'all'
}) {
  const { t } = useTranslation('consultants')
  const { data: talent } = useConsultant(talentId)
  const displayName = talentNameText(talent?.full_name ?? null, t('name.unnamed'))
  const firstName = displayName.split(/\s+/)[0] ?? displayName

  // Théo C talents-comptes (PR12) — en-tête de page (titre, phrase, « Retour au profil »), ligne d'état du talent,
  // puis la grille principale / latérale : le classement à gauche, « Pourquoi ces rapprochements ? » et « Avant de
  // présenter » à droite (sous la liste en mobile). Le marché externe est GARDÉ, replié sous le classement (A1).
  return (
    <CustomerPage
      pageTitle={t('reverseMarket.accounts.heading', { name: firstName })}
      pageSubtitle={t('reverseMarket.accounts.subtitle')}
      headerActions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/consultants/$id" params={{ id: talentId }}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('reverseMarket.back', { name: displayName })}
          </Link>
        </Button>
      }
    >
      <Box className="flex flex-col gap-5">
        {talent ? <TalentStatusLine talent={talent} talentId={talentId} displayName={displayName} /> : null}

        <Box className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Box className="flex min-w-0 flex-col gap-4" data-testid="reverse-market-main">
            <InternalNeedsSection
              talentId={talentId}
              talent={talent}
              firstName={firstName}
              initialScope={initialScope}
            />
            {/* Théo C talents-comptes.A1 (Q15, Louis 22/10) — le marché externe est GARDÉ, replié sous le classement :
                des offres publiées ne sont pas des comptes et ne se mêlent pas au rang 01-06. */}
            <details
              className="group rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 shadow-card"
              data-testid="reverse-market-external-fold"
            >
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-3 text-sm font-medium text-[var(--bellum-text-primary)]">
                <ChevronRight
                  className="size-4 text-[var(--bellum-text-muted)] transition-transform duration-immediate ease-bellum-out group-open:rotate-90"
                  aria-hidden="true"
                />
                {t('reverseMarket.accounts.externalFold')}
              </summary>
              <Box className="flex flex-col gap-4 pb-4">
                <ExternalMarketSection talentId={talentId} />
                <CompatibleEnvironmentsSection talent={talent} />
              </Box>
            </details>
          </Box>

          <Box as="aside" className="flex min-w-0 flex-col gap-4" data-testid="reverse-market-aside">
            {/* Théo C talents-comptes.N4 — « Pourquoi ces rapprochements ? » : le rang est expliqué, jamais noté. */}
            <TheoCard aria-label={t('reverseMarket.accounts.why.title')}>
              <h2 className="text-base font-semibold text-[var(--bellum-text-primary)]" data-testid="why-these-matches">
                {t('reverseMarket.accounts.why.title')}
              </h2>
              <Text size="sm" className="mt-2 leading-relaxed text-[var(--bellum-text-secondary)]">
                {t('reverseMarket.accounts.why.body')}
              </Text>
            </TheoCard>
            <BeforePresentingCard talentId={talentId} displayName={displayName} firstName={firstName} />
          </Box>
        </Box>
      </Box>
    </CustomerPage>
  )
}

/**
 * Théo C talents-comptes — `.status-line` : initiales, intitulé, lieu, disponibilité DÉCLARÉE (la fiche le dit, rien
 * n'est vérifié ici), puis les compétences en chips. Une valeur absente ne fait aucun morceau de ligne.
 */
function TalentStatusLine({
  talent,
  talentId,
  displayName,
}: {
  talent: Consultant
  talentId: string
  displayName: string
}) {
  const { t } = useTranslation('consultants')
  // Les trois premières compétences du référentiel de la fiche ; à défaut, la stack déclarée.
  const { data: skills } = useTalentSkills(talentId)
  const skillTags = (skills ?? []).slice(0, 3).map(skill => skill.rawLabel ?? skill.skill)
  const tags = skillTags.length > 0 ? skillTags : talent.stack.slice(0, 6)
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
  const availability =
    talent.availability && talent.availability !== 'inconnu' ? t(`availability.${talent.availability}`) : null
  const parts = [talent.title?.trim() || null, talent.location?.trim() || null].filter((part): part is string =>
    Boolean(part),
  )
  return (
    <Box
      className="flex flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3 sm:flex-row sm:items-center"
      data-testid="reverse-market-status-line"
    >
      <Box className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-xs font-semibold text-[var(--bellum-text-accent)]"
        >
          {initials}
        </span>
        <Text size="sm" className="min-w-0 text-[var(--bellum-text-secondary)]">
          {parts.length > 0 ? (
            <strong className="font-semibold text-[var(--bellum-text-primary)]">{parts[0]}</strong>
          ) : null}
          {parts.slice(1).map(part => ` · ${part}`)}
          {availability ? (
            <>
              {parts.length > 0 ? ' · ' : ''}
              {availability}{' '}
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('reverseMarket.accounts.declared')}
              </Text>
            </>
          ) : null}
        </Text>
      </Box>
      {tags.length > 0 ? (
        <Box className="flex flex-wrap gap-1.5 sm:ml-auto sm:justify-end">
          {tags.map(skill => (
            <TheoPill key={skill}>{skill}</TheoPill>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

/** « Besoins internes » — le matching inverse illustré par le radar 12 axes. */
function InternalNeedsSection({
  talentId,
  talent,
  firstName,
  initialScope,
}: {
  talentId: string
  talent: Consultant | undefined
  firstName: string
  /** #1933.5 — amorce la portée depuis `?scope=`, jamais resynchronisée : elle
   *  ne fait QUE présélectionner les puces, le classement reste un GESTE. */
  initialScope?: 'mine' | 'all'
}) {
  const { t } = useTranslation('consultants')
  const { t: tMatching } = useTranslation('matching')
  const [scope, setScope] = useState<'mine' | 'all'>(initialScope ?? 'all')
  const [run, setRun] = useState<InverseMatch | null>(null)
  const [loading, setLoading] = useState(false)

  const launch = () => {
    setLoading(true)
    matchingApi
      .inverse(talentId, scope)
      .then(setRun)
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setLoading(false))
  }

  // Les besoins les mieux alignés d'abord — TOUS, triés. #2551.4 rejoint
  // l'INTERLOCUTEUR du même compte compatible sous le radar, et ça exige
  // `need.accountId` : gardé en ENTIER, pas seulement les axes.
  const sortedNeeds = useMemo(() => {
    if (!run) return []
    return [...run.needs].sort((a, b) => b.result.pushableScore - a.result.pushableScore)
  }, [run])

  // #2712.1 — LE RADAR SEUL EST BORNÉ À `RADAR_MAX_PROFILES` (« 2 à 4 profils
  // superposés, au-delà on ne lit plus rien » — radarGeometry.ts). La LISTE
  // des interlocuteurs juste en dessous appliquait la MÊME borne sans le
  // dire : un consultant avec 5 besoins ou plus n'en montrait que 4, et rien
  // ne disait qu'il y en avait plus. Retour bêta #2712 : la cause n'était pas
  // le service de matching (sans seuil), c'était cet écran.
  const topNeeds = useMemo(() => sortedNeeds.slice(0, RADAR_MAX_PROFILES), [sortedNeeds])

  const accountRows = useMemo(
    () =>
      groupNeedsByAccount(
        sortedNeeds,
        talent ? consultantSkillsForFit({ stack: talent.stack, title: talent.title }) : [],
      ),
    [sortedNeeds, talent],
  )

  const profiles: RadarProfile[] = useMemo(
    () =>
      topNeeds.map(entry => ({
        id: entry.need.needId ?? entry.need.role,
        label: entry.need.accountName ? `${entry.need.role} · ${entry.need.accountName}` : entry.need.role,
        axes: entry.result.axes,
      })),
    [topNeeds],
  )

  return (
    <Card className="p-5">
      <Text element="h2" size="base" weight="semibold">
        {t('reverseMarket.internal.title')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('reverseMarket.internal.subtitle')}
      </Text>

      <TransparencyBanner />

      {/* Théo C projects-rapprochement.HT-7 — l'autre sens (Besoin → consultants) propose les besoins DÉJÀ classés par ce run. */}
      <Box className="mt-3">
        <MatchDirectionSwitch
          current="consultant"
          picker={
            sortedNeeds.filter(entry => entry.need.needId).length > 0 ? (
              sortedNeeds.flatMap(entry =>
                entry.need.needId ? (
                  <Link
                    key={entry.need.needId}
                    to="/projects/needs/$needId"
                    params={{ needId: entry.need.needId }}
                    search={{ tab: 'profiles' }}
                  >
                    <Button size="sm" variant="outline">
                      {entry.need.accountName ? `${entry.need.role} · ${entry.need.accountName}` : entry.need.role}
                    </Button>
                  </Link>
                ) : (
                  []
                ),
              )
            ) : (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {tMatching('direction.noPicker')}
              </Text>
            )
          }
        />
      </Box>

      <Box className="mt-3 flex flex-wrap items-center gap-2">
        <FilterChips
          ariaLabel={t('reverseMarket.internal.scopeAria')}
          options={[
            { value: 'all', label: t('reverseMarket.internal.scopeAll') },
            { value: 'mine', label: t('reverseMarket.internal.scopeMine') },
          ]}
          value={scope}
          onChange={next => next && setScope(next)}
        />
        <Button size="sm" onClick={launch} disabled={loading}>
          {loading ? t('reverseMarket.internal.loading') : t('reverseMarket.internal.launch')}
        </Button>
      </Box>

      {run ? (
        run.needs.length === 0 ? (
          <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
            {t('reverseMarket.internal.empty')}
          </Text>
        ) : (
          <Box className="mt-4 flex flex-col gap-4">
            {/* Théo C talents-comptes.R2 — UN classement de comptes ; le détail par besoin (radar, score, interlocuteurs) reste à un clic dessous. */}
            <AccountsForTalentList rows={accountRows} talentName={firstName} />
            <details data-testid="reverse-market-needs-detail">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                {t('reverseMarket.accounts.needsDetail')}
              </summary>
              <Box className="mt-3 flex flex-col gap-4">
                <MatchRadar profiles={profiles} title={t('reverseMarket.internal.title')} />
                {/* #2712.1 — le plafond du radar ne se lit plus dans la liste : un
                plafond d'affichage qui reste doit se NOMMER, celui-ci n'en a
                plus. `sortedNeeds` (TOUS) remplace `topNeeds` (4, radar
                seul). */}
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('reverseMarket.internal.found', { count: sortedNeeds.length })}
                </Text>
                {/* #2551.4 — interlocuteurs du compte compatible : jamais un second
                moteur de matching, juste la jointure `useContactsByAccount` +
                `useContactRanking` déjà branchée côté fiche compte. */}
                <Box className="flex flex-col gap-3">
                  {sortedNeeds.map(entry => (
                    <Box key={entry.need.needId ?? entry.need.role} className="flex flex-col gap-2">
                      <InverseNeedScore need={entry.need} result={entry.result} />
                      <AccountInterlocutorsCard need={entry.need} talentId={talentId} />
                    </Box>
                  ))}
                </Box>
              </Box>
            </details>
          </Box>
        )
      ) : null}
    </Card>
  )
}

/**
 * Théo C talents-comptes.A2 / A3 — « Avant de présenter {prénom} » : le consentement (RGPD) et le suivi du placement,
 * rangés sous le classement (sous la liste en mobile, jamais cachés). Même lecture que le marché externe : une seule requête.
 */
function BeforePresentingCard({
  talentId,
  displayName,
  firstName,
}: {
  talentId: string
  displayName: string
  firstName: string
}) {
  const { t } = useTranslation('consultants')
  const { data: market } = useReverseMarket(talentId)
  return (
    <TheoCard aria-label={t('reverseMarket.accounts.before.title', { name: firstName })}>
      <div data-testid="before-presenting">
        <h2 className="text-base font-semibold text-[var(--bellum-text-primary)]">
          {t('reverseMarket.accounts.before.title', { name: firstName })}
        </h2>
        <Box className="mt-3 flex flex-col gap-3">
          {market ? <ConsentNotice state={market.consentState} /> : null}
          {market?.consentState === 'valid' ? (
            <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
              {t('reverseMarket.accounts.before.consentValid', { name: firstName })}
            </Text>
          ) : null}
          <div className="border-t border-[var(--bellum-border)]" aria-hidden="true" />
          <Button variant="plain" size="sm" className="w-fit" asChild>
            <Link
              to="/consultants/$id"
              params={{ id: talentId }}
              aria-label={t('reverseMarket.accounts.before.followAria', { name: displayName })}
            >
              {t('reverseMarket.accounts.before.follow')}
            </Link>
          </Button>
        </Box>
      </div>
    </TheoCard>
  )
}

/**
 * #2958.108 (recette recruteur) — CE besoin, et POURQUOI il ressort.
 *
 * Avec un seul besoin classé, le radar se tait (« il faut au moins deux
 * profils ») et la liste ne montrait que les interlocuteurs du compte : ni le
 * besoin, ni son score, ni ses axes — sous un bandeau qui promet « chaque score
 * est détaillé par axe ». Un classement qui ne dit pas ce qu'il classe est le
 * « matching opaque » que le GO #2208 refuse. Le verdict et la mesurabilité
 * viennent du contrat (mêmes règles que la carte du rapprochement direct), le
 * rendu des axes de la primitive partagée : aucun second calcul.
 */
function InverseNeedScore({ need, result }: { need: MatchNeed; result: MatchResult }) {
  const { t } = useTranslation(['matching', 'common'])
  const verdict = deriveMatchVerdict(result.bucket, result.exclusions)
  // La correspondance s'écrit en CLAIR (« Correspond : … · Manque : … »), jamais en points : on montre des faits.
  // Un axe sans mesure se NOMME sous le verdict — il ne compte ni dans « Correspond » ni dans « Manque ».
  const label = (axis: MatchResult['axes'][number]) => t(`matching:axes.${axis.axis}`)
  const matches = result.axes.filter(axis => axis.score !== null && axis.score >= MATCH_CLEAR_FROM).map(label)
  const missing =
    result.gaps.length > 0
      ? result.gaps
      : result.axes.filter(axis => axis.score !== null && axis.score < MATCH_CLEAR_FROM).map(label)
  const unevaluated = result.axes.filter(axis => axis.score === null).map(label)
  return (
    <Box data-testid={`inverse-need-score-${need.needId ?? need.role}`} className="space-y-1.5">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold">
          {need.accountName ? `${need.role} · ${need.accountName}` : need.role}
        </Text>
        <TheoPill tone={verdictTone(verdict)}>{t(`matching:verdict.${verdict}`)}</TheoPill>
      </Box>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('matching:scores.matches')}
        </Text>
        {' : '}
        {matches.length > 0 ? matches.join(', ') : t('matching:scores.nothingClear')}
        {' · '}
        <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('matching:scores.missing')}
        </Text>
        {' : '}
        {missing.length > 0 ? missing.join(', ') : t('matching:scores.nothingClear')}
      </Text>
      {unevaluated.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('matching:scores.unevaluated')} : {unevaluated.join(', ')}
        </Text>
      ) : null}
    </Box>
  )
}

/** Au-dessus de ce seuil un axe se lit « correspond » ; en dessous, « manque ». Le seuil ne s'affiche jamais. */
const MATCH_CLEAR_FROM = 70

function verdictTone(
  verdict: ReturnType<typeof deriveMatchVerdict>,
): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  switch (verdict) {
    case 'fortement_defendable':
      return 'success'
    case 'alternative':
    case 'a_qualifier':
      return 'warning'
    case 'non_defendable':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** #2551.4 — le nombre d'interlocuteurs montrés par compte : une voie d'accès
 *  rapide, pas un second onglet Contacts. La liste complète reste sur la fiche
 *  compte, à laquelle ce bloc renvoie. */
const MAX_INTERLOCUTORS = 3

/**
 * #2551.4 — « Depuis un consultant, voir les comptes compatibles + leurs
 * INTERLOCUTEURS (à qui envoyer) ».
 *
 * Le moteur « comptes compatibles » est celui de `InternalNeedsSection`
 * ci-dessus (le radar) — ce composant ne recalcule RIEN, il rejoint deux
 * lectures qui existent déjà et sont déjà branchées depuis la fiche compte :
 * `useContactsByAccount` (les fiches) et `useContactRanking` (l'ordre, sur
 * neuf axes NOMMÉS, aucun critère protégé — `apps/api/src/architecture/
 * protected-criteria.spec.ts` le garde côté serveur). Même patron de jointure
 * que `PriorityPathSection.tsx` (ranked + contacts, par `contact_id`).
 *
 * `need.accountId` est ce qui rend ce composant possible (#2551.1) :
 * `accountName` seul ne suffit pas pour aller chercher des interlocuteurs sans
 * risquer un compte homonyme. Un besoin sans compte rattaché (rare — une
 * opportunité sans compte) le DIT plutôt que de deviner.
 */
function AccountInterlocutorsCard({ need, talentId }: { need: MatchNeed; talentId: string }) {
  const { t } = useTranslation(['consultants', 'accountOrg'])
  const accountId = need.accountId ?? null
  const accountLabel = need.accountName ?? t('reverseMarket.internal.interlocutors.accountUnnamed')
  const testId = `account-interlocutors-${need.needId ?? need.role}`
  // #2968 — les deux gestes de #2188 n'existent QUE pour un compte CRM connu
  // (`accountId`) : « Environnements compatibles », lui, n'en porte aucun
  // (mémoire marché sans identité de compte) — voir la doc de la section.
  const createTarget = useCreateTargetFromAccount()
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

  const contactsQuery = useContactsByAccount(accountId)
  const rankingQuery = useContactRanking(accountId ?? '', {})

  // Le même patron de jointure que `PriorityPathSection.tsx:84-96` : le
  // classement fait foi, la fiche ne fait que lui prêter un nom.
  const contactsById = useMemo(
    () => new Map((contactsQuery.data ?? []).map(contact => [contact.id, contact])),
    [contactsQuery.data],
  )
  const rankedList = Array.isArray(rankingQuery.data?.ranked) ? rankingQuery.data.ranked : null
  const rankingUnavailable = rankingQuery.isError || (rankingQuery.data !== undefined && rankedList === null)

  const cards = useMemo(() => {
    if (!rankedList) return []
    return rankedList
      .flatMap(ranked => {
        const contact = contactsById.get(ranked.contact_id)
        return contact ? [{ contact, ranked }] : []
      })
      .slice(0, MAX_INTERLOCUTORS)
  }, [rankedList, contactsById])

  const loading = Boolean(accountId) && (contactsQuery.isLoading || rankingQuery.isLoading)

  return (
    <Box className="rounded-md border border-border p-3" data-testid={testId}>
      <Text size="sm" weight="medium">
        {t('reverseMarket.internal.interlocutors.title', { account: accountLabel })}
      </Text>

      {!accountId ? (
        // #2551.1 pose la fondation ; un besoin qui n'a exceptionnellement
        // aucun compte rattaché le DIT — jamais un rapprochement par nom seul.
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.internal.interlocutors.noAccountId')}
        </Text>
      ) : loading ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.internal.interlocutors.loading')}
        </Text>
      ) : rankingUnavailable ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.internal.interlocutors.unavailable')}
        </Text>
      ) : cards.length === 0 ? (
        // Zéro interlocuteur connu ≠ « 0 contact » : ça se DIT (GA-18/GA-19).
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.internal.interlocutors.none')}
        </Text>
      ) : (
        <Box className="mt-2 flex flex-col gap-2">
          {cards.map(({ contact, ranked }) => (
            <InterlocutorRow key={contact.id} contact={contact} ranked={ranked} />
          ))}
        </Box>
      )}

      {accountId ? (
        <Box className="mt-2 flex flex-wrap gap-2">
          <Link to="/accounts/$id" params={{ id: accountId }} search={{ tab: 'contacts' }}>
            <Button size="sm" variant="outline">
              {t('reverseMarket.internal.interlocutors.seeAccount')}
            </Button>
          </Link>
          {/* #2968 — crée une liste NEUVE dans « Mes cibles », ce compte comme
              premier élément — le seul geste que ce hook porte (voir sa doc) ;
              « ajouter à une cible EXISTANTE » resterait à construire. */}
          <Button
            size="sm"
            variant="outline"
            isLoading={createTarget.isPending}
            disabled={createTarget.isPending}
            onClick={() => createTarget.mutate({ accountId, companyName: need.accountName ?? null })}
          >
            {t('reverseMarket.internal.interlocutors.addToTarget')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreateProjectOpen(true)}>
            {t('reverseMarket.internal.interlocutors.createOpportunity')}
          </Button>
          {/* #5029.1 — proposer CE consultant à CE compte : un contact, une séquence relue à la main. */}
          <ProposeProfileButton
            consultantId={talentId}
            accountId={accountId}
            accountName={accountLabel}
            accountContext={need.role}
            contacts={contactsQuery.data ?? []}
          />
        </Box>
      ) : null}

      {createProjectOpen && (
        <CreateProjectDialog
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          accountId={accountId ?? undefined}
          onCreated={() => setCreateProjectOpen(false)}
        />
      )}
    </Box>
  )
}

/**
 * Une personne, son rang — jamais nu. Les axes ÉVALUÉS et leur raison
 * traduite (ce qui l'a fait monter), et ceux qui ne le sont pas (ce qui
 * manque pour fiabiliser le rang) — les mêmes traductions que
 * `PriorityPathSection`, jamais dupliquées sous un second jeu de clés.
 */
function InterlocutorRow({ contact, ranked }: { contact: Contact; ranked: RankedContact }) {
  const { t } = useTranslation(['consultants', 'accountOrg'])
  const axes = ranked.axes.map(axis => ({
    label: t(`accountOrg:priorityPath.axes.${axis.key}`),
    score: axis.points,
    detail: t(`accountOrg:priorityPath.reasons.${axis.reason}`),
  }))
  // GA-120 lit `features/consultants/view/**` pour un nom de TALENT (jamais un
  // nom de fichier de CV déposé, cf. `talentName.ts`) — `contact` est un
  // interlocuteur CRM, une entité différente que cette garde ne vise pas. Une
  // variable locale évite quand même la forme `{x.full_name}` qu'elle scanne.
  const contactName = contact.full_name

  return (
    <Box className="rounded-md border border-[var(--bellum-border)] p-2">
      <Box className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="medium">
          {contactName}
        </Text>
        <RoleBadge role={contact.decision_role ?? 'unknown'} />
        {contact.title ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {contact.title}
          </Text>
        ) : null}
      </Box>
      <Box className="mt-1">
        <ScoreWithAxes
          score={ranked.score}
          max={ranked.max ?? 0}
          axes={axes}
          reason={t('accountOrg:priorityPath.card.noScore')}
        />
      </Box>
    </Box>
  )
}

/** « Marché externe » — offres publiées et ESN qui recrutent sur la zone. */
function ExternalMarketSection({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')
  const { data: market, isLoading } = useReverseMarket(talentId)

  return (
    <Card className="p-5">
      <Text element="h2" size="base" weight="semibold">
        {t('reverseMarket.external.title')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('reverseMarket.external.subtitle')}
      </Text>

      {isLoading ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.external.loading')}
        </Text>
      ) : !market ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.external.loading')}
        </Text>
      ) : (
        <Box className="mt-3 flex flex-col gap-4">
          {market.unavailableReason ? (
            <>
              <UnavailableNotice reason={market.unavailableReason} unresolvedZones={market.unresolvedZones} />
              {market.placementTargets ? <PlacementTargetsSection targets={market.placementTargets} /> : null}
            </>
          ) : (
            <>
              {/* LUD.4 bis — un métier hors informatique : les entreprises cibles du métier, à la place
                  des relevés d'ESN et de technologies (qui n'ont aucun sens pour lui). */}
              {market.placementTargets ? (
                <PlacementTargetsSection targets={market.placementTargets} />
              ) : (
                <>
                  <DemandTable demand={market.demand} />
                  <RecruitersTable recruiters={market.recruiters} />
                </>
              )}
            </>
          )}
        </Box>
      )}
    </Card>
  )
}

/**
 * Le consentement (c45, tranché le 28/08 — ne pas durcir).
 *
 * `expired` est le SEUL refus dur du produit — mais ce que cet écran REND est
 * une lecture, pas un positionnement : le refus porte sur l'ACTE (proposer
 * cette personne), pas sur l'affichage du marché. `none` avertit et laisse
 * passer, décision journalisée côté service.
 */
function ConsentNotice({ state }: { state: 'none' | 'valid' | 'expiring' | 'expired' }) {
  const { t } = useTranslation('consultants')
  if (state === 'valid') return null
  if (state === 'expired') {
    return (
      <Box role="alert" className="rounded-md border border-[var(--bellum-danger)] p-3">
        <Text size="sm" weight="medium" className="text-[var(--danger-soft-text)]">
          {t('reverseMarket.consent.expired')}
        </Text>
      </Box>
    )
  }
  return (
    <Box role="note" className="rounded-md border border-border bg-[var(--bellum-surface-2)] p-3">
      <Text size="sm" className="text-[var(--warning-soft-text)]">
        {t(`reverseMarket.consent.${state}`)}
      </Text>
    </Box>
  )
}

function UnavailableNotice({
  reason,
  unresolvedZones,
}: {
  reason: 'zones_missing' | 'skills_missing' | 'no_snapshot' | 'zones_unresolved'
  unresolvedZones: readonly string[]
}) {
  const { t } = useTranslation('consultants')
  return (
    <Text size="sm" className="text-[var(--bellum-text-muted)]">
      {reason === 'zones_unresolved'
        ? t('reverseMarket.unavailable.zones_unresolved', { zones: unresolvedZones.join(', ') })
        : t(`reverseMarket.unavailable.${reason}`)}
    </Text>
  )
}

/**
 * LUD.4 bis — « Où placer ce profil ? » pour un métier hors informatique : les ENTREPRISES qui recrutent CE
 * métier dans la zone, chacune avec ses offres DATÉES et les interlocuteurs que l'espace connaît déjà.
 * Un interlocuteur inconnu se dit, il ne s'invente pas ; sans résultat, l'écran NOMME le métier et la zone cherchés.
 */
function PlacementTargetsSection({ targets }: { targets: PlacementTargets }) {
  const { t } = useTranslation('consultants')
  const { roles, zones } = targets.searched
  const searchedText = t('reverseMarket.placement.searched', {
    roles: roles.length > 0 ? roles.join(', ') : t('reverseMarket.placement.unknownRole'),
    zones: zones.length > 0 ? zones.join(', ') : t('reverseMarket.placement.unknownZone'),
  })
  if (targets.companies.length === 0) {
    return (
      <Box>
        <Text size="sm" weight="medium">
          {t('reverseMarket.placement.title')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.placement.empty')} {searchedText}
        </Text>
      </Box>
    )
  }
  return (
    <Box>
      <Text size="sm" weight="medium">
        {t('reverseMarket.placement.title')}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {searchedText}
      </Text>
      <Box className="mt-2 overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('reverseMarket.placement.company')}</TableHead>
              <TableHead>{t('reverseMarket.placement.department')}</TableHead>
              <TableHead>{t('reverseMarket.placement.offers')}</TableHead>
              <TableHead>{t('reverseMarket.placement.contacts')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.companies.map(company => (
              <TableRow key={company.siren ?? company.name}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>
                  {company.department ?? <UnknownValue reason={t('reverseMarket.placement.departmentUnknown')} />}
                </TableCell>
                <TableCell>
                  <ul className="flex flex-col gap-1">
                    {company.offers.map(offer => (
                      <li key={`${offer.label}-${offer.date}`}>
                        {offer.url ? (
                          <a href={offer.url} target="_blank" rel="noreferrer noopener" className="underline">
                            {offer.label}
                          </a>
                        ) : (
                          offer.label
                        )}{' '}
                        <span className="text-[var(--bellum-text-muted)]">· {formatSignalDate(offer.date)}</span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell>
                  {company.knownContacts.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {company.knownContacts.map(contact => (
                        <li key={contact.name}>
                          {contact.name}
                          {contact.title ? (
                            <span className="text-[var(--bellum-text-muted)]"> · {contact.title}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <UnknownValue reason={t('reverseMarket.placement.noKnownContact')} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

/** « Les offres publiées, croisées avec la fiche » (§6.2) — une source PUBLIQUE, datée. */
function DemandTable({ demand }: { demand: readonly MarketDemand[] }) {
  const { t } = useTranslation('consultants')
  if (demand.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('reverseMarket.demand.empty')}
      </Text>
    )
  }
  return (
    <Box>
      <Text size="sm" weight="medium">
        {t('reverseMarket.demand.title')}
      </Text>
      <Box className="mt-2 overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('reverseMarket.demand.department')}</TableHead>
              <TableHead>{t('reverseMarket.demand.offers')}</TableHead>
              <TableHead>{t('reverseMarket.demand.matched')}</TableHead>
              <TableHead>{t('reverseMarket.demand.source')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {demand.map(row => (
              <TableRow key={row.department}>
                <TableCell>
                  <Text size="sm">{row.department}</Text>
                </TableCell>
                <TableCell>
                  {/* ⚠️ Jamais `offers ?? 0` : la source publique muette n'est pas
                      un département sans offre — « 0 » se lirait « ce
                      département est mort ». */}
                  {row.offers === null ? (
                    <UnknownValue reason={t('reverseMarket.demand.offersUnknown')} />
                  ) : (
                    <Text size="sm">{row.offers}</Text>
                  )}
                </TableCell>
                <TableCell>
                  {row.matchedTechnologies.length === 0 ? (
                    <Text size="sm" className="text-[var(--bellum-text-muted)]">
                      {t('reverseMarket.demand.noMatch', { total: row.technologiesRanked })}
                    </Text>
                  ) : (
                    <Text size="sm">
                      {row.matchedTechnologies.map(technology => technology.term).join(' · ')}
                      {t('reverseMarket.demand.rankedOf', {
                        matched: row.matchedTechnologies.length,
                        total: row.technologiesRanked,
                      })}
                    </Text>
                  )}
                </TableCell>
                <TableCell>
                  <Provenance source="public" observedAt={row.observedOn} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

/** « Les ESN qui recrutent sur sa zone » (§6.2) — le second marché. */
function RecruitersTable({ recruiters }: { recruiters: readonly MarketRecruiter[] }) {
  const { t } = useTranslation('consultants')
  if (recruiters.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('reverseMarket.recruiters.empty')}
      </Text>
    )
  }
  return (
    <Box>
      <Text size="sm" weight="medium">
        {t('reverseMarket.recruiters.title')}
      </Text>
      {/* ⚠️ « recrute SUR SA ZONE », jamais « recrute SON PROFIL » : la veille
          compte les offres par ESN et les technologies par département, sans
          jamais croiser les deux. */}
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('reverseMarket.recruiters.caveat')}
      </Text>
      <Box className="mt-2 overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('reverseMarket.recruiters.name')}</TableHead>
              <TableHead>{t('reverseMarket.recruiters.department')}</TableHead>
              <TableHead>{t('reverseMarket.recruiters.offers')}</TableHead>
              <TableHead>{t('reverseMarket.recruiters.baseline')}</TableHead>
              <TableHead>{t('reverseMarket.recruiters.openToSubcontracting')}</TableHead>
              <TableHead>{t('reverseMarket.demand.source')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recruiters.map(row => (
              <TableRow key={`${row.name}-${row.department}`}>
                <TableCell>
                  <Text size="sm">{row.name}</Text>
                </TableCell>
                <TableCell>
                  <Text size="sm">{row.department}</Text>
                </TableCell>
                <TableCell>
                  <Text size="sm">{row.offers}</Text>
                </TableCell>
                <TableCell>
                  {/* `null` = pas assez de relevés pour une habitude — jamais 0. */}
                  {row.baseline === null ? (
                    <UnknownValue reason={t('reverseMarket.recruiters.baselineUnknown')} />
                  ) : (
                    <Text size="sm">{row.baseline}</Text>
                  )}
                </TableCell>
                <TableCell>
                  {/* Trois états, jamais deux : « jamais déclaré » n'est pas « non ». */}
                  {row.openToSubcontracting === null ? (
                    <Badge variant="outline">{t('reverseMarket.recruiters.declaredUnknown')}</Badge>
                  ) : row.openToSubcontracting ? (
                    <TheoPill tone="success">{t('reverseMarket.recruiters.declaredYes')}</TheoPill>
                  ) : (
                    <Badge variant="outline">{t('reverseMarket.recruiters.declaredNo')}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Provenance source="public" observedAt={row.observedOn} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

/**
 * #1625 — « Environnements structurellement compatibles » : la troisième
 * lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC NE DIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────
 * Ni « Besoins » ni « Clients qui recrutent » (retour verbatim) : c'est une
 * lecture STRUCTURELLE de la mémoire marché — une trace du PASSÉ, jamais un
 * signal d'actualité. Le titre et le sous-titre le tiennent ; voir le test
 * qui vérifie qu'aucun mot d'actualité n'apparaît dans ce bloc précis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC RÉUTILISE, ET N'A PAS RÉÉCRIT
 * ─────────────────────────────────────────────────────────────────────────
 * `useMarketContextSearch` + `companiesApi.marketContextSearch` (#1626) pour
 * la lecture, `marketFitFor` / `sortByCompatibility`
 * (`@/features/discover/lib/market-context`) pour le fit expertise — le MÊME
 * calcul que l'ex-section « Marché observé » de Découvrir (retirée 31/10), donc la MÊME absence de
 * gradation Fort/Moyen que `MarketStructuralFitCard` a déjà tranchée.
 * `buildCompatibleEnvironmentsQuery` / `consultantSkillsForFit` (colocalisés,
 * `../../lib/compatibleEnvironments.ts`) ne font que transposer un CONSULTANT
 * en la même requête qu'un formulaire tapé à la main construirait — voir leur
 * documentation pour le choix de la zone comme discriminant serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC NE MESURE PAS, ET LE DIT
 * ─────────────────────────────────────────────────────────────────────────
 * « Signal actuel » NE PEUT PAS venir de la mémoire marché — une observation
 * du corpus n'est jamais une actualité, et l'afficher depuis `coverage`
 * contredirait la ligne du dessus. Aucune source ACTUELLE et DATÉE n'est
 * croisée avec ces entreprises dans ce lot (voir le rapport de lot) : la
 * colonne rend donc `UnknownValue` PARTOUT, jamais un chiffre inventé.
 * « Compte suivi » a la même réponse, pour une autre raison : la mémoire
 * marché ne joint aucune identité de compte CRM par doctrine (pas de SIREN
 * sur `MarketContextMatch`), et un rapprochement par NOM SEUL est le défaut
 * connu du dépôt (deux référentiels qui ne se joignent pas par le nom) —
 * mieux vaut le nommer que le deviner.
 */
function CompatibleEnvironmentsSection({ talent }: { talent: Consultant | undefined }) {
  const { t } = useTranslation('consultants')
  const [topOnly, setTopOnly] = useState(false)
  // #2288.2 — ÉTAPE 1, LA PRÉSÉLECTION. Purement locale : cocher n'appelle
  // personne et ne débite rien. Rien n'est envoyé tant qu'on n'a pas demandé
  // le devis.
  const [preselected, setPreselected] = useState<readonly string[]>([])
  const [planOpen, setPlanOpen] = useState(false)
  // #2968 — le tiroir replié des entreprises masquées, fermé par défaut : une
  // absence ne fait AUCUNE ligne dans la liste par défaut, elle ne se montre
  // que sur un geste délibéré de relecture.
  const [showDismissed, setShowDismissed] = useState(false)

  const query = talent
    ? buildCompatibleEnvironmentsQuery({ stack: talent.stack, zones: talent.zones, title: talent.title })
    : null
  const skills = talent ? consultantSkillsForFit({ stack: talent.stack, title: talent.title }) : []
  // #2336.5 / #2336.12-.15 — la restriction déclarée (§8.3, jamais lue ici
  // avant ce lot) : un AVERTISSEMENT porté par chaque ligne, jamais un
  // second calcul de fit ni un filtre — voir la doc de `refusedTechnologyObservedAt`.
  const refusedTechnologies = talent?.preferences?.refusedTechnologies ?? []
  const { data: read, isLoading } = useMarketContextSearch(query)

  // #2968 — les entreprises masquées par l'appelant sur CE consultant : un
  // geste personnel et gratuit, jamais une seconde suppression. Voir
  // `ReverseMarketDismissalService` côté API.
  const dismissedQuery = useReverseMarketDismissedCompanies(talent?.id)
  const dismissedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const name of dismissedQuery.data?.companies ?? []) set.add(name.trim().toLowerCase())
    return set
  }, [dismissedQuery.data])
  const setDismissed = useSetReverseMarketDismissed(talent?.id)

  const allMatches: readonly MarketContextMatch[] =
    read?.status === 'ok' ? sortByCompatibility(read.matches, skills) : []
  // #2968 — « on n'affiche pas ce qu'on n'a pas » : dans CETTE liste, une
  // entreprise masquée ne fait AUCUNE ligne. Les seaux, le verdict PRIORITÉ et
  // la synthèse chiffrée portent donc tous sur ce même ensemble FILTRÉ, jamais
  // sur `allMatches` — masquer change ce qu'on compte, pas seulement ce qu'on
  // montre.
  const matches = allMatches.filter(match => !dismissedKeys.has(match.companyName.trim().toLowerCase()))
  const dismissedMatches = allMatches.filter(match => dismissedKeys.has(match.companyName.trim().toLowerCase()))
  const shown = topOnly ? matches.slice(0, 5) : matches

  // #2288.2 — ÉTAPE 3, LA CONSERVATION, lue pour TOUTES les entreprises
  // affichées : c'est une lecture de nos propres reçus, elle ne coûte rien
  // (même frontière que `MARKET_MEMORY_FREE_READS`). Le dénominateur du seau
  // « vérifiés » est donc la liste MONTRÉE, jamais un sous-ensemble coché
  // (GA-259 — on mesure ce qu'on sait, sur ce qu'on affiche). Pas de mémo :
  // la clé de requête se hache sur le CONTENU, pas sur l'identité du tableau.
  const allNames = matches.map(match => match.companyName)
  // #2288.2 (décision Louis, 18/09/2026) — la route des MEMBRES : sans montant,
  // lisible par un `viewer`. Le devis, lui, reste derrière `analysis:run`.
  const conservation = useMarketVerificationStates(talent?.id, allNames)
  const states: readonly MarketVerificationStateRow[] | null = conservation.data?.states ?? null
  const stateOf = useMemo(() => {
    const index = new Map<string, MarketVerificationStateRow>()
    for (const entry of states ?? []) index.set(entry.companyName.trim().toLowerCase(), entry)
    return index
  }, [states])
  // #2288.4 (18/09, suite) — LE SIREN CONNU, prêt à voyager avec le lancement :
  // la MÊME lecture que la colonne « Vérification », jamais une seconde.
  const knownSirens = useMemo(() => {
    const index = new Map<string, string>()
    for (const [key, entry] of stateOf) if (entry.siren) index.set(key, entry.siren)
    return index
  }, [stateOf])

  // #2288.2 — le geste PAYANT n'existe que pour qui peut lancer une analyse.
  // Rôle inconnu = pas de geste : on ne devine pas un droit (la lecture, elle,
  // reste affichée pour tous).
  const access = useUserPermissions()
  const canVerify = access.status === 'known' && hasPermissions(['analysis:run'], access.permissions)

  const launch = useLaunchMarketVerifications(talent?.id, startVerificationAnalysis)
  // Ce qui n'est PAS parti, nommé — jamais un succès global quand il en manque.
  const [launchReport, setLaunchReport] = useState<{ failed: string[]; unknown: string[]; launched: number } | null>(
    null,
  )
  const buckets = compatibleEnvironmentBuckets(matches, states)

  function togglePreselected(companyName: string) {
    setPreselected(current =>
      current.includes(companyName) ? current.filter(name => name !== companyName) : [...current, companyName],
    )
  }

  /**
   * #2288.2 (décision Louis, 18/09/2026) — ÉTAPE 2, LA VÉRIFICATION : le geste
   * fait ce que le devis a annoncé, il lance TOUTES les entreprises cochées.
   *
   * Chacune passe par le MÊME lanceur qu'« Analyser », qui débite selon son
   * propre plan de lancement (0 pour un dossier déjà analysé, 0 en démo) — le
   * chiffre exact que le devis vient d'additionner. Aucun débit n'est écrit
   * ici (GA-26).
   *
   * Après : ce qui est parti sort de la présélection ; ce qui a ÉCHOUÉ y reste
   * et est NOMMÉ ; ce qui n'a pas pu être mesuré (temps dépassé) est nommé
   * aussi et n'est pas rejoué. Le toast de réussite n'apparaît QUE si tout
   * est parti.
   */
  function confirmVerification() {
    const companies = [...preselected]
    if (companies.length === 0) return
    setPlanOpen(false)
    setLaunchReport(null)
    launch.mutate(
      { companies, knownSirens },
      {
        onSuccess: results => {
          const failed = results.filter(result => result.outcome === 'failed').map(result => result.companyName)
          const unknown = results.filter(result => result.outcome === 'unknown').map(result => result.companyName)
          const launched = results.length - failed.length - unknown.length
          setPreselected(failed)
          setLaunchReport({ failed, unknown, launched })
          if (failed.length === 0 && unknown.length === 0) {
            toast.success(t('reverseMarket.verification.launchedAll', { count: launched }))
          }
        },
      },
    )
  }

  return (
    <Card className="p-5" data-testid="compatible-environments-section">
      <Text element="h2" size="base" weight="semibold">
        {t('reverseMarket.compatible.title')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('reverseMarket.compatible.subtitle')}
      </Text>

      {!query ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.compatible.noCriterion')}
        </Text>
      ) : isLoading ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.compatible.loading')}
        </Text>
      ) : read?.status === 'unavailable' ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.compatible.unavailable')}
        </Text>
      ) : matches.length === 0 ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('reverseMarket.compatible.empty')}
        </Text>
      ) : (
        <Box className="mt-3 flex flex-col gap-3">
          <Box className="flex flex-wrap items-center justify-between gap-2">
            {/* #2288.5 — QUATRE seaux, jamais un total unique : compatibles
                (ce qu'on SAIT, GA-259 — le dénominateur EST la longueur de la
                liste, pas une estimation), vérifiés (NOMMÉ « non mesuré »
                tant que #2288.2 n'existe pas — jamais un « 0 » qui mentirait,
                GA-18/GA-19), avec accès et en réserve. */}
            <CompatibleEnvironmentBucketsRow buckets={buckets} />
            <Box className="flex flex-wrap items-center gap-2">
              {/* #2288.3 — le geste payant est PROPOSÉ, jamais imposé : sans
                  présélection il n'apparaît pas, et rien d'autre sur cet écran
                  n'en dépend. */}
              {canVerify && preselected.length > 0 && (
                <Button
                  size="sm"
                  variant="black"
                  icon={ShieldCheck}
                  isLoading={launch.isPending}
                  disabled={launch.isPending}
                  onClick={() => setPlanOpen(true)}
                >
                  {t('reverseMarket.verification.cta', { count: preselected.length })}
                </Button>
              )}
              {matches.length > 5 && (
                <Button size="sm" variant="outline" onClick={() => setTopOnly(value => !value)}>
                  {topOnly ? t('reverseMarket.compatible.showAll') : t('reverseMarket.compatible.showTop')}
                </Button>
              )}
            </Box>
          </Box>

          {/* #2288.2 — le compte rendu d'un lancement groupé. Un échec est
              NOMMÉ, jamais noyé dans un succès global. */}
          {launchReport && launchReport.failed.length + launchReport.unknown.length > 0 ? (
            <Box className="flex flex-col gap-1" data-testid="verification-launch-report">
              {launchReport.launched > 0 ? (
                <Text size="sm">{t('reverseMarket.verification.launchedSome', { count: launchReport.launched })}</Text>
              ) : null}
              {launchReport.failed.length > 0 ? (
                <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
                  {t('reverseMarket.verification.launchFailed', { names: launchReport.failed.join(', ') })}
                </Text>
              ) : null}
              {launchReport.unknown.length > 0 ? (
                <Text size="sm" role="note" className="text-[var(--warning-soft-text)]">
                  {t('reverseMarket.verification.launchUnknown', { names: launchReport.unknown.join(', ') })}
                </Text>
              ) : null}
            </Box>
          ) : null}

          <Box className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {canVerify && <TableHead aria-hidden="true" />}
                  <TableHead aria-hidden="true" />
                  <TableHead>{t('reverseMarket.compatible.columns.company')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.verdict')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.zone')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.fit')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.restriction')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.externalRecourse')}</TableHead>
                  <TableHead className="min-w-48">{t('reverseMarket.compatible.columns.currentSignal')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.verification')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.access')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.followed')}</TableHead>
                  <TableHead>{t('reverseMarket.compatible.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(match => (
                  <CompatibleEnvironmentRow
                    key={match.companyName}
                    match={match}
                    skills={skills}
                    refusedTechnologies={refusedTechnologies}
                    canVerify={canVerify}
                    preselected={preselected.includes(match.companyName)}
                    onTogglePreselected={() => togglePreselected(match.companyName)}
                    verification={stateOf.get(match.companyName.trim().toLowerCase()) ?? null}
                    onDismiss={() => setDismissed.mutate({ companyName: match.companyName, dismissed: true })}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>

          {/* Neutre, comme l'ex-`marketContext.results.fitNoGrade` de Découvrir : une
              couleur « succès » sur `matched` lirait comme un jugement de
              valeur que ce fit ne prétend pas porter. */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.compatible.fitNoGrade')}
          </Text>
          {/* #2288.3 — LA DEMANDE STRUCTURELLE RÉPOND SEULE. Écrit à l'écran,
              pas seulement vrai dans le code : sans cette phrase, un tableau
              dont une colonne s'appelle « Vérification » se lit comme un
              tableau à moitié verrouillé. Rien ici n'est caché, grisé ni
              tronqué faute de vérification — c'est ce qui empêche cette
              capacité de devenir une rançon. */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.verification.optional')}
          </Text>
        </Box>
      )}

      {/* #2968 — le tiroir des masqués : replié par défaut (une absence ne
          fait aucune ligne dans la liste ci-dessus), une relecture DÉLIBÉRÉE
          les nomme avec le verdict ÉCARTÉ. Rendu HORS du bloc ci-dessus : si
          toutes les entreprises sont masquées, la liste principale se lit
          « vide » mais ce tiroir reste atteignable — masquer ne doit jamais
          rendre son propre geste irréversible faute de bouton pour le voir. */}
      {dismissedMatches.length > 0 && (
        <Box className="mt-3 flex flex-col gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={showDismissed ? EyeOff : Eye}
            onClick={() => setShowDismissed(value => !value)}
            className="self-start"
          >
            {t('reverseMarket.compatible.dismissed.toggle', { count: dismissedMatches.length })}
          </Button>
          {showDismissed && (
            <Box className="overflow-x-auto rounded-md border border-border" data-testid="dismissed-environments">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reverseMarket.compatible.columns.company')}</TableHead>
                    <TableHead>{t('reverseMarket.compatible.columns.verdict')}</TableHead>
                    <TableHead>{t('reverseMarket.compatible.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dismissedMatches.map(match => (
                    <TableRow key={match.companyName}>
                      <TableCell>
                        <Text size="sm" weight="medium">
                          {match.companyName}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <ReverseMarketVerdictBadge
                          verdict={reverseMarketVerdictFor({
                            coverage: match.coverage,
                            currentSignal: match.currentSignal ?? null,
                            dismissed: true,
                          })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={Eye}
                          onClick={() => setDismissed.mutate({ companyName: match.companyName, dismissed: false })}
                        >
                          {t('reverseMarket.compatible.dismissed.restore')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      )}

      {/* Monté SEULEMENT à l'ouverture : tant que personne n'a demandé de
          devis, rien ne lit le solde de crédits et rien n'est demandé au
          serveur. Un dialogue fermé qui interroge quand même est la version
          discrète de « la présélection coûte quelque chose ». */}
      {planOpen && (
        <VerificationPlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          talentId={talent?.id}
          companies={preselected}
          onConfirm={confirmVerification}
        />
      )}
    </Card>
  )
}

/**
 * #2288.5 — le résultat se lit en QUATRE seaux, jamais un total unique. Voir
 * la doc de `compatibleEnvironmentBuckets` (`compatibleEnvironments.ts`) pour
 * pourquoi `verified` est `null` — cette ligne NOMME l'absence de mesure
 * plutôt que d'afficher « 0 vérifiés », qui mentirait (GA-18/GA-19).
 */
function CompatibleEnvironmentBucketsRow({ buckets }: { buckets: CompatibleEnvironmentBuckets }) {
  const { t } = useTranslation('consultants')
  return (
    <Box className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="compatible-buckets">
      <Text size="sm">{t('reverseMarket.compatible.buckets.compatible', { count: buckets.compatible })}</Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]" aria-hidden="true">
        ·
      </Text>
      {buckets.verified === null ? (
        <Box className="flex items-center gap-1">
          <Text size="sm">{t('reverseMarket.compatible.buckets.verifiedLabel')}</Text>
          <UnknownValue reason={t('reverseMarket.compatible.buckets.verifiedUnmeasuredReason')} />
        </Box>
      ) : (
        <Text size="sm">{t('reverseMarket.compatible.buckets.verified', { count: buckets.verified })}</Text>
      )}
      <Text size="sm" className="text-[var(--bellum-text-muted)]" aria-hidden="true">
        ·
      </Text>
      <Text size="sm">{t('reverseMarket.compatible.buckets.withAccess', { count: buckets.withAccess })}</Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]" aria-hidden="true">
        ·
      </Text>
      <Text size="sm">{t('reverseMarket.compatible.buckets.reserve', { count: buckets.reserve })}</Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]" aria-hidden="true">
        ·
      </Text>
      {/* #2968 — le cinquième seau : combien portent déjà le verdict PRIORITÉ. */}
      <Text size="sm">{t('reverseMarket.compatible.buckets.priority', { count: buckets.priority })}</Text>
    </Box>
  )
}

/**
 * #2288.2 / #2288.3 — CE QUE LA VÉRIFICATION DIT D'UNE LIGNE, ET CE QU'ELLE NE
 * LUI FAIT PAS.
 *
 * Trois états NOMMENT une absence de mesure plutôt que de la taire :
 * « non vérifié » (personne ne l'a demandé — ce n'est pas un défaut de la
 * ligne), « non mesuré » (on a demandé, le temps a été dépassé : ce n'est pas
 * un échec et rien ne se relance tout seul), « à revérifier » (le fait a
 * vieilli et redevient inconnu — la ligne précédente est conservée, pas
 * supprimée). Aucun des trois ne grise, ne masque ni ne tronque quoi que ce
 * soit : la vérification reste FACULTATIVE.
 *
 * Tant que les états ne sont pas arrivés, la cellule reste muette — afficher
 * « non vérifié » pendant que la lecture est en vol dirait un fait qu'on n'a
 * pas encore lu.
 */
function VerificationStateCell({ row }: { row: MarketVerificationStateRow | null }) {
  const { t, i18n } = useTranslation('consultants')
  if (row === null) return null
  const state: MarketVerificationState = row.state
  // Une vérification porte SA date : celle d'hier n'est pas celle d'aujourd'hui.
  const date = verifiedOn(row.verifiedAt, i18n.language)
  const label = date
    ? t('reverseMarket.verification.dated', { state: t(`reverseMarket.verification.state.${state}`), date })
    : t(`reverseMarket.verification.state.${state}`)
  if (state === 'kept' || state === 'corrected') {
    return <Badge variant="outline">{label}</Badge>
  }
  // Même forme neutre que « Recours externe : Inconnu » deux colonnes plus
  // loin — une absence de mesure se lit, elle ne s'alarme pas.
  return (
    <Text
      size="sm"
      className="text-[var(--bellum-text-muted)]"
      title={t(`reverseMarket.verification.stateReason.${state}`)}
    >
      {label}
    </Text>
  )
}

/** La date d'une vérification, lisible ; illisible ou absente ⇒ rien, jamais une date de zéro. */
function verifiedOn(iso: string | null, language: string): string | null {
  if (!iso) return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(language)
}

/**
 * #2968 — LE BADGE DU VERDICT, JAMAIS NU.
 *
 * Un score (ou ici, un verdict) n'est jamais nu : ses axes doivent rester
 * lisibles à côté (doctrine « on n'affiche pas ce qu'on n'a pas »). Les axes
 * qui ont TRANCHÉ ce verdict (signal actuel, accès) restent dans leurs
 * propres colonnes, juste à droite — ce badge ne les répète pas, il nomme
 * seulement la CONCLUSION. Même discipline neutre que `fitNoGrade` : aucune
 * couleur de jugement, seul le libellé change.
 */
function ReverseMarketVerdictBadge({ verdict }: { verdict: ReverseMarketVerdict }) {
  const { t } = useTranslation('consultants')
  return (
    <span data-testid="reverse-market-verdict" data-verdict={verdict}>
      <TheoPill tone="accent">{t(`reverseMarket.compatible.verdict.${verdict}`)}</TheoPill>
    </span>
  )
}

function CompatibleEnvironmentRow({
  match,
  skills,
  refusedTechnologies,
  canVerify,
  preselected,
  onTogglePreselected,
  verification,
  onDismiss,
}: {
  match: MarketContextMatch
  skills: readonly string[]
  refusedTechnologies: readonly string[]
  canVerify: boolean
  preselected: boolean
  onTogglePreselected: () => void
  verification: MarketVerificationStateRow | null
  onDismiss: () => void
}) {
  const { t } = useTranslation('consultants')
  const fit = marketFitFor(match.coverage, skills)
  const restrictionObservedAt = refusedTechnologyObservedAt(match.coverage, refusedTechnologies)
  const recourseObserved = externalRecourseObserved(match.coverage)
  const access = accessStateFor(match.coverage)
  // #2968 — LE VERDICT NOMMÉ : dérivé des DEUX axes déjà rendus par cette
  // ligne (signal actuel, accès), jamais un troisième calcul. Voir la doc de
  // `reverseMarketVerdictFor` pour ce que « réserve » et « écarté » exigent en
  // plus, et pourquoi la structure n'entre pas dans le calcul.
  const verdict = reverseMarketVerdictFor({
    coverage: match.coverage,
    currentSignal: match.currentSignal ?? null,
    verificationState: verification?.state ?? null,
  })
  const zone = match.coverage.observedZone
  const zoneLabel = zone ? [zone.city, zone.region, zone.country].filter(Boolean).join(' · ') : ''

  return (
    <TableRow>
      {canVerify && (
        <TableCell>
          {/* #2288.2 — ÉTAPE 1 : cocher ne coûte rien et n'appelle personne. */}
          <Checkbox
            checked={preselected}
            onCheckedChange={onTogglePreselected}
            aria-label={t('reverseMarket.verification.selectAria', { name: match.companyName })}
          />
        </TableCell>
      )}
      <TableCell>
        {/* Aucune donnée de logo dans la mémoire marché (pas de domaine, pas
            de SIREN) : une icône générique, jamais une image devinée. */}
        <Building2 className="size-4 text-[var(--bellum-text-muted)]" aria-hidden="true" />
      </TableCell>
      <TableCell>
        <Text size="sm" weight="medium">
          {match.companyName}
        </Text>
      </TableCell>
      <TableCell>
        <ReverseMarketVerdictBadge verdict={verdict} />
      </TableCell>
      <TableCell>
        {zoneLabel ? (
          <Box className="flex flex-col">
            <Text size="sm">{zoneLabel}</Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('reverseMarket.compatible.zoneCaveat')}
            </Text>
          </Box>
        ) : (
          <UnknownValue reason={t('reverseMarket.compatible.zoneUnknown')} />
        )}
      </TableCell>
      <TableCell>
        {/* Deux états, jamais Fort/Moyen — voir la doc de `marketFitFor`.
            #2968 — la liste recoupée est du TEXTE qui revient à la ligne, pas
            une pilule : une pilule est mono-ligne par construction, et la
            liste entière y étirait le tableau (799 px mesurés en démo). */}
        {fit.label === 'matched' ? (
          <Text size="xs" className="block min-w-40 max-w-64">
            {t('reverseMarket.compatible.fitMatched', { skills: fit.matched.join(', ') })}
          </Text>
        ) : (
          <Badge variant="outline">{t('reverseMarket.compatible.fitUnmeasured')}</Badge>
        )}
      </TableCell>
      <TableCell>
        {/* #2336.5 / #2336.12-.15 — un AVERTISSEMENT, jamais une exclusion
            (§8.3) : la ligne reste ici, le verdict à sa gauche ne bouge pas. */}
        {restrictionObservedAt ? (
          <Badge variant="outline" title={t('reverseMarket.compatible.restrictionReason')}>
            {t('reverseMarket.compatible.restrictionObserved', { techno: restrictionObservedAt })}
          </Badge>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.compatible.restrictionUnknown')}
          </Text>
        )}
      </TableCell>
      <TableCell>
        {recourseObserved ? (
          <Badge variant="outline">{t('reverseMarket.compatible.externalRecourseObserved')}</Badge>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.compatible.externalRecourseUnknown')}
          </Text>
        )}
      </TableCell>
      {/* #2968 — largeur de lecture : sans elle, la raison nommée passait sur
          six lignes et étirait chaque ligne du tableau (recette 29/09). */}
      <TableCell className="min-w-48">
        {/* #2288.1 / #2288.2 — la colonne dit un signal DATÉ, ou nomme son
            absence. La date vient du serveur, déjà tranchée
            (`decideMarketSignalDate`) : exacte quand c'est MON espace qui a
            observé, au MOIS quand elle vient d'ailleurs, ABSENTE sous le seuil
            d'espaces contributeurs. `?? null` parce que le champ est ABSENT —
            jamais `null` — quand il n'y a rien à dire. */}
        <CurrentSignalCell signal={match.currentSignal ?? null} />
      </TableCell>
      <TableCell>
        <VerificationStateCell row={verification} />
      </TableCell>
      <TableCell>
        {access === 'potential_path' ? (
          <Badge variant="outline">{t('reverseMarket.compatible.accessPotentialPath')}</Badge>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.compatible.accessUnknown')}
          </Text>
        )}
      </TableCell>
      <TableCell>
        <UnknownValue reason={t('reverseMarket.compatible.followedReason')} />
      </TableCell>
      <TableCell>
        <Box className="flex items-center gap-2">
          {/* Même chemin que `TerritoryCompanyPanel`/`AccountContent` : ouvrir le
              lanceur pré-rempli, jamais un second chemin d'analyse. */}
          <Link to="/search" search={{ company: match.companyName }}>
            <Button size="sm" variant="outline">
              {t('reverseMarket.compatible.analyze')}
            </Button>
          </Link>
          {/* #2968 — « Masquer » : personnel et gratuit, archivé jamais
              supprimé (voir `ReverseMarketDismissalService`). La ligne quitte
              ce tableau et rejoint la liste repliée « masqués ». */}
          <Button
            size="sm"
            variant="outline"
            icon={EyeOff}
            onClick={onDismiss}
            aria-label={t('reverseMarket.compatible.dismissed.hideAria', { name: match.companyName })}
          >
            {t('reverseMarket.compatible.dismissed.hide')}
          </Button>
        </Box>
      </TableCell>
    </TableRow>
  )
}
