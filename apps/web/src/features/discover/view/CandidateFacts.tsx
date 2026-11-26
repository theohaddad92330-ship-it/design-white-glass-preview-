import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Text } from '@bellum/ui'
import { offerOriginLabel, type SalesProfileForRelevance } from '@bellum/contracts'
import { factLinkKey, factNatureLabelKey, isCapitalIncreaseFact } from '@/features/discover/lib/discover-fact-type'
import { groupCardFactsByFamily, type CardFact } from '@/features/discover/lib/discover-card-facts'
import { formatDate } from '@/lib/locale'
import { useOfferContractLabel } from '@/lib/offer-contract-label'
import { sourceSiteName } from '@/features/discover/lib/discover-source-site'
import { isOutOfTradeHiring } from '@/features/discover/lib/discover-hiring-domain'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'
import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'

/**
 * #4068 — UNE LISTE DE FAITS DE CARTE, une ligne par fait : `date · NATURE ·
 * fait court · lien`. Jamais un paragraphe : le fait tient sur une ligne
 * (borne de lecture de `Text`, le reste dans l'infobulle).
 *
 * Louis 13/10 (lot DECOUVRIR-CARTE) : la carte repliée montre les FORTS (5 au
 * plus), le détail déplié ajoute le CONTEXTE (10 au plus) — deux appels de ce
 * composant, jamais la même ligne deux fois. Le tri, les plafonds et le
 * dédoublonnage viennent du contrat (`selectCardFacts`) ; ce composant ne
 * décide rien.
 *
 * - La date est absolue (`12/10/2026`) ; datée par sa détection, elle le dit
 *   (« vu le ») : un besoin tiré d'une analyse n'a pas été publié ce jour-là.
 * - #4068.4 — aucun nom de fournisseur : la NATURE du fait, un lien générique (+ le site d'emploi d'une offre,
 *   #5010.3), et sans URL aucun lien.
 * - Aucun fait → aucune ligne (GA-18/19), ni titre ni « 0 ».
 */
const FACT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
}

/** La date absolue d'un fait de carte (`12/10/2026`) — la MÊME sur la ligne de fait et sur le sujet de la carte repliée. */
export function formatFactDate(fact: Pick<CardFact, 'date'>): string {
  return formatDate(fact.date, FACT_DATE_FORMAT) ?? fact.date
}

/**
 * Le lien d'un fait (↗, nouvel onglet) : il dit la NATURE du lien (« Voir l'annonce »). Louis 02/11 (#5010.3) : pour
 * une OFFRE D'EMPLOI, le SITE de publication s'affiche (« Voir l'annonce · LinkedIn ») — ce n'est pas un fournisseur ;
 * liste blanche de sites d'emploi (`offerOriginLabel`), site inconnu ou agrégateur = rien. Les autres faits : la nature
 * seule. Pas d'URL lisible = pas de lien. Un seul composant pour la ligne de fait ET le sujet de la carte repliée (#4285.1).
 */
export function FactSourceLink({ fact, className }: { fact: Pick<CardFact, 'type' | 'url'>; className?: string }) {
  const { t } = useTranslation('discover')
  if (!fact.url || !sourceSiteName(fact.url)) return null
  const site = fact.type === 'hiring' ? offerOriginLabel(fact.url) : null
  const linkLabel = site ? t('facts.linkAnnouncementOn', { site }) : t(factLinkKey(fact.type))
  return (
    <a
      href={fact.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('facts.openSource', { site: linkLabel })}
      onClick={e => e.stopPropagation()}
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm py-1 font-medium text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11 ${className ?? 'ml-auto'}`}
    >
      {linkLabel}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

export function CandidateFacts({
  facts,
  label,
  testId = 'candidate-facts',
  relevanceProfile,
}: {
  /** Le métier de l'espace : sert à marquer une offre « hors de ton métier » (#4284.1) ; absent = profil non lu. */
  relevanceProfile?: SalesProfileForRelevance
  facts: readonly CardFact[]
  /** Nom accessible de la liste (forts ou contexte). */
  label: string
  testId?: string
}) {
  const { t } = useTranslation('discover')
  const contractLabel = useOfferContractLabel()
  if (facts.length === 0) return null

  return (
    <div data-testid={testId} role="group" aria-label={label} className="flex flex-col gap-2">
      {/* #4045.5 (Louis 15/10/2026) — rangés par FAMILLE : Recrutements / Projets / Marchés publics. */}
      {groupCardFactsByFamily(facts).map(group => (
        <section
          key={group.family}
          data-testid="candidate-fact-family"
          data-family={group.family}
          className="flex flex-col gap-1"
        >
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
            {t(`facts.family.${group.family}`)}
          </p>
          <ul aria-label={t(`facts.family.${group.family}`)} className="flex flex-col gap-1">
            {group.facts.map(fact => {
              const date = formatFactDate(fact)
              const shownLabel = isCapitalIncreaseFact(fact) ? t('facts.capitalIncrease') : fact.label
              return (
                <li
                  key={fact.key}
                  data-testid="candidate-fact"
                  data-nature={fact.nature}
                  className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-snug"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <time dateTime={fact.date} className="shrink-0 tabular-nums" style={{ color: 'var(--text-ghost)' }}>
                    {fact.dateIsDetection ? t('facts.seenOn', { date }) : date}
                  </time>
                  <span aria-hidden="true" className="shrink-0">
                    ·
                  </span>
                  <span
                    className="shrink-0 font-medium uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {t(factNatureLabelKey(fact.nature))}
                  </span>
                  <span aria-hidden="true" className="shrink-0">
                    ·
                  </span>
                  {/* La borne de lecture (70 caractères) vient de `Text` (GA-34) : le fait tient
                      sur UNE ligne, tronquée, le texte complet dans l'infobulle. */}
                  <Text element="span" size="xs" leading="snug" className="min-w-0 break-words" title={shownLabel}>
                    {shownLabel}
                    {fact.stillOpen === false && (
                      <span style={{ color: 'var(--text-ghost)' }}> · {t('card.signalProbablyFilled')}</span>
                    )}
                  </Text>
                  {/* Théo A decouvrir.R5 — le lien est VISIBLE sur la ligne (↗, nouvel onglet), sans ouvrir le détail.
                      Refonte Théo 23/10 — il dit la NATURE du lien ; Louis 02/11 : le site d'une OFFRE s'y ajoute
                      (liste blanche, jamais un fournisseur). Pas d'URL lisible = pas de lien. */}
                  {/* #4284.1 / #4284.26 (Louis 23/10) — une offre hors du métier de l'ESN se DIT (même prédicat que
                      /mes-cibles et la fiche compte, GA-26) ; jamais cachée. */}
                  {fact.type === 'hiring' &&
                    isOutOfTradeHiring({ type: fact.type, label: fact.label }, relevanceProfile) && <OutOfTradeTag />}
                  {/* #5000.2 — le type de contrat DÉCLARÉ par l'annonce, sur la ligne de l'offre ; absent ⇒ « non précisé »,
                      jamais une ligne vide ni « 0 ». Un fait qui n'est pas une offre n'en porte pas. */}
                  {fact.type === 'hiring' && (
                    <span
                      data-testid="candidate-fact-contract"
                      className="shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {contractLabel(fact.contractType)}
                    </span>
                  )}
                  <FactSourceLink fact={fact} />
                  {/* #4437.5 — la compétence et la famille déduites de l'intitulé (même libre) : des puces ; aucune
                      puce sans l'une ni l'autre, et une famille hors liste fermée ne s'affiche pas. */}
                  <OfferReading technologies={fact.technologies} jobFamily={fact.jobFamily} />
                  {/* #4182 / #4286.11 (Louis 23/10) — l'équipe ou le métier qui demande, quand l'offre le NOMME ;
                      sinon « à identifier », avec sa méthode en dépliant. Pas de demandeur composé : pas de ligne. */}
                  {fact.requester && (
                    <span
                      data-testid="candidate-fact-requester"
                      className="basis-full text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <OfferRequesterLine requester={fact.requester} />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** #4067 (R17 15/10) — « Ce qui a pesé : recrutement, besoin… » : les natures distinctes des faits de la carte. */
export function CandidateWeighed({ facts }: { facts: readonly CardFact[] }) {
  const { t } = useTranslation('discover')
  const natures = [...new Set(facts.map(fact => fact.nature))]
  if (natures.length === 0) return null
  return (
    <p data-testid="candidate-weighed" className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
      {t('facts.weighedTitle')} : {natures.map(nature => t(factNatureLabelKey(nature)).toLowerCase()).join(', ')}
    </p>
  )
}

const OFFER_FAMILIES: ReadonlySet<string> = new Set([
  'data_ia',
  'infrastructure_cloud',
  'cybersecurite',
  'produit_design',
  'qualite_test',
  'developpement',
  'direction_management',
  'commercial_marketing',
])
const OFFER_SKILLS_SHOWN = 4

function OfferReading({
  technologies,
  jobFamily,
}: {
  technologies: readonly string[] | null | undefined
  jobFamily: string | null | undefined
}) {
  const { t } = useTranslation('discover')
  const skills = (technologies ?? []).slice(0, OFFER_SKILLS_SHOWN)
  const family = jobFamily && OFFER_FAMILIES.has(jobFamily) ? jobFamily : null
  if (skills.length === 0 && !family) return null
  const chip = 'rounded-full px-2 py-0.5 text-xs'
  return (
    <ul data-testid="candidate-fact-reading" className="flex basis-full flex-wrap gap-1">
      {skills.map(skill => (
        <li key={skill} className={chip} style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {skill}
        </li>
      ))}
      {family && (
        <li className={chip} style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {t(`rail.jobFamily.${family}`)}
        </li>
      )}
    </ul>
  )
}
