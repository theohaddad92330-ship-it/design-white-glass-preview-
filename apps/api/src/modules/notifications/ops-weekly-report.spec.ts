import { buildWeeklyOpsEmail, type WeeklyOpsFacts } from './ops-weekly-report.service'

// `Intl` sépare le nombre de son unité par une espace fine INSÉCABLE
// (U+202F) — comparer des chaînes brutes ferait rougir ce fichier sur une
// autre machine sans qu'aucun calcul n'ait bougé (même remède que
// `cockpit-business.logic.test.ts` côté dashboard-manager).
function espacesNormales(texte: string): string {
  return texte.replace(/\s/g, ' ')
}

/**
 * #1648 — le rapport hebdomadaire du back-office : REVENUS / PRODUIT /
 * TECHNIQUE / CE QUI DEMANDE UNE DÉCISION, envoyé même si tout va bien.
 *
 * ⚠️⚠️ LES DEUX RÈGLES QUI SE RATENT, écrites comme deux tests DISTINCTS :
 *  1. « Aucune interprétation, aucun conseil. Des chiffres et des faits. »
 *  2. « Un chiffre non mesurable est ABSENT de l'email, pas affiché à zéro. »
 *     Et son INVERSE : une section MESURÉE à zéro (une vraie semaine sans
 *     activité) reste NOMMÉE dans l'email — ce n'est PAS la même chose qu'un
 *     chiffre non mesurable.
 *
 * Tout est pur : aucune horloge, aucune base, aucun envoi — voir
 * `ops-weekly-report.service.spec.ts` pour le service qui appelle ceci.
 */

const REVENUE_MESUREE: WeeklyOpsFacts['revenue'] = {
  mesure: true,
  month: '2026-08',
  mrrEndCents: 1_248_000,
  customersEnd: 16,
  mrrNewCents: 90_000,
  mrrExpansionCents: 58_000,
  mrrContractionCents: 0,
  mrrChurnedCents: 20_000,
}

const FACTS_TYPE: WeeklyOpsFacts = {
  weekLabel: 'Semaine du 01/09 au 07/09 2026',
  revenue: REVENUE_MESUREE,
  product: { newAccounts7d: 3, completedAnalyses7d: 5, activeAccountsNow: 42 },
  technical: { totalRuns7d: 6, failedRuns7d: 1, canceledRuns7d: 0 },
  cockpitUrl: 'https://backoffice.bellum-it.com/',
}

describe('buildWeeklyOpsEmail — #1648', () => {
  it('T1 — semaine SANS activité → l’email part quand même, sections MESURÉES à zéro NOMMÉES', () => {
    const email = buildWeeklyOpsEmail({
      ...FACTS_TYPE,
      product: { newAccounts7d: 0, completedAnalyses7d: 0, activeAccountsNow: 42 },
      technical: { totalRuns7d: 0, failedRuns7d: 0, canceledRuns7d: 0 },
    })
    const texte = email.bodyLines.join('\n')

    // L'email PART (ce test ne vérifie que sa construction — l'envoi
    // inconditionnel est le rôle du service, voir son propre spec).
    expect(email.bodyLines.length).toBeGreaterThan(0)
    // Les sections PRODUIT et TECHNIQUE nomment le zéro — elles ne
    // disparaissent pas.
    expect(texte).toMatch(/produit/i)
    expect(texte).toMatch(/0 nouveau/i)
    expect(texte).toMatch(/technique/i)
    expect(texte).toMatch(/0 analyse.*lancée/i)
  })

  it('T2 — un chiffre NON MESURABLE (premier mois, aucun terme de comparaison) est ABSENT, jamais 0', () => {
    const email = buildWeeklyOpsEmail({
      ...FACTS_TYPE,
      revenue: {
        mesure: true,
        month: '2026-05',
        mrrEndCents: 1_000_000,
        customersEnd: 13,
        mrrNewCents: null,
        mrrExpansionCents: null,
        mrrContractionCents: null,
        mrrChurnedCents: null,
      },
    })
    const texte = espacesNormales(email.bodyLines.join('\n'))

    // Ce qui EST mesuré (le total, les clients) reste présent.
    expect(texte).toContain('10 000 €')
    expect(texte).toContain('13 client')
    // Ce qui n'est PAS mesuré n'apparaît nulle part — ni en ligne, ni en 0 €.
    expect(texte).not.toMatch(/nouveau.*€/i)
    expect(texte).not.toMatch(/expansion/i)
    expect(texte).not.toMatch(/contraction/i)
    expect(texte).not.toMatch(/attrition|churn/i)
  })

  it('aucun mois JAMAIS figé → la section REVENUS nomme l’absence, sans chiffre inventé', () => {
    const email = buildWeeklyOpsEmail({
      ...FACTS_TYPE,
      revenue: { mesure: false, raison: 'Aucun mois figé — voir /revenus sur le cockpit.' },
    })
    const texte = email.bodyLines.join('\n')

    expect(texte).toMatch(/aucun mois figé/i)
    expect(texte).not.toMatch(/\d€|\d\s?€/)
  })

  it('AUCUNE INTERPRÉTATION, AUCUN CONSEIL — des mots qui jugent n’apparaissent jamais', () => {
    const email = buildWeeklyOpsEmail(FACTS_TYPE)
    const texte = email.bodyLines.join('\n').toLowerCase()

    for (const motInterdit of ['recommand', 'devrait', 'attention', 'alerte', 'risque de', 'il faudrait', 'urgent']) {
      expect(texte).not.toContain(motInterdit)
    }
  })

  it('un lien vers le cockpit, et RIEN DE PLUS — un seul CTA', () => {
    const email = buildWeeklyOpsEmail(FACTS_TYPE)
    expect(email.ctaUrl).toBe(FACTS_TYPE.cockpitUrl)
    expect(email.ctaLabel.length).toBeGreaterThan(0)
  })

  it('la section « ce qui demande une décision » ne duplique JAMAIS le calcul de la file (GA-26) — elle pointe vers le cockpit', () => {
    const email = buildWeeklyOpsEmail(FACTS_TYPE)
    const texte = email.bodyLines.join('\n')
    expect(texte).toMatch(/décision/i)
    expect(texte).toMatch(/cockpit/i)
  })

  it('le sujet et l’entête nomment la semaine, pas un total générique', () => {
    const email = buildWeeklyOpsEmail(FACTS_TYPE)
    expect(email.subject).toContain(FACTS_TYPE.weekLabel)
    expect(email.heading).toContain(FACTS_TYPE.weekLabel)
  })
})
