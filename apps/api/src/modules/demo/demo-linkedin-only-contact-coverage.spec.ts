import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_LINKEDIN_ONLY_CONTACT_COVERAGE } from './demo-coverage'

/**
 * #2629.2 — « LINKEDIN SEUL CANAL DISPONIBLE », JAMAIS OBSERVABLE EN
 * PRODUCTION.
 *
 * Mesuré en production le 22/09/2026 sur un compte réel (`/accounts/<id>?tab=contacts`,
 * vue « Par persona ») : les six contacts sans coordonnées affichent tous
 * « Aucun canal connu pour ce contact » — la chaîne « LinkedIn » est
 * INTROUVABLE dans l'`innerHTML` de la page entière. `getAvailableChannels` /
 * `channelFallback` (apps/web/…/contact-engagement/channel.ts) savent déjà
 * rendre l'état « linkedin-only » — un contact qui porte `linkedin_url` mais
 * NI `email` NI `phone` — c'est la DONNÉE qui n'existe nulle part dans le jeu
 * de démonstration, jamais le rendu. Décision Louis, 22/09/2026 : on sème le
 * cas plutôt que de toucher au produit.
 *
 * Cette garde SAIT DIRE NON : elle recompte, sur le JEU réellement construit
 * (`DEMO_DOSSIERS`, post-densification — exactement ce que `DemoSeedService`
 * écrit), qu'AU MOINS un contact reproduit la condition exacte que
 * `channelFallback` teste : `getSendableChannels` réduit à `['linkedin']`,
 * c'est-à-dire `linkedin_url` non vide, `email` ET `phone` absents.
 */
function isLinkedinOnly(contact: {
  email: string | null
  phone?: string | null
  linkedin_url?: string | null
}): boolean {
  return !contact.email && !contact.phone && !!contact.linkedin_url
}

describe('couverture démo — « LinkedIn seul canal disponible » (#2629.2)', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
    expect(DEMO_DOSSIERS.some(dossier => dossier.contacts.length > 0)).toBe(true)
  })

  it('porte AU MOINS un contact LinkedIn-seul, sur un compte de démo réel', () => {
    const matches = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts.filter(isLinkedinOnly).map(contact => ({ company: dossier.account.company_name, contact })),
    )
    expect(matches.length).toBeGreaterThan(0)
  })

  it('le contact LinkedIn-seul est visible chez SNCF (re-semé le 01/10/2026)', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    expect(sncf).toBeDefined()
    const matches = (sncf?.contacts ?? []).filter(isLinkedinOnly)
    expect(matches.length).toBeGreaterThan(0)
    // Une VRAIE url de profil, jamais une chaîne vide qui ferait passer le test.
    expect(matches[0]?.linkedin_url).toMatch(/^https:\/\/www\.linkedin\.com\/in\//)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_LINKEDIN_ONLY_CONTACT_COVERAGE.state).toBe('seede')
    expect(DEMO_LINKEDIN_ONLY_CONTACT_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})

/**
 * #3698 — « e-mail trouvé, pas de téléphone » : l'état partiel doit se voir en
 * salle de démonstration. La garde recompte sur le jeu CONSTRUIT : un e-mail
 * non vide ET aucun téléphone — et sait dire non si le contact en reçoit un.
 */
describe('couverture démo — « e-mail seul, sans téléphone » (#3698)', () => {
  it('porte au moins un contact avec e-mail et sans téléphone chez SNCF', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    const partial = (sncf?.contacts ?? []).filter(contact => !!contact.email && !contact.phone)
    expect(partial.length).toBeGreaterThan(0)
    expect(partial[0]?.email).toContain('@')
  })
})
