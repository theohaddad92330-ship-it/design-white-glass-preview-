import type {
  AccountIntelligenceContextView,
  AccountIntelligenceEntryPath,
  AccountIntelligenceField,
  AccountIntelligenceRecommendation,
  AccountIntelligenceTechnology,
  MarketRoleFamily,
} from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { Building2, Compass, Cpu, MapPin, Network, Tags } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Provenance } from '@/components/primitives/Provenance'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { AccountRecommendationCard } from './AccountRecommendationCard'
import { OtherRoleFamilyLine } from './OtherRoleFamilyLine'
import { splitOtherRoleFamily } from './roleFamilyOther'

/**
 * #2116.10-12 + #2116.1-8 — LES FAITS DU DOSSIER, LUS AU CONTEXTE CANONIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE CARTE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ESN en place, les technologies et le chemin d'accès étaient dérivés dans
 * l'écran qui les affichait — le chemin d'accès DEUX fois, dans deux fichiers.
 * Ici, rien n'est recalculé : chaque valeur arrive résolue et datée de
 * `GET /accounts/:id/intelligence-context`, et se rend telle quelle.
 *
 * Chaque fait porte sa PROVENANCE — la source parmi les huit, et la date.
 * Une valeur que personne ne sait est NOMMÉE (`state: 'unknown'`) plutôt que
 * rendue en blanc : un bloc vide se lit « rien à savoir », ce qui est faux.
 */
export function AccountCanonicalContextCard({
  context,
  onTabChange,
  excludeTechnologies = [],
  contacts = [],
}: {
  /** `null` = la façade n'a pas répondu. On se TAIT alors, on n'écrit pas
   *  « aucune ESN en place » : une lecture indisponible n'est pas un constat. */
  context: AccountIntelligenceContextView | null
  onTabChange: (tab: TabId) => void
  /** #3499 — noms déjà rendus en pastilles ailleurs (« Stack technique ») : retirés d'ici. */
  excludeTechnologies?: readonly string[]
  /** K.3 / #4325 — les contacts du compte : ils détaillent la ligne « Autre » (intitulés qu'aucun métier ne range). */
  contacts?: ReadonlyArray<{ family?: string | null; title?: string | null }>
}) {
  const { t } = useTranslation('accountDetail')
  if (!context) return null
  const technologiesField = withoutShownTechnologies(context.technologies, excludeTechnologies)
  const entryPathsField = withoutRecommendedPaths(context.entryPaths, context.recommendations)
  // #3672 — l'ENTRÉE (open_contacts) se range sous « Par où entrer », le reste sous « Ce qu'on en tire ».
  const entryRecommendations = context.recommendations.filter(r => r.action === 'open_contacts')
  const otherRecommendations = context.recommendations.filter(r => r.action !== 'open_contacts')

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="px-4 py-4">
        <Text element="h3" size="sm" weight="semibold">
          {t('canonicalContext.title')}
        </Text>
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('canonicalContext.subtitle')}
        </Text>
      </div>

      {/* #2116.3 / .6 / .7 — L'IDENTITÉ, ET SURTOUT D'OÙ ELLE VIENT.
          L'entête du dossier écrit déjà le NOM et le secteur ; ce bloc ne les
          répète pas pour les répéter — il dit l'ÉCHELON qui les a produits.
          C'est la moitié qui manquait : « Assurance » corrigé sur le terrain
          par un collègue et « Assurance » deviné par une collecte se lisent
          exactement pareil, et ne se traitent pas pareil en rendez-vous. */}
      <CanonicalFact icon={Building2} title={t('canonicalContext.companyName')} field={context.companyName}>
        {(companyName: string) => <Text size="sm">{companyName}</Text>}
      </CanonicalFact>

      <CanonicalFact icon={Tags} title={t('canonicalContext.sector')} field={context.sector}>
        {(sector: string) => <Text size="sm">{sector}</Text>}
      </CanonicalFact>

      <CanonicalFact icon={MapPin} title={t('canonicalContext.headquarters')} field={context.headquarters}>
        {(headquarters: string) => <Text size="sm">{headquarters}</Text>}
      </CanonicalFact>

      {/* #2116.10 — l'ESN en place ne se rend PAS ici : `IncumbentEsnCard`
          (colonne principale, juste au-dessus) en est le SEUL propriétaire
          dans l'onglet (GA-26) — elle porte plus (forces, faiblesses,
          périmètre du contrat, corroboration par la mémoire marché) que ce
          que cette carte pourrait ajouter en ne rendant que le nom. */}

      {/* #2116.11 — les technologies, avec leur usage quand il est connu. */}
      {/* #3499 — une technologie déjà en pastille dans « Stack technique » ne se
          répète pas ici (8/8 en double en prod) : un seul endroit. Le bloc se
          masque quand il se vide ; `unknown` reste nommé, ce n'est pas un doublon. */}
      {technologiesField ? (
        <CanonicalFact icon={Cpu} title={t('canonicalContext.technologies')} field={technologiesField}>
          {(technologies: readonly AccountIntelligenceTechnology[]) => (
            <ul className="space-y-1">
              {technologies.map(technology => (
                <li key={technology.name}>
                  <Text size="sm">
                    <span className="font-medium">{technology.name}</span>
                    {technology.usage ? (
                      <span className="text-[var(--bellum-text-secondary)]"> — {technology.usage}</span>
                    ) : null}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </CanonicalFact>
      ) : null}

      {/* #2116.12 — LE chemin d'accès, un seul, arbitré côté serveur. */}
      {/* #3672 — une porte déjà portée par « Ce qu'on en tire » ne se répète pas
          ici (GA-26) : ce bloc ne garde que les portes sans recommandation. */}
      {entryPathsField ? (
        <CanonicalFact icon={Compass} title={t('canonicalContext.entryPaths')} field={entryPathsField}>
          {(paths: readonly AccountIntelligenceEntryPath[]) => (
            <ul className="space-y-2">
              {paths.map(path => (
                <li key={path.label}>
                  <Text size="sm" weight="medium">
                    {path.label}
                  </Text>
                  {path.targetProfile ? (
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {path.targetProfile}
                    </Text>
                  ) : null}
                  {path.justification ? (
                    <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                      {path.justification}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CanonicalFact>
      ) : null}

      {/* #2116.6 — LA MÉMOIRE MARCHÉ, nommée par ce qu'elle EST.
          `MarketMemoryRead` est une union à dessein, et le choix se prend ICI :
          « je n'ai pas pu lire » s'écrit, il ne se rend pas comme « rien
          observé » — un « 0 » posé sur une panne est un mensonge présenté
          comme une mesure. Ce bloc ne redit pas « Recours à des externes »
          (`AccountMarketMemoryCard`, autre route, autre fait) : il nomme les
          familles de métiers que les parcours observés font apparaître. */}
      {context.marketMemory.read.status === 'unavailable' ||
      // #2126.15 — la lecture a RÉPONDU mais le compte est sous le seuil (ou
      // non résolu) : un état NOMMÉ, ni la panne ci-dessus ni le « Non mesuré »
      // générique. Un compte couvert sans famille garde, lui, `UnknownValue`.
      !context.marketMemory.read.coverage.covered ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Network className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('canonicalContext.marketMemoryRoles')}
            </Text>
          </div>
          <Text size="sm" className="block text-[var(--bellum-text-secondary)]">
            {context.marketMemory.read.status === 'unavailable'
              ? t('canonicalContext.marketMemoryUnavailable')
              : t('canonicalContext.marketMemoryNotCovered')}
          </Text>
        </div>
      ) : (
        <CanonicalFact
          icon={Network}
          title={t('canonicalContext.marketMemoryRoles')}
          hint={t('canonicalContext.marketMemoryRolesHint')}
          field={marketMemoryRoleFamilies(context.marketMemory)}
        >
          {(roleFamilies: readonly MarketRoleFamily[]) => {
            // K.3 / #4325 — « Autre » n'est pas un métier : à part, avec son détail.
            const { families, other } = splitOtherRoleFamily(roleFamilies)
            return (
              <>
                {families.length > 0 ? (
                  <ul data-testid="role-families-list" className="space-y-1">
                    {families.map(roleFamily => (
                      <li key={roleFamily.family}>
                        <Text size="sm">
                          <span className="font-medium">{roleFamily.family}</span>
                          <span className="text-[var(--bellum-text-secondary)]">
                            {' '}
                            — {t('canonicalContext.roleFamilyPersons', { count: roleFamily.persons })}
                          </span>
                        </Text>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {other ? <OtherRoleFamilyLine persons={other.persons} contacts={contacts} /> : null}
              </>
            )
          }}
        </CanonicalFact>
      )}

      {/* #3672 (tranché par Louis le 10/10, revient sur #2116.x) — une recommandation d'ENTRÉE
          (open_contacts) se lit sous « Par où entrer » AVEC ses métadonnées. Le titre est celui
          du bloc de portes ci-dessus : si des portes restent, il est déjà posé, on ne le répète pas. */}
      {entryRecommendations.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          {entryPathsField ? null : (
            <div className="mb-2 flex items-center gap-2">
              <Compass className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
              <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                {t('canonicalContext.entryPaths')}
              </Text>
            </div>
          )}
          <div className="space-y-3">
            {entryRecommendations.map(recommendation => (
              <AccountRecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                onTabChange={onTabChange}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* #2116.17-24 — les recommandations et leurs huit métadonnées. */}
      {otherRecommendations.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text element="h4" size="xs" weight="semibold" className="mb-2 text-[var(--bellum-text-muted)]">
            {t('canonicalContext.recommendations')}
          </Text>
          <div className="space-y-3">
            {otherRecommendations.map(recommendation => (
              <AccountRecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                onTabChange={onTabChange}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/**
 * #3499 — retire les technologies déjà en pastilles (casse et espaces ignorés).
 * `unknown` reste tel quel (nommé) ; une liste connue qui se vide devient `null`
 * — le bloc n'est pas rendu, il ne dit pas « inconnu » d'un fait qu'on a.
 */
function withoutShownTechnologies(
  field: AccountIntelligenceField<readonly AccountIntelligenceTechnology[]>,
  shown: readonly string[],
): AccountIntelligenceField<readonly AccountIntelligenceTechnology[]> | null {
  if (field.state !== 'known' || shown.length === 0) return field
  const names = new Set(shown.map(name => name.trim().toLowerCase()))
  const rest = field.value.filter(technology => !names.has(technology.name.trim().toLowerCase()))
  return rest.length === 0 ? null : { ...field, value: rest }
}

/**
 * #3672 — retire des portes d'entrée celles que « Ce qu'on en tire » porte déjà
 * (même libellé, casse et espaces ignorés). Une liste connue qui se vide
 * devient `null` : le bloc n'est pas rendu, la porte se lit UNE fois, dans la
 * recommandation qui garde sa nature, sa date et sa limite.
 *
 * #3672 (R4 07/10, réfuté en recette : « Par où entrer » affichait « Non
 * mesuré ») — `unknown` devient `null`, PAS gardé nommé : « Par où entrer »
 * rend une LISTE de portes, pas un score, et dans une liste une absence ne
 * fait AUCUNE ligne (doctrine du 20/09) — à la différence d'un fait scalaire
 * (secteur, technologies…), qui lui se nomme « Non mesuré ».
 */
function withoutRecommendedPaths(
  field: AccountIntelligenceField<readonly AccountIntelligenceEntryPath[]>,
  recommendations: readonly AccountIntelligenceRecommendation[],
): AccountIntelligenceField<readonly AccountIntelligenceEntryPath[]> | null {
  if (field.state !== 'known') return null
  if (recommendations.length === 0) return field
  const shown = new Set(recommendations.map(recommendation => recommendation.label.trim().toLowerCase()))
  const rest = field.value.filter(path => !shown.has(path.label.trim().toLowerCase()))
  return rest.length === 0 ? null : { ...field, value: rest }
}

/**
 * #2116.6 — ce que la mémoire marché a observé pour ce compte, sous la forme
 * que rend la carte : un champ avec sa provenance, ou `unknown` NOMMÉ.
 *
 * Une liste vide n'est pas « aucune famille de métier » — c'est « le corpus
 * n'en fait apparaître aucune sur ce compte », donc `unknown`, jamais un bloc
 * vide ni un « 0 ». La provenance vient du serveur telle quelle : ce n'est pas
 * une dérivation de plus, c'est le choix de rendu que `MarketMemoryRead`
 * impose à chacun de ses appelants.
 */
function marketMemoryRoleFamilies(
  marketMemory: AccountIntelligenceContextView['marketMemory'],
): AccountIntelligenceField<readonly MarketRoleFamily[]> {
  if (marketMemory.read.status !== 'ok') return { state: 'unknown' }
  const roleFamilies = marketMemory.read.coverage.roleFamilies
  if (roleFamilies.length === 0) return { state: 'unknown' }
  return { state: 'known', value: roleFamilies, provenance: marketMemory.provenance }
}

/**
 * UN fait du contexte, rendu avec sa provenance — ou NOMMÉ comme inconnu.
 *
 * Générique à dessein : trois faits qui écriraient chacun leur ligne de
 * provenance produiraient trois formulations en trois semaines, et la date
 * finirait par manquer sur celle ajoutée en dernier (même raison
 * qu'`AnalysisSectionCard`, qui garde la même promesse pour `raw_analysis`).
 */
function CanonicalFact<T>({
  icon: Icon,
  title,
  hint,
  field,
  children,
}: {
  icon: LucideIcon
  title: string
  /** #4322.1 — dit en clair ce que le bloc mesure (unité comprise) quand le titre seul ne le dit pas. */
  hint?: string
  field: AccountIntelligenceField<T>
  children: (value: T) => ReactNode
}) {
  return (
    <div className="border-t border-[var(--bellum-border)] px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
        <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
          {title}
        </Text>
      </div>
      {hint && field.state === 'known' ? (
        <Text size="xs" className="mb-2 block text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
      {field.state === 'known' ? (
        <>
          {children(field.value)}
          <div className="mt-2">
            {/* #2116.1-8 + #2116.19 — la source ET la date. Une date absente se
                LIT (« date inconnue ») : sans elle, le fait se lit comme s'il
                datait d'aujourd'hui. */}
            <Provenance source={field.provenance.source} observedAt={field.provenance.observedAt} nameMissingDate />
          </div>
        </>
      ) : (
        <UnknownValue />
      )}
    </div>
  )
}
