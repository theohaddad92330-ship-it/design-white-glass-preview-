import { describe, expect, it } from 'vitest'
import { companyNameRejection, normalizeCompanyTarget, startAnalysisSchema } from './analysis.js'

/**
 * Le garde du nom d'entreprise.
 *
 * Il existe parce qu'une analyse complète a réellement tourné en production sur
 * « Que penses-tu de Saint-Gobain ? » — huit crédits dépensés, aucun fait
 * sourcé. Ces tests protègent les deux côtés du compromis : attraper la phrase,
 * ne JAMAIS refuser une raison sociale.
 */
describe('companyNameRejection', () => {
  it('accepte les raisons sociales, même longues ou ponctuées', () => {
    const legitimate = [
      'BPCE',
      'Saint-Gobain',
      'Compagnie Générale des Établissements Michelin',
      'LVMH Moët Hennessy Louis Vuitton',
      'Société Générale S.A.',
      'BNP Paribas',
      'ALSACE SELESTAT DISTRIBUTION - ALSEDIS',
      'Ernst & Young et Associés',
      'AB InBev France Wholesaler S.A.S.',
    ]
    for (const name of legitimate) expect(companyNameRejection(name)).toBeNull()
  })

  it('refuse une question — le cas réellement observé en production', () => {
    expect(companyNameRejection('Que penses-tu de Saint-Gobain ?')).toContain('question')
  })

  it('refuse une phrase sans point d’interrogation', () => {
    expect(
      companyNameRejection('peux tu me trouver des informations sur la société Saint Gobain pour un rendez vous'),
    ).toContain('phrase')
  })

  it('refuse une saisie vide ou blanche', () => {
    expect(companyNameRejection('   ')).not.toBeNull()
  })

  it('dit quoi faire, jamais seulement que c’est refusé', () => {
    // Un refus qui n'explique rien renvoie l'utilisateur à son incompréhension.
    for (const bad of ['Que penses-tu de X ?', '   ', 'a '.repeat(20)]) {
      const message = companyNameRejection(bad)
      expect(message).toBeTruthy()
      expect(message?.toLowerCase()).toMatch(/saisis/)
    }
  })
})

describe('startAnalysisSchema', () => {
  it('coupe les espaces autour du nom', () => {
    const parsed = startAnalysisSchema.parse({ company_name: '  BPCE  ' })
    expect(parsed.company_name).toBe('BPCE')
  })

  it('rejette la question AVANT que le moindre crédit ne soit débité', () => {
    const result = startAnalysisSchema.safeParse({ company_name: 'Que penses-tu de Saint-Gobain ?' })
    expect(result.success).toBe(false)
  })

  it('normalise une URL en nom cherchable avant le débit (#2149.17)', () => {
    const parsed = startAnalysisSchema.parse({ company_name: 'https://www.capgemini.com/fr' })
    expect(parsed.company_name).toBe('capgemini')
  })
})

/**
 * #2149.17 — CIBLE ADMISSIBLE : L'URL EST DÉTERMINÉE.
 *
 * Tranché sans Louis (écrivain de nuit, 25/09/2026) : des deux cibles nommées
 * par le point (fichier, URL), seule l'URL est prouvable sans stockage ni
 * décision produit sur un contenu accepté — une URL se réduit à un nom
 * cherchable et retraverse le pipeline de résolution EXISTANT (Pappers), sans
 * connecteur ni donnée inventée. Avant ce correctif, une URL collée dans la
 * barre passait le garde-fou `companyNameRejection` telle quelle (pas de
 * « ? », peu de mots) et débitait un run sur une requête que le registre ne
 * résout jamais — même défaut de production que la phrase-question qui a créé
 * ce garde-fou. La cible FICHIER reste hors de cette tranche : aucune
 * capacité de dépôt de fichier n'existe nulle part dans le produit (grep
 * vide), et l'improviser inventerait un contrat de contenu non vérifiable
 * (doctrine : « un contrat d'API non vérifiable ne se devine pas »).
 */
describe('normalizeCompanyTarget', () => {
  it('laisse une raison sociale intacte', () => {
    for (const name of ['BPCE', 'Société Générale S.A.', 'Ernst & Young et Associés']) {
      expect(normalizeCompanyTarget(name)).toBe(name)
    }
  })

  it('détermine une URL comme cible admissible et la réduit à un nom cherchable', () => {
    expect(normalizeCompanyTarget('https://www.capgemini.com')).toBe('capgemini')
    expect(normalizeCompanyTarget('www.capgemini-invent.fr/carrieres')).toBe('capgemini invent')
    expect(normalizeCompanyTarget('orange.fr')).toBe('orange')
  })

  it('rend la saisie telle quelle si elle ne ressemble pas à une URL', () => {
    expect(normalizeCompanyTarget('Saint-Gobain')).toBe('Saint-Gobain')
  })

  // #2149.17 — l'AUTRE cible admissible : le nom d'un fichier déposé.
  it('détermine un nom de fichier comme cible admissible et écarte son extension', () => {
    expect(normalizeCompanyTarget('Cahier des charges - Renault.pdf')).toBe('Cahier des charges Renault')
    expect(normalizeCompanyTarget('capgemini.pdf')).toBe('capgemini')
    expect(normalizeCompanyTarget('proposition_commerciale_Michelin.docx')).toBe('proposition commerciale Michelin')
    expect(normalizeCompanyTarget('Fiche-entreprise-Orange.PPTX')).toBe('Fiche entreprise Orange')
  })
})
