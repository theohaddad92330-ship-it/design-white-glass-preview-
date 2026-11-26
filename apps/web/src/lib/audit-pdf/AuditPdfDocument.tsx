import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { AuditHypothesis, Brand } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderAuditHeadlineText } from '@/features/commercial-audit/lib/audit-headline-text'
import { unestablishedReasonText } from '@/features/commercial-audit/components/AuditUnestablished'
import type {
  AuditColumn,
  AuditHeadline,
  AuditUnestablishedEntry,
  CommercialAudit,
} from '@/features/commercial-audit/lib/build-audit'
import { styles } from '@/lib/account-pdf/styles'

type AuditPdfDocumentProps = {
  audit: CommercialAudit
  /** #2075.23 — LES MÊMES hypothèses que `AuditHypotheses.tsx` (dérivées des
   *  mêmes contradictions, GA-26) : le bloc « Hypothèses » du PDF, distinct
   *  des faits (`headlines`) et des recommandations (`columns`). */
  hypotheses: readonly AuditHypothesis[]
  /**
   * La marque de l'espace — même règle que `AccountPdfDocument` : PASSÉE, pas
   * lue par un hook. `@react-pdf/renderer` rend cet arbre HORS de l'arbre
   * React de l'application, donc `useBrand()` y rendrait toujours la valeur
   * PAR DÉFAUT du contexte sans lever d'erreur — un faux vert parfait.
   */
  brand: Brand
}

function formatDate(date: Date): string {
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// `renderAuditHeadlineText` attend un `t` fixé sur le namespace `commercialAudit`
// (les mêmes clés que l'écran, `AuditHero.tsx`) — ici hors de tout composant,
// donc pas de `useTranslation`. `getFixedT` rend le même comportement.
const auditT = (): ReturnType<typeof i18n.getFixedT> => i18n.getFixedT(i18n.language, 'commercialAudit')

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

function Empty({ children }: { children: string }) {
  return <Text style={styles.emptyParagraph}>{children}</Text>
}

function HeadlineRow({ headline }: { headline: AuditHeadline }) {
  const t = auditT()
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{t(`headline.${headline.key}`)}</Text>
      {headline.value === null ? (
        <Text style={styles.itemBody}>{i18n.t('common:unknownValue')}</Text>
      ) : (
        <Text style={styles.itemBody}>{renderAuditHeadlineText(headline.value, t)}</Text>
      )}
    </View>
  )
}

function DecisionColumn({ column }: { column: AuditColumn }) {
  const t = auditT()
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{t(`columns.${column.key}`)}</Text>
      {column.items === null ? (
        <Empty>{t('columns.unmeasured')}</Empty>
      ) : column.items.length === 0 ? (
        <Empty>{t('columns.empty')}</Empty>
      ) : (
        column.items.map((item, index) => (
          <Text key={index} style={styles.bullet}>
            {'• '}
            {item}
          </Text>
        ))
      )}
    </View>
  )
}

function HypothesisRow({ hypothesis }: { hypothesis: AuditHypothesis }) {
  const t = auditT()
  return (
    <View style={styles.card}>
      <Text style={styles.itemTitle}>{t(`tensions.rule.${hypothesis.ruleId}.label`)}</Text>
      <Text style={styles.itemBody}>{hypothesis.hypothesis}</Text>
      {hypothesis.questionToValidate === null ? null : (
        <Text style={styles.itemBody}>
          {t('hypotheses.question')} : {hypothesis.questionToValidate}
        </Text>
      )}
    </View>
  )
}

function UnestablishedRow({ entry }: { entry: AuditUnestablishedEntry }) {
  const t = auditT()
  return (
    <Text style={styles.bullet}>
      {'• '}
      {t('unestablished.item', { label: t(`origin.${entry.key}`), reason: unestablishedReasonText(entry, t) })}
    </Text>
  )
}

/**
 * #2090.35 / #2074.9 — LE PDF DÉDIÉ DE L'AUDIT COMMERCIAL.
 *
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §5) : un
 * document `@react-pdf/renderer` dédié, comme le dossier de compte
 * (`AccountPdfDocument.tsx`) — jamais `window.print()`.
 *
 * #2075.23 — QUATRE blocs, jamais mélangés : les faits (`audit.headlines`,
 * MÊME texte que `AuditHero.tsx`), les hypothèses (`hypotheses`, MÊME
 * dérivation que `AuditHypotheses.tsx` sur les contradictions détectées —
 * nommées comme des hypothèses, jamais comme des faits), les recommandations
 * (`audit.columns` — Arrêter / Garder / Renforcer, MÊMES clés que
 * `AuditDecisionColumns.tsx`) et les limites (`audit.unestablished`, MÊME
 * raison que `AuditUnestablished.tsx` via `unestablishedReasonText`, réutilisée
 * telle quelle — GA-26, pas une seconde dérivation). Rien n'est recalculé :
 * ce fichier ne fait que RENDRE ce que `buildCommercialAudit` a déjà produit,
 * sur papier plutôt qu'à l'écran.
 */
export function AuditPdfDocument({ audit, hypotheses, brand }: AuditPdfDocumentProps) {
  const dateLabel = formatDate(new Date())
  // `{{brand}}` vient de `interpolation.defaultVariables` (`i18n/index.ts`),
  // MÊME patron que `exports:pdf.footer.generatedBy` ci-dessous — pas un
  // deuxième réglage de marque écrit ici (GA-26).
  const title = i18n.t('exports:pdf.audit.title')
  const t = auditT()

  return (
    <Document title={title} author={brand.name} subject={i18n.t('exports:pdf.audit.subject')}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{i18n.t('exports:pdf.header.generatedOn', { date: dateLabel })}</Text>
        </View>

        <SectionHeader>{i18n.t('exports:pdf.audit.sections.headlines')}</SectionHeader>
        {audit.headlines.map(headline => (
          <HeadlineRow key={headline.key} headline={headline} />
        ))}

        <SectionHeader>{t('columns.title')}</SectionHeader>
        {audit.columns.map(column => (
          <DecisionColumn key={column.key} column={column} />
        ))}

        <SectionHeader>{t('hypotheses.title')}</SectionHeader>
        {hypotheses.length === 0 ? (
          <Empty>{t('hypotheses.unmeasured')}</Empty>
        ) : (
          hypotheses.map(hypothesis => <HypothesisRow key={hypothesis.ruleId} hypothesis={hypothesis} />)
        )}

        <SectionHeader>{t('unestablished.title')}</SectionHeader>
        {audit.unestablished.length === 0 ? (
          <Empty>{t('unestablished.none')}</Empty>
        ) : (
          <View style={styles.card}>
            {audit.unestablished.map(entry => (
              <UnestablishedRow key={entry.key} entry={entry} />
            ))}
          </View>
        )}

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
    </Document>
  )
}
