import { useTranslation } from 'react-i18next'
import type { MapPin } from 'lucide-react'
import { Network, Sparkles } from 'lucide-react'
import type { DiscoverQuickPassEntry, SalesProfileForRelevance } from '@bellum/contracts'
import { AskLaura } from '@/components/primitives/AskLaura'
import { DeclareLinkedInSignalDialog } from '@/features/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog'
import { plausibleRegistryDate } from '@/lib/signal-date'
import { formatSiren } from '@/features/discover/lib/discover-normalize'
import type { portfolioBadgeFor } from '@/features/discover/lib/discover-presentation'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import type { CardFact } from '@/features/discover/lib/discover-card-facts'
import type { PartnerComplementarityScore } from '@/features/discover/lib/discover-partner-complementarity'
import { CandidateConfidence } from './CandidateConfidence'
import { CandidateNotes } from './CandidateNotes'
import { CandidateWrongCompanyAction } from './CandidateWrongCompanyAction'
import { CandidatePeople } from './CandidatePeople'
import { BarrierChip, CandidateScore, ScoreValueBadge } from './CandidateScore'
import { FamilyBadge } from './FamilyBadge'
import { ScoreFitBadge } from './FitBadge'
import { PortfolioBadge } from './PortfolioBadge'
import { QuickPassBadge } from './QuickPassVerdict'
import { AccessLevelBadge } from './AccessLevelBadge'
import { QualificationBadge } from './QualificationBadge'
import { CandidateContractModel } from './CandidateContractModel'
import { CandidateFacts } from './CandidateFacts'
import { CandidateSourcesWhy } from './CandidateSourcesWhy'
import { EffortSuggestionBadge } from './EffortSuggestionBadge'
import { CandidateAdvice } from './CandidateAdvice'
import { IntermediaryBadge } from './IntermediaryBadge'
import { PartnerComplementarityBlock } from './PartnerComplementarityBlock'
import { QuickPassAxes } from './QuickPassVerdict'
import { OffersVolumeNote } from './OffersVolumeNote'
import { SimilarityHeadlineNote } from './SimilarityHeadlineNote'

/* ------------------------------------------------------------------ */
/*  #3597.7 — LE REPLIABLE d'une ligne de /discover (ex-CandidateCard). */
/*                                                                     */
/*  Louis (04/10/2026) : « trop compliqué et sincèrement moche » — les  */
/*  mêmes comptes étaient rendus trois fois. La carte pleine largeur    */
/*  n'existe plus ; ce qu'elle montrait vit ICI, fermé par défaut, sous  */
/*  la ligne compacte (`CandidateRow`). Mêmes sous-composants, mêmes     */
/*  règles de lecture (GA-26 : rien n'est refait à côté) :              */
/*                                                                     */
/*  le factuel (registre, signaux datés) et le suggéré (angle IA) ne se */
/*  ressemblent pas — l'angle reste enfermé dans un encadré étiqueté ;  */
/*  les rôles sont titrés « rôles à identifier », jamais présentés      */
/*  comme des personnes trouvées ; une valeur absente ne fait aucune    */
/*  ligne et ne se chiffre jamais « 0 » (GA-18 / GA-19).               */
/* ------------------------------------------------------------------ */

/** Puce factuelle — registre uniquement. */
function Chip({ icon: Icon, children }: { icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      {Icon && <Icon className="h-[10px] w-[10px]" />}
      {children}
    </span>
  )
}

interface CandidateRowDetailsProps {
  candidate: DiscoverCandidate
  /** #2151.36 — fourni SEULEMENT en recherche ESN/partenaire ; `undefined` en mode compte. */
  partnerComplementarity?: PartnerComplementarityScore
  /** #3597.3 — les axes du verdict de passe rapide, consultables ici. */
  quickPass?: DiscoverQuickPassEntry | null
  /** #4068.3 — le badge portefeuille, déplacé de la ligne vers ici. */
  portfolioBadge?: ReturnType<typeof portfolioBadgeFor>
  /** #4068 — le CONTEXTE (10 au plus), jamais un fait déjà montré parmi les forts. */
  contextFacts?: readonly CardFact[]
  relevanceProfile?: SalesProfileForRelevance
}

export function CandidateRowDetails({
  candidate,
  partnerComplementarity,
  quickPass,
  portfolioBadge,
  contextFacts = [],
  relevanceProfile,
}: CandidateRowDetailsProps) {
  const { t } = useTranslation('discover')
  const creationYear = plausibleRegistryDate(candidate.creationDate)?.slice(0, 4)

  return (
    <div
      data-testid="candidate-row-details"
      className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-start lg:gap-5"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* ================= Colonne 1 — ce qu'on SAIT ================= */}
      <div className="min-w-0 flex-1">
        {/* #4068.3 (Louis 12/10/2026) — les badges qui encombraient la ligne : palier de fit,
            famille, score, barrière d'accès, passage rapide, portefeuille. DÉPLACÉS, pas
            supprimés ; le détail du score et ses axes nommés restent dans la colonne de droite. */}
        <div data-testid="candidate-row-badges" className="mb-2 flex flex-wrap items-center gap-2">
          {portfolioBadge && <PortfolioBadge badge={portfolioBadge} />}
          <ScoreFitBadge candidate={candidate} />
          <FamilyBadge candidate={candidate} />
          {candidate.score !== null && <ScoreValueBadge score={candidate.score} scoreMax={candidate.scoreMax} />}
          {candidate.barrier && <BarrierChip barrier={candidate.barrier} />}
          {quickPass && <QuickPassBadge entry={quickPass} />}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Chip>{`${t('card.sirenLabel')} ${formatSiren(candidate.siren)}`}</Chip>
          {/* #3907 (recette prod 09/10) — « ce que fait l'entreprise » vit maintenant
              sur la carte elle-même (CandidateRow), une seule fois : pas de chip
              dupliqué ici. */}
          {/* #3238 — les villes des sites vivent sur la ligne de la carte (CandidateRow), une seule fois. */}
          {creationYear && <Chip>{t('card.createdLabel', { year: creationYear })}</Chip>}
          {/* #2166.3, RESTREINT par #2613 — le rattachement capitalistique,
                SEULEMENT pour un compte déjà possédé ET seulement quand il est
                CONNU : la puce disparaît, elle ne se remplace ni par un tiret
                ni par un zéro. */}
          {candidate.accountId && candidate.groupRole && (
            <Chip icon={Network}>{t(`card.groupRole.${candidate.groupRole}`)}</Chip>
          )}
        </div>

        {/* ---------- #2166.11 (épopée #2806) — référence comparable ---------- */}
        <SimilarityHeadlineNote candidate={candidate} />

        {/* ---------- DISCOVER-OFFRES (15/10) — volume d'offres, mesuré ou rien ---------- */}
        <OffersVolumeNote candidate={candidate} />

        {/* Il passe DEVANT le score : savoir qu'une ligne est une personne
            physique change la lecture du chiffre qui suit. */}
        <QualificationBadge qualification={candidate.qualification} />

        {/* #2265.14 — « jamais un intermédiaire présenté comme client final sans badge ». */}
        <IntermediaryBadge candidate={candidate} />

        {/* #2646.1 — l'accès nommé, réservé aux candidats SANS fiche compte. */}
        {!candidate.accountId && <AccessLevelBadge candidate={candidate} />}

        {/* ---------- Le CONTEXTE ----------
            #4068 (Louis 13/10) — l'ancienne liste « Pourquoi maintenant »
            répétait les faits de la ligne en paragraphes : le repliable
            n'ajoute plus que le contexte (actualité, événement, résultat
            financier, technologie), une ligne par fait, 10 au plus. */}
        {contextFacts.length > 0 && (
          <section className="mb-2" aria-labelledby={`${candidate.siren}-context-title`}>
            <p
              id={`${candidate.siren}-context-title`}
              className="mb-1 text-xs uppercase tracking-wider"
              style={{ color: 'var(--text-ghost)' }}
            >
              {t('facts.contextTitle')}
            </p>
            <CandidateFacts
              facts={contextFacts}
              label={t('facts.contextLabel')}
              testId="candidate-context-facts"
              relevanceProfile={relevanceProfile}
            />
          </section>
        )}

        {/* #4067 — le détail des sources de l'espace : c'est un SCORE (points sur
            plafond), ses axes non évaluables restent nommés. Les faits datés
            qu'il résume sont déjà dans la liste des forts. */}
        <CandidateSourcesWhy sourceAxes={candidate.sourceAxes} />

        {/* #2291.2 — modèle de contrat OBSERVÉ. */}
        <CandidateContractModel model={candidate.contractModel} />

        {/* ---------- Angle suggéré — visuellement distinct du factuel ---------- */}
        {candidate.angle && (
          <div
            className="mb-2 rounded-md p-2"
            style={{ background: 'var(--accent-soft-bg)', border: '1px dashed var(--accent-soft-border)' }}
          >
            <p className="mb-1 flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-[11px] w-[11px]" style={{ color: 'var(--accent-soft-text)' }} />
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--accent-soft-text)' }}
              >
                {t('card.angleTitle')}
              </span>
              <span
                className="rounded-full px-1.5 py-px text-xs font-medium"
                style={{ border: '1px solid var(--accent-soft-border)', color: 'var(--accent-soft-text)' }}
              >
                {t('card.angleBadge')}
              </span>
            </p>
            <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {candidate.angle}
            </p>
            <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
              {t('card.angleDisclaimer')}
            </p>
          </div>
        )}

        {/* ---------- Rôles à identifier (jamais « contacts trouvés ») ---------- */}
        {candidate.suggestedRoles.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {t('card.rolesTitle')}
              </span>
              <span
                className="rounded-full px-1.5 py-px text-xs"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                {t('card.rolesBadge')}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.suggestedRoles.map((role, i) => (
                <span
                  key={`${role.title}-${i}`}
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  {role.department ? `${role.title} · ${role.department}` : role.title}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
              {t('card.rolesDisclaimer')}
            </p>
          </div>
        )}

        {/* #2544.2 — les PERSONNES qu'une source a nommées, avec leur provenance. */}
        <CandidatePeople people={candidate.people} candidateCity={candidate.city} />

        {/* #4068.4 — plus de ligne « Sources : … » : on ne nomme aucune source dans Découvrir. */}

        {/* #2151.59 — une note libre sur ce candidat. */}
        <CandidateNotes siren={candidate.siren} candidateName={candidate.name} />

        {/* #3671.2bis — le signal affiché n'appartient pas à ce SIREN. */}
        <CandidateWrongCompanyAction siren={candidate.siren} />
      </div>

      {/* ========= Colonne 2 — ce qu'on en DÉDUIT, et ce qu'on en FAIT ========= */}
      <div
        data-testid="candidate-row-details-aside"
        className="flex w-full shrink-0 flex-col gap-2 lg:w-[300px] lg:border-l lg:pl-5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          {/* #3408.3 — le niveau d'effort SUGGÉRÉ, réservé aux candidats sans fiche compte. */}
          {!candidate.accountId && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <EffortSuggestionBadge candidate={candidate} />
            </div>
          )}
          {/* #3408.2 — périmètre, risque, première action : trois lignes, pas un bloc. */}
          {!candidate.accountId && <CandidateAdvice candidate={candidate} />}
          {/* Le détail du score : jamais un score nu, ses axes sont nommés. */}
          <CandidateScore
            score={candidate.score}
            scoreMax={candidate.scoreMax}
            unmeasured={candidate.scoreUnmeasured}
            factors={candidate.scoreFactors}
            addressability={candidate.addressability}
            barrier={candidate.barrier}
          />
          {/* #2166.12 — la confiance de la donnée vient APRÈS le score parce
              qu'elle le qualifie. */}
          <div className="mt-1.5">
            <CandidateConfidence candidate={candidate} />
          </div>
          {/* #3597.3 — les axes du verdict de passe rapide (pesés ET non pesés). */}
          {quickPass && <QuickPassAxes entry={quickPass} />}
          {partnerComplementarity && <PartnerComplementarityBlock result={partnerComplementarity} />}
        </div>

        {/* #2151.55 / #2166.49 / #2166.52 — deux gestes de LECTURE, jamais d'écriture. */}
        <div data-testid="candidate-card-quick-links" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* G-FIX #4309 — « Expliquer avec Laura » vit sur la carte (CandidateRow), pas ici. */}
          {/* #3924 — coller le texte ou l'URL d'un post LinkedIn lu en parcourant
              Découvrir : le MÊME geste que la fiche compte (#2634.1), jamais un
              appel à LinkedIn. Un signal déclaré s'écrit sur un compte : sur un
              candidat neuf, aucun geste (rien où écrire). */}
          {candidate.accountId ? <DeclareLinkedInSignalDialog accountId={candidate.accountId} /> : null}
        </div>

        {/* #2151.53/.54/.55/.56 — quatre gestes que Laura porte : la question est
            pré-remplie, jamais envoyée seule (D44). Le compte n'est mis en PORTÉE
            que quand ce candidat en est déjà un. */}
        <div
          data-testid="candidate-card-laura-actions"
          className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-1.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* #4310.1 / #4308.1 — « Qualifier », « Vérifier aujourd'hui », « Trouver les commerciaux » et « Chercher les contacts » retirés (décision Louis 19/10) : les contacts s'ouvrent depuis la fiche compte. */}
          <AskLaura
            question={t('actions.preparePartnerApproachQuestion', { name: candidate.name })}
            label={t('actions.preparePartnerApproach')}
            accountId={candidate.accountId ?? undefined}
          />
        </div>
      </div>
    </div>
  )
}
