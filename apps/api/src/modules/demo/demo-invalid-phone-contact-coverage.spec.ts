import { looksLikePhoneNumber } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_INVALID_PHONE_CONTACT_COVERAGE } from './demo-coverage'

/**
 * #2297.33 / #2297.39 — « NUMÉRO INVALIDE », JAMAIS OBSERVABLE EN
 * DÉMONSTRATION.
 *
 * `ContactKeyInfo.tsx` (`phoneFormatInvalid`, `apps/web/…/contact-detail/components/`)
 * et `computeContactFieldStatus` (`packages/contracts/…/contact-enrichment.ts`)
 * savent déjà rendre le statut « invalid » — un téléphone stocké qui ne
 * ressemble plus à un numéro exploitable (`looksLikePhoneNumber`). Aucun
 * contact du jeu de démonstration ne porte cette forme : la ligne
 * `keyInfo.phoneInvalidHint` n'apparaissait dans AUCUN écran de salle démo.
 *
 * Cette garde SAIT DIRE NON : elle recompte, sur le jeu réellement construit
 * (`DEMO_DOSSIERS`, post-densification — exactement ce que `DemoSeedService`
 * écrit), qu'AU MOINS un contact reproduit la condition exacte que
 * `ContactKeyInfo` teste : `phone` non vide et `!looksLikePhoneNumber(phone)`.
 */
function hasInvalidPhone(contact: { phone?: string | null }): boolean {
  return Boolean(contact.phone) && !looksLikePhoneNumber(contact.phone ?? '')
}

describe('couverture démo — « numéro invalide » (#2297.33, #2297.39)', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
    expect(DEMO_DOSSIERS.some(dossier => dossier.contacts.length > 0)).toBe(true)
  })

  it('porte AU MOINS un contact au téléphone mal formé, sur un compte de démo réel', () => {
    const matches = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts.filter(hasInvalidPhone).map(contact => ({ company: dossier.account.company_name, contact })),
    )
    expect(matches.length).toBeGreaterThan(0)
  })

  it('le contact au téléphone invalide est visible chez SNCF', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    expect(sncf).toBeDefined()
    const matches = (sncf?.contacts ?? []).filter(hasInvalidPhone)
    expect(matches.length).toBeGreaterThan(0)
    // Une valeur RÉELLEMENT posée, jamais une chaîne vide qui ferait passer le test.
    expect(matches[0]?.phone).toBeTruthy()
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_INVALID_PHONE_CONTACT_COVERAGE.state).toBe('seede')
    expect(DEMO_INVALID_PHONE_CONTACT_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
