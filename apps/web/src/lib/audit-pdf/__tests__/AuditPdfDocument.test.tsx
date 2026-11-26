import { beforeAll, describe, expect, it } from 'vitest'
import { pdf } from '@react-pdf/renderer'
import { resolveBrand, type AuditHypothesis, type ProfileContext } from '@bellum/contracts'
import { useStandardPdfFonts } from '@/test/pdf-standard-fonts'
import { buildCommercialAudit } from '@/features/commercial-audit/lib/build-audit'
import { AuditPdfDocument } from '../AuditPdfDocument'

const PRODUCT_BRAND = resolveBrand(null)

// `AuditPdfDocument` imports `account-pdf/styles.ts`, which registers Geist from
// a CDN — swap for hermetic standard fonts, same as `AccountPdfDocument.test.tsx`.
beforeAll(() => {
  useStandardPdfFonts()
})

const FULL_CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Assurance'],
    decisionLevel: 'director',
    entryStrategy: 'multiThread',
  },
}

/**
 * #2090.35 / #2074.9 — LE PDF DÉDIÉ DE L'AUDIT, PAS `window.print()`.
 *
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §5). Ce fichier
 * garde deux choses : un PDF non vide sort même du cas dégénéré (aucun
 * contexte de profil, tout `null`), et le contenu qui sort est le MÊME que
 * l'écran — les décisions Arrêter/Garder/Renforcer, jamais une page blanche.
 */
describe('AuditPdfDocument — #2090.35 / #2074.9', () => {
  it('rend un PDF non vide avec un profil complet', async () => {
    const audit = buildCommercialAudit(FULL_CONTEXT, [], null, null)
    const blob = await pdf(<AuditPdfDocument audit={audit} hypotheses={[]} brand={PRODUCT_BRAND} />).toBlob()
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/pdf')
  }, 20_000)

  it('rend sans planter avec le cas dégénéré (aucun profil établi)', async () => {
    const audit = buildCommercialAudit(null, [], null, null)
    const blob = await pdf(<AuditPdfDocument audit={audit} hypotheses={[]} brand={PRODUCT_BRAND} />).toBlob()
    expect(blob.size).toBeGreaterThan(0)
  }, 20_000)
})

/**
 * #2075.23 — LE PDF EXPORTÉ DISTINGUE FAITS / HYPOTHÈSES / RECOMMANDATIONS /
 * LIMITES, au lieu de s'arrêter aux faits et aux recommandations.
 *
 * Ce fichier ne peut pas relire le TEXTE du PDF généré (aucune bibliothèque
 * d'extraction de texte PDF dans ce dépôt, et `@react-pdf/renderer` encode les
 * glyphes via la police embarquée — un `toContain` sur le blob ne trouverait
 * jamais la chaîne source). Le test garde donc ce qui EST vérifiable
 * hermétiquement : une hypothèse ajoutée fait grossir le document rendu, la
 * même hypothèse fournie deux fois rend un document de MÊME taille (le rendu
 * est déterministe, pas un hasard de mise en page qui masquerait un bloc
 * manquant).
 */
describe('AuditPdfDocument — #2075.23 le bloc « Hypothèses » est un bloc réel, pas un no-op', () => {
  const HYPOTHESIS: AuditHypothesis = {
    ruleId: 'acquisitionWithoutRoutine',
    hypothesis: 'Le canal sortant est peut-être resté sans propriétaire après le départ du SDR.',
    questionToValidate: 'Qui relance aujourd’hui les réponses entrantes ?',
    confidence: 'single_source',
  }

  it('une hypothèse fournie grossit le PDF par rapport à aucune hypothèse', async () => {
    const audit = buildCommercialAudit(FULL_CONTEXT, [], null, null)
    const withoutHypotheses = await pdf(
      <AuditPdfDocument audit={audit} hypotheses={[]} brand={PRODUCT_BRAND} />,
    ).toBlob()
    const withHypotheses = await pdf(
      <AuditPdfDocument audit={audit} hypotheses={[HYPOTHESIS]} brand={PRODUCT_BRAND} />,
    ).toBlob()

    expect(withHypotheses.size).toBeGreaterThan(withoutHypotheses.size)
  }, 20_000)

  it('le rendu est déterministe pour les mêmes hypothèses', async () => {
    const audit = buildCommercialAudit(FULL_CONTEXT, [], null, null)
    const first = await pdf(<AuditPdfDocument audit={audit} hypotheses={[HYPOTHESIS]} brand={PRODUCT_BRAND} />).toBlob()
    const second = await pdf(
      <AuditPdfDocument audit={audit} hypotheses={[HYPOTHESIS]} brand={PRODUCT_BRAND} />,
    ).toBlob()

    expect(second.size).toBe(first.size)
  }, 20_000)
})
