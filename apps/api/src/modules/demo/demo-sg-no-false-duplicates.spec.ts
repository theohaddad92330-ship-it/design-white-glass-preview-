import { proposeContactDuplicates } from '../contacts/contact-duplicate-proposals'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Le compte démo Société Générale ne montre AUCUN faux doublon au prospect : le classeur nomme la même personne
 * « Nom Prénom » et « Prénom NOM » (deux lignes d'une même source), et l'onglet Contacts annonçait « 17 doublons
 * possibles » sur des fiches que la démo a elle-même semées en double. La garde LIT le jeu final du compte.
 * (Les autres comptes gardent leurs paires : `demo-duplicate-proposals-coverage.spec.ts` exige qu'il en reste.)
 */
describe('démo SG — pas de faux doublons semés', () => {
  const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')

  it('LIT un jeu réel', () => {
    expect((sg?.contacts ?? []).length).toBeGreaterThan(100)
  })

  it('aucune paire de doublon probable entre les contacts semés du compte', () => {
    const contacts = sg?.contacts ?? []
    const pairs = proposeContactDuplicates(
      contacts.map((c, i) => ({
        id: String(i),
        accountId: 'a',
        fullName: c.full_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        linkedinUrl: c.linkedin_url ?? null,
        title: c.title ?? null,
      })),
    )
    expect(
      pairs.map(p => `${contacts[Number(p.leftId)]?.full_name} | ${contacts[Number(p.rightId)]?.full_name}`),
    ).toEqual([])
  })
})
