import { Document, Page, Text, View } from '@react-pdf/renderer'
import { i18n } from '@/i18n'
import { pdfContactsCap } from './normalize'
import type {
  AccountPdfData,
  Angle,
  Competitor,
  ItChallenge,
  Pain,
  PlanWeek,
  RecentSignal,
  TechItem,
} from './normalize'
import type { AccountPdfOrgPage } from './orgPageData'
import type {
  FocalPersonCard,
  OrgDecisionBadge,
} from '@/features/accounts/view/account-detail/tabs/organigramme/focalOrgData'
import { decisionBadgePalette, reportingLineStyle, severityPalette, styles } from './styles'
import { capitalize } from '@bellum/utils'
import { orgHasHierarchyEdges, type Brand } from '@bellum/contracts'

type AccountPdfDocumentProps = {
  data: AccountPdfData
  /**
   * La marque de l'espace — marque blanche, 01/09/2026.
   *
   * ⚠️ PASSÉE et non lue par un hook : `@react-pdf/renderer` rend cet arbre
   * HORS de l'arbre React de l'application (`pdf(<Document/>)`), donc aucun
   * fournisseur de contexte ne l'atteint. Un `useBrand()` ici rendrait la
   * valeur par DÉFAUT du contexte sans lever d'erreur — un faux vert parfait :
   * le PDF porterait notre nom, et le test passerait.
   */
  brand: Brand
}

function formatDate(date: Date): string {
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Empty({ children }: { children: string }) {
  return <Text style={styles.emptyParagraph}>{children}</Text>
}

function InfoRow({ label, value, last = false }: { label: string; value: string | null; last?: boolean }) {
  return (
    <View style={last ? styles.infoRowLast : styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value && value.length > 0 ? value : '-'}</Text>
    </View>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subSectionTitle}>{children}</Text>
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.bullet}>
      {'• '}
      {children}
    </Text>
  )
}

function TechCard({ item }: { item: TechItem }) {
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      {item.maturity && (
        <Text style={styles.itemMeta}>{i18n.t('exports:pdf.labels.maturity', { value: item.maturity })}</Text>
      )}
      {item.usage && <Text style={styles.itemBody}>{item.usage}</Text>}
      {item.opportunity_for_esn && (
        <Text style={styles.itemHighlight}>
          {i18n.t('exports:pdf.labels.esnOpportunity', { value: item.opportunity_for_esn })}
        </Text>
      )}
    </View>
  )
}

function ChallengeCard({ item }: { item: ItChallenge }) {
  const sev = severityPalette(item.severity)
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        {item.severity && (
          <Text style={[styles.severityChip, { backgroundColor: sev.bg, color: sev.fg }]}>
            {item.severity.toUpperCase()}
          </Text>
        )}
        <Text style={[styles.itemTitle, { flex: 1, marginBottom: 0 }]}>{item.title}</Text>
      </View>
      {item.timeframe && (
        <Text style={styles.itemMeta}>{i18n.t('exports:pdf.labels.timeframe', { value: item.timeframe })}</Text>
      )}
      {item.description && <Text style={styles.itemBody}>{item.description}</Text>}
      {item.esn_offer_match && (
        <Text style={styles.itemHighlight}>
          {i18n.t('exports:pdf.labels.esnOffer', { value: item.esn_offer_match })}
        </Text>
      )}
    </View>
  )
}

function PainCard({ item }: { item: Pain }) {
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{item.pain}</Text>
      {item.urgency && (
        <Text style={styles.itemMeta}>{i18n.t('exports:pdf.labels.urgency', { value: item.urgency })}</Text>
      )}
      {item.business_impact && (
        <Text style={styles.itemBody}>{i18n.t('exports:pdf.labels.impact', { value: item.business_impact })}</Text>
      )}
      {item.urgency_justification && (
        <Text style={styles.itemBody}>
          {i18n.t('exports:pdf.labels.justification', { value: item.urgency_justification })}
        </Text>
      )}
      {item.esn_offer && (
        <Text style={styles.itemHighlight}>{i18n.t('exports:pdf.labels.esnOffer', { value: item.esn_offer })}</Text>
      )}
    </View>
  )
}

function SignalCard({ item }: { item: RecentSignal }) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        {item.date && <Text style={[styles.itemMeta, { marginRight: 8 }]}>{item.date}</Text>}
        {item.type && <Text style={styles.itemMeta}>· {item.type}</Text>}
      </View>
      <Text style={styles.itemBody}>{item.signal}</Text>
      {item.source && (
        <Text style={styles.itemMeta}>{i18n.t('exports:pdf.labels.source', { value: item.source })}</Text>
      )}
      {item.sales_implication && (
        <Text style={styles.itemHighlight}>
          {i18n.t('exports:pdf.labels.salesImplication', { value: item.sales_implication })}
        </Text>
      )}
    </View>
  )
}

/**
 * #4073.1 (13/10/2026) — UN fait du compte : date · NATURE · libellé, jamais
 * la provenance (ni source, ni lien). Même convention que `AccountFactLines`
 * (écran), traduite dans l'API `@react-pdf/renderer` — pas le même moteur de
 * rendu, donc pas le même composant, mais les MÊMES clés i18n (`accountFacts`)
 * pour que l'écran et le PDF disent la même phrase pour le même fait.
 */
function FactLine({ fact }: { fact: { date: string; kind: string; label: string } }) {
  return (
    <Text style={styles.itemMeta}>
      {formatDate(new Date(fact.date))} · {i18n.t(`accountFacts:kind.${fact.kind}`)} · {fact.label}
    </Text>
  )
}

function CompetitorCard({ item }: { item: Competitor }) {
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      {item.strengths && (
        <Text style={styles.itemBody}>{i18n.t('exports:pdf.labels.strengths', { value: item.strengths })}</Text>
      )}
      {item.weaknesses && (
        <Text style={styles.itemBody}>{i18n.t('exports:pdf.labels.weaknesses', { value: item.weaknesses })}</Text>
      )}
    </View>
  )
}

function AngleCard({ item }: { item: Angle }) {
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>
        {item.title}
        {item.is_recommended ? i18n.t('exports:pdf.angle.recommendedSuffix') : ''}
      </Text>
      {item.description && <Text style={styles.itemBody}>{item.description}</Text>}
      {item.entry_point && (
        <Text style={styles.itemMeta}>{i18n.t('exports:pdf.labels.entryPoint', { value: item.entry_point })}</Text>
      )}
    </View>
  )
}

function PlanWeekCard({ week, index }: { week: PlanWeek; index: number }) {
  const num = week.week ?? index + 1
  const title = week.title ?? week.name ?? week.timeframe ?? i18n.t('exports:pdf.plan.phaseFallback', { num })
  const items = week.actions ?? week.items ?? []
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{i18n.t('exports:pdf.plan.week', { num, title })}</Text>
      {items.map((a, j) => {
        const text = a.text ?? a.action ?? ''
        const responsable = a.responsable ?? a.contact
        const outil = a.outil ?? a.channel
        const suffix = [
          responsable && i18n.t('exports:pdf.labels.responsible', { value: responsable }),
          outil && i18n.t('exports:pdf.labels.channel', { value: outil }),
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <Bullet key={j}>
            {text}
            {suffix ? ` (${suffix})` : ''}
          </Bullet>
        )
      })}
    </View>
  )
}

// Les libellés sont résolus au rendu (pas à l'import) pour suivre la langue courante.
// i18n keys: exports:pdf.contactsTable.name | title | entity | role | priority | email
const TABLE_COLS = [
  { key: 'name', width: '20%' },
  { key: 'title', width: '22%' },
  { key: 'entity', width: '18%' },
  { key: 'role', width: '14%' },
  { key: 'priority', width: '8%' },
  { key: 'email', width: '18%' },
] as const

function ContactsTable({ contacts }: { contacts: AccountPdfData['contacts'] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {TABLE_COLS.map(col => (
          <Text key={col.key} style={[styles.th, { width: col.width }]}>
            {i18n.t(`exports:pdf.contactsTable.${col.key}`)}
          </Text>
        ))}
      </View>
      {contacts.map((c, i) => {
        const isLast = i === contacts.length - 1
        return (
          <View key={c.id} style={isLast ? styles.tableRowLast : styles.tableRow}>
            <Text style={[styles.td, { width: '20%' }]}>{c.full_name}</Text>
            <Text style={[styles.td, { width: '22%' }]}>{c.title || '-'}</Text>
            <Text style={[styles.td, { width: '18%' }]}>{c.entity || '-'}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{c.decision_role || '-'}</Text>
            <Text style={[styles.td, { width: '8%' }]}>{c.priority ?? '-'}</Text>
            <Text style={[styles.td, { width: '18%' }]}>{c.email || '-'}</Text>
          </View>
        )
      })}
    </View>
  )
}

/* -------------------------------------------------------------------- */
/*  Page « Organigramme de décision » (maquette 06_export_pdf_organigramme) */
/* -------------------------------------------------------------------- */
/*
 * Toutes les données de cette page viennent de `data.orgPage` — la MÊME vue
 * focale que l'onglet Organigramme (`buildFocalOrgView`, voir orgPageData.ts).
 * Rien n'est recalculé ici, et la copie réutilise `accountOrg:focal.*` /
 * `accountOrg:orgMap.*` : l'écran et le PDF disent la même phrase pour le
 * même fait.
 *
 * ⚠️ TRAIT PLEIN vs TRAIT POINTILLÉ — le cœur de l'organigramme du produit.
 * Un rattachement VÉRIFIÉ (`reporting.verified === true`) porte une bordure
 * PLEINE et le texte « Rattaché à… — lien vérifié ». Une hypothèse
 * (`verified === false`, qu'elle vienne d'une arête faible ou d'une
 * supposition du modèle) porte une bordure POINTILLÉE et se dit comme une
 * hypothèse (« N+1 supposé… aucune source ne l'a observé » / « Rattachement
 * probable… non vérifié »). Une personne SANS rattachement connu (`reporting:
 * null`) n'affiche RIEN — « le silence est un état correct » (FocalOrgView.tsx)
 * — jamais une ligne inventée pour remplir la carte.
 */

const ORG_CONTACTS_LIMIT = 10

function OrgCoverageCount({ value, label }: { value: number | null; label: string }) {
  return (
    <View style={styles.orgCoverageItem}>
      {value === null ? (
        <Text style={styles.orgCoverageUnknown}>{i18n.t('exports:pdf.orgPage.coverageUnknown')}</Text>
      ) : (
        <Text style={styles.orgCoverageValue}>{value}</Text>
      )}
      <Text style={styles.orgCoverageLabel}>{label}</Text>
    </View>
  )
}

function OrgCoverageBanner({ coverage }: { coverage: AccountPdfOrgPage['coverage'] }) {
  return (
    <View style={styles.orgCoverageBanner}>
      <OrgCoverageCount value={coverage.discovered} label={i18n.t('accountOrg:focal.coverage.discovered')} />
      <OrgCoverageCount value={coverage.attachedToEntity} label={i18n.t('accountOrg:focal.coverage.attached')} />
      <OrgCoverageCount value={coverage.llmEnriched} label={i18n.t('accountOrg:focal.coverage.enriched')} />
      {/* Louis 12/10/2026 — même règle que l'écran : aucune arête, pas de trois zéros. */}
      {orgHasHierarchyEdges(coverage) ? (
        <>
          {/* #1 (recette 13/10) — zéro vérifié se dit, il ne se chiffre pas. */}
          {coverage.hierarchyVerified === 0 ? (
            <Text style={styles.orgCoverageLabel}>{i18n.t('accountOrg:focal.coverage.noneVerified')}</Text>
          ) : (
            <OrgCoverageCount
              value={coverage.hierarchyVerified}
              label={i18n.t('accountOrg:focal.coverage.verifiedLinks')}
            />
          )}
          <OrgCoverageCount
            value={coverage.hierarchyProbable}
            label={i18n.t('accountOrg:focal.coverage.probableLinks')}
          />
          <OrgCoverageCount
            value={coverage.uncoveredZones}
            label={i18n.t('accountOrg:focal.coverage.uncoveredZones')}
          />
        </>
      ) : (
        <Text style={styles.orgCoverageLabel}>{i18n.t('accountOrg:focal.coverage.noHierarchy')}</Text>
      )}
    </View>
  )
}

function OrgDecisionBadgeChip({ badge }: { badge: OrgDecisionBadge | null }) {
  // `null` = le graphe ne sait pas situer cette personne : pas de pastille
  // inventée (voir focalOrgData.decisionBadgeOf).
  if (!badge) return null
  const pal = decisionBadgePalette(badge)
  return (
    <Text style={[styles.orgPersonBadge, { backgroundColor: pal.bg, color: pal.fg }]}>
      {i18n.t(`accountOrg:focal.badges.${badge}`)}
    </Text>
  )
}

function OrgRecommendedPath({ view }: { view: AccountPdfOrgPage }) {
  return (
    <View style={styles.orgPathColumn}>
      <SubHeader>{i18n.t('accountOrg:focal.pathTitle')}</SubHeader>
      {view.path.length === 0 ? (
        <Empty>{i18n.t('exports:pdf.orgPage.noPath')}</Empty>
      ) : (
        view.path.map(step => (
          <View key={step.person.id} style={styles.orgPathStep}>
            <View style={styles.orgStepBadge}>
              <Text style={styles.orgStepBadgeText}>{step.step}</Text>
            </View>
            <View style={styles.orgPathStepBody}>
              <Text style={styles.orgPathStepName}>{step.person.fullName}</Text>
              {step.person.title ? <Text style={styles.orgPathStepTitle}>{step.person.title}</Text> : null}
              <Text style={styles.orgPathStepObjective}>{step.objective}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

/** Une carte de personne de l'arbre — voir le docblock plein/pointillé ci-dessus. */
function OrgPersonNode({ person }: { person: FocalPersonCard }) {
  const reporting = person.reporting
  // `reportingLineStyle` est une fonction PURE testée en isolation
  // (`styles.reportingLineStyle.test.ts`) : elle seule décide plein vs
  // pointillé, ce composant ne fait que la lire.
  const line = reportingLineStyle(reporting)
  return (
    <View style={[styles.orgPersonCard, { borderLeftColor: line.color, borderLeftStyle: line.borderStyle }]}>
      {person.badge ? (
        <View style={styles.orgPersonBadgeRow}>
          <OrgDecisionBadgeChip badge={person.badge} />
        </View>
      ) : null}
      <Text style={styles.orgPersonName}>{person.fullName}</Text>
      {person.title ? <Text style={styles.orgPersonTitle}>{person.title}</Text> : null}
      {reporting ? (
        <Text style={[styles.orgPersonReporting, { color: line.color }]}>
          {reporting.verified
            ? i18n.t('accountOrg:focal.reportsToVerified', { name: reporting.managerName })
            : reporting.origin === 'hypothesis'
              ? i18n.t('accountOrg:focal.reportsToAssumed', { name: reporting.managerName })
              : i18n.t('accountOrg:focal.reportsToProbable', {
                  name: reporting.managerName,
                  confidence: reporting.confidence,
                })}
        </Text>
      ) : null}
    </View>
  )
}

function OrgDecisionTree({ view }: { view: AccountPdfOrgPage }) {
  return (
    <View style={styles.orgTreeColumn}>
      <SubHeader>{i18n.t('accountOrg:focal.treeTitle', { direction: view.direction.name })}</SubHeader>
      {view.levelRows.map(row => (
        <View key={row.level} style={styles.orgLevelRow}>
          <View style={styles.orgLevelLabel}>
            <Text style={styles.orgLevelBadge}>{row.level}</Text>
          </View>
          <View style={styles.orgLevelPeople}>
            {row.people.map(person => (
              <OrgPersonNode key={person.id} person={person} />
            ))}
          </View>
        </View>
      ))}
      {view.unleveled.length > 0 ? (
        <View style={styles.orgLevelRow}>
          <View style={styles.orgLevelLabel}>
            <Text style={styles.itemMeta}>{i18n.t('exports:pdf.orgPage.unleveled')}</Text>
          </View>
          <View style={styles.orgLevelPeople}>
            {view.unleveled.map(person => (
              <OrgPersonNode key={person.id} person={person} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

// i18n keys: exports:pdf.orgPage.table.name | title | entity | level | role | state
const ORG_TABLE_COLS = [
  { key: 'name', width: '22%' },
  { key: 'title', width: '24%' },
  { key: 'entity', width: '18%' },
  { key: 'level', width: '10%' },
  { key: 'role', width: '14%' },
  { key: 'state', width: '12%' },
] as const

function OrgContactsTable({ people }: { people: FocalPersonCard[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {ORG_TABLE_COLS.map(col => (
          <Text key={col.key} style={[styles.th, { width: col.width }]}>
            {i18n.t(`exports:pdf.orgPage.table.${col.key}`)}
          </Text>
        ))}
      </View>
      {people.map((p, i) => {
        const isLast = i === people.length - 1
        return (
          <View key={p.id} style={isLast ? styles.tableRowLast : styles.tableRow}>
            <Text style={[styles.td, { width: '22%' }]}>{p.fullName}</Text>
            <Text style={[styles.td, { width: '24%' }]}>{p.title || '-'}</Text>
            <Text style={[styles.td, { width: '18%' }]}>{p.entityName || '-'}</Text>
            <Text style={[styles.td, { width: '10%' }]}>{p.level || '-'}</Text>
            <Text style={[styles.td, { width: '14%' }]}>
              {p.badge ? i18n.t(`accountOrg:focal.badges.${p.badge}`) : '-'}
            </Text>
            <Text style={[styles.td, { width: '12%' }]}>
              {i18n.t(`accountOrg:orgMap.identityStatus.${p.identityStatus}`)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function OrgContactsSection({ view }: { view: AccountPdfOrgPage }) {
  const shown = view.contacts.slice(0, ORG_CONTACTS_LIMIT)
  if (shown.length === 0) return null
  // Honnêteté du total (FocalOrgView.tsx, `FocalContactsTable`) : ce tableau
  // ne montre jamais tout le compte sans le dire. `discovered` peut être
  // `null` (dossier ancien, sans bandeau de couverture) — alors on ne
  // fabrique pas de compte « + N autres », on se tait.
  const total = view.coverage.discovered
  const hidden = total !== null ? Math.max(0, total - shown.length) : null
  return (
    <>
      <SectionHeader>{i18n.t('exports:pdf.orgPage.contactsTitle')}</SectionHeader>
      <OrgContactsTable people={shown} />
      {hidden !== null && hidden > 0 ? (
        <Text style={styles.orgMoreContacts}>{i18n.t('exports:pdf.orgPage.moreContacts', { count: hidden })}</Text>
      ) : null}
    </>
  )
}

function OrgRecommendationBanner({ view }: { view: AccountPdfOrgPage }) {
  if (!view.verdict) return null
  return (
    <View style={styles.orgRecommendationBanner}>
      <Text style={styles.orgRecommendationTitle}>
        {i18n.t('exports:pdf.orgPage.recommendationTitle', { name: view.verdict.name })}
      </Text>
      <Text style={styles.orgRecommendationBody}>
        {view.verdict.objective}
        {view.verdict.unlocks ? ` ${i18n.t('accountOrg:focal.verdictUnlocks', { unlocks: view.verdict.unlocks })}` : ''}
      </Text>
      {/* Décision 5 du FINAL : un bloqueur retiré du chemin est NOMMÉ, jamais tu. */}
      {view.excludedBlockers.length > 0 ? (
        <Text style={[styles.itemMeta, { marginTop: 4, marginBottom: 0 }]}>
          {i18n.t('accountOrg:focal.blockersExcluded', {
            count: view.excludedBlockers.length,
            names: view.excludedBlockers.map(b => b.fullName).join(', '),
          })}
        </Text>
      ) : null}
    </View>
  )
}

function OrgDecisionPage({ data }: { data: AccountPdfData }) {
  const view = data.orgPage
  // Pas de graphe → pas de page, jamais un organigramme vide ou inventé.
  if (!view) return null
  const dateLabel = formatDate(data.generatedAt)
  const title = i18n.t('exports:pdf.header.title', { company: capitalize(data.companyName) })
  const contactsCap = pdfContactsCap(data)
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {i18n.t('exports:pdf.orgPage.subtitle', { direction: view.direction.name })}
        </Text>
      </View>

      <SectionHeader>{i18n.t('exports:pdf.orgPage.sectionTitle')}</SectionHeader>
      <OrgCoverageBanner coverage={view.coverage} />

      <View style={styles.orgColumns}>
        <OrgRecommendedPath view={view} />
        <OrgDecisionTree view={view} />
      </View>

      <OrgContactsSection view={view} />
      <OrgRecommendationBanner view={view} />

      <View style={styles.footer} fixed>
        <Text>{i18n.t('exports:pdf.footer.generatedBy', { date: dateLabel })}</Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  )
}

export function AccountPdfDocument({ data, brand }: AccountPdfDocumentProps) {
  const dateLabel = formatDate(data.generatedAt)
  const title = i18n.t('exports:pdf.header.title', { company: capitalize(data.companyName) })
  const contactsCap = pdfContactsCap(data)
  return (
    <Document title={title} author={brand.name} subject={i18n.t('exports:pdf.header.subject')}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{i18n.t('exports:pdf.header.generatedOn', { date: dateLabel })}</Text>
          {data.priorityScore !== null && (
            <Text style={styles.scoreBadge}>
              {i18n.t('exports:pdf.header.priorityScore', { score: data.priorityScore })}
            </Text>
          )}
        </View>

        <SectionHeader>{i18n.t('exports:pdf.sections.generalInfo')}</SectionHeader>
        <View style={styles.card}>
          <InfoRow label={i18n.t('exports:pdf.info.sector')} value={data.info.sector} />
          <InfoRow label={i18n.t('exports:pdf.info.employees')} value={data.info.employees} />
          <InfoRow label={i18n.t('exports:pdf.info.revenue')} value={data.info.revenue} />
          <InfoRow label={i18n.t('exports:pdf.info.headquarters')} value={data.info.headquarters} />
          <InfoRow label={i18n.t('exports:pdf.info.website')} value={data.info.website} last />
        </View>

        {data.subsidiaries.length > 0 && (
          <>
            <SubHeader>{i18n.t('exports:pdf.sections.subsidiaries')}</SubHeader>
            <Text style={styles.paragraph}>{data.subsidiaries.join(', ')}</Text>
          </>
        )}

        {data.technologyStack.length > 0 && (
          <>
            <SectionHeader>{i18n.t('exports:pdf.sections.techStack')}</SectionHeader>
            {data.technologyStack.map((t, i) => (
              <TechCard key={`tech-${i}`} item={t} />
            ))}
          </>
        )}

        {data.programNames.length > 0 && (
          <>
            <SubHeader>{i18n.t('exports:pdf.sections.itPrograms')}</SubHeader>
            {data.programNames.map((p, i) => (
              <Bullet key={`prog-${i}`}>{p}</Bullet>
            ))}
          </>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.itChallenges')}</SectionHeader>
        {data.itChallenges.length > 0 ? (
          data.itChallenges.map((c, i) => <ChallengeCard key={`ch-${i}`} item={c} />)
        ) : (
          <Empty>{i18n.t('exports:pdf.empty.itChallenges')}</Empty>
        )}

        {data.pains.length > 0 && (
          <>
            <SectionHeader>{i18n.t('exports:pdf.sections.pains')}</SectionHeader>
            {data.pains.map((p, i) => (
              <PainCard key={`pain-${i}`} item={p} />
            ))}
          </>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.recentSignals')}</SectionHeader>
        {data.recentSignals.length > 0 ? (
          data.recentSignals.map((s, i) => <SignalCard key={`sig-${i}`} item={s} />)
        ) : (
          <Empty>{i18n.t('exports:pdf.empty.recentSignals')}</Empty>
        )}

        {data.facts && (
          <>
            <SectionHeader>{i18n.t('exports:pdf.sections.accountFacts')}</SectionHeader>
            {data.facts.deals.length > 0 && (
              <>
                <SubHeader>{i18n.t('accountFacts:brief.deals')}</SubHeader>
                {data.facts.deals.map((f, i) => (
                  <FactLine key={`deal-${i}`} fact={f} />
                ))}
              </>
            )}
            {data.facts.missions.length > 0 && (
              <>
                <SubHeader>{i18n.t('accountFacts:brief.missions')}</SubHeader>
                {data.facts.missions.map((f, i) => (
                  <FactLine key={`mission-${i}`} fact={f} />
                ))}
              </>
            )}
            {data.facts.recurringNeeds.length > 0 && (
              <>
                <SubHeader>{i18n.t('accountFacts:brief.recurringNeeds')}</SubHeader>
                {data.facts.recurringNeeds.map((n, i) => (
                  <Text key={`need-${i}`} style={styles.itemMeta}>
                    {i18n.t('accountFacts:brief.recurringLine', {
                      label: n.label,
                      count: n.occurrences,
                      date: formatDate(new Date(n.lastDate)),
                    })}
                  </Text>
                ))}
              </>
            )}
            {data.facts.exchanges.length > 0 && (
              <>
                <SubHeader>{i18n.t('accountFacts:brief.exchanges')}</SubHeader>
                {data.facts.exchanges.map((f, i) => (
                  <FactLine key={`exchange-${i}`} fact={f} />
                ))}
              </>
            )}
          </>
        )}

        {data.competitors.length > 0 && (
          <>
            <SectionHeader>{i18n.t('exports:pdf.sections.competitors')}</SectionHeader>
            {data.competitors.map((c, i) => (
              <CompetitorCard key={`comp-${i}`} item={c} />
            ))}
          </>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.contacts', { total: data.contactsTotal })}</SectionHeader>
        {data.contacts.length > 0 ? (
          <>
            <ContactsTable contacts={data.contacts} />
            {/* #4292.13 — le PDF annonce lui-même son plafond (« 40 contacts sur 1 212 »). */}
            {contactsCap ? (
              <Text style={styles.orgMoreContacts}>
                {i18n.t('exports:pdf.contactsMore', { ...contactsCap, brand: brand.name })}
              </Text>
            ) : null}
          </>
        ) : (
          <Empty>{i18n.t('exports:pdf.empty.contacts')}</Empty>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.angles')}</SectionHeader>
        {data.angles.length > 0 ? (
          data.angles.map((a, i) => <AngleCard key={`ang-${i}`} item={a} />)
        ) : (
          <Empty>{i18n.t('exports:pdf.empty.angles')}</Empty>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.actionPlan')}</SectionHeader>
        {data.strategy && (
          <View style={styles.card}>
            {data.strategy.type && (
              <Text style={styles.itemTitle}>
                {i18n.t('exports:pdf.labels.strategy', { value: data.strategy.type })}
              </Text>
            )}
            {data.strategy.justification && <Text style={styles.itemBody}>{data.strategy.justification}</Text>}
          </View>
        )}
        {data.planWeeks.length > 0 ? (
          data.planWeeks.map((w, i) => <PlanWeekCard key={`wk-${i}`} week={w} index={i} />)
        ) : (
          <Empty>{i18n.t('exports:pdf.empty.actionPlan')}</Empty>
        )}

        {data.ouvrir && (
          <>
            <SubHeader>{i18n.t('exports:pdf.sections.howToOpen')}</SubHeader>
            {data.ouvrir.strategy && (
              <Text style={styles.paragraph}>
                {i18n.t('exports:pdf.labels.entryStrategy', { value: data.ouvrir.strategy })}
              </Text>
            )}
            {data.ouvrir.entryPoints.map((e, i) => (
              <View key={`ep-${i}`} style={styles.card}>
                <Text style={styles.itemTitle}>{e.label}</Text>
                {e.target_profile && (
                  <Text style={styles.itemMeta}>
                    {i18n.t('exports:pdf.labels.targetProfile', { value: e.target_profile })}
                  </Text>
                )}
                {e.justification && <Text style={styles.itemBody}>{e.justification}</Text>}
              </View>
            ))}
          </>
        )}

        <SectionHeader>{i18n.t('exports:pdf.sections.evaluation')}</SectionHeader>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[styles.itemMeta, { marginRight: 6 }]}>{i18n.t('exports:pdf.evaluation.decision')}</Text>
            <Text
              style={
                data.evaluation.decision === 'GO'
                  ? styles.decisionGo
                  : data.evaluation.decision === 'NO-GO'
                    ? styles.decisionNoGo
                    : styles.decisionPending
              }
            >
              {data.evaluation.decision === 'A_QUALIFIER'
                ? i18n.t('exports:pdf.evaluation.notEvaluated')
                : data.evaluation.decision}
            </Text>
            <Text style={[styles.itemMeta, { marginLeft: 12 }]}>
              {i18n.t('exports:pdf.evaluation.globalScore', { score: data.evaluation.score })}
            </Text>
          </View>
          {data.evaluation.justification && <Text style={styles.itemBody}>{data.evaluation.justification}</Text>}
          {data.evaluation.recommendation && (
            <Text style={styles.itemHighlight}>
              {i18n.t('exports:pdf.labels.recommendation', { value: data.evaluation.recommendation })}
            </Text>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{i18n.t('exports:pdf.footer.generatedBy', { date: dateLabel })}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* Page dédiée « Organigramme de décision » — omise quand le dossier ne
          porte pas de graphe (`data.orgPage === null`). */}
      {data.orgPage ? <OrgDecisionPage data={data} /> : null}
    </Document>
  )
}
