import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { learnEmailPattern, renderEmailPattern, splitPersonName } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_ESTIMATED_EMAIL_CONTACTS } from './demo-dataset'

/**
 * #4016 L4.1 — craft rule n°9 : l'e-mail ESTIMÉ est SEMÉ en démonstration.
 *
 * Trois choses, chacune une protection :
 *  1. le contact estimé existe dans un dossier, et c'est une personne SIMULÉE
 *     (`.example`) — jamais une estimation posée sur une personne réelle ;
 *  2. son adresse est EXACTEMENT ce que le motif des autres adresses du compte
 *     donnerait — la salle montre ce que le produit déduirait, pas une valeur
 *     choisie à la main ;
 *  3. le semis l'écrit bien en `inferred` (et seulement en `inferred`), depuis
 *     le chemin qui sème les contacts du dossier.
 */
const SEED_SOURCE = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

describe('Démo — l’e-mail estimé est semé (#4016 L4.1)', () => {
  it('lit quelque chose : au moins un contact estimé est déclaré', () => {
    expect(DEMO_ESTIMATED_EMAIL_CONTACTS.length).toBeGreaterThan(0)
  })

  for (const name of DEMO_ESTIMATED_EMAIL_CONTACTS) {
    it(`${name} : personne simulée, adresse = le motif des adresses connues du compte`, () => {
      // Un dossier, ou le client de livraison (SNCF) qui porte les interlocuteurs SIMULÉS.
      const holders: { contacts: readonly { full_name: string; email?: string | null }[] }[] = [
        ...DEMO_DOSSIERS,
        DEMO_DELIVERY_CLIENT,
      ]
      const dossier = holders.find(entry => entry.contacts.some(contact => contact.full_name === name))
      expect(dossier).toBeDefined()
      const target = dossier?.contacts.find(contact => contact.full_name === name)
      expect(target?.email ?? '').toMatch(/\.example$/)

      const peers = (dossier?.contacts ?? [])
        .filter(contact => contact.full_name !== name && contact.email)
        .map(contact => ({ email: contact.email ?? null, fullName: contact.full_name, verified: true }))
      const learned = learnEmailPattern(peers)
      const parts = splitPersonName(name)
      expect(learned).not.toBeNull()
      expect(parts).not.toBeNull()
      if (learned && parts) expect(renderEmailPattern(learned.pattern, parts, learned.domain)).toBe(target?.email)
    })
  }

  it('le semis écrit une provenance `inferred` sur `email`, depuis les deux chemins qui sèment des contacts (dossiers et client de livraison)', () => {
    expect(SEED_SOURCE.split('await this.seedEstimatedEmails(saved, workspaceId)').length - 1).toBeGreaterThanOrEqual(2)
    expect(SEED_SOURCE).toMatch(/INSERT INTO field_provenance[\s\S]{0,200}'email', 'inferred'/)
  })

  // #4577.3 (Louis 01/11) revient sur #4016 L4.1 : UNE provenance `human` est semée, sur la fiche d'un TALENT (« Saisi à la
  // main »). Elle reste interdite sur un contact ou un compte : « corrigé à la main » sur un dossier que personne n'a
  // touché mentirait.
  it('sait dire NON : aucune provenance `human` n’est semée sur un contact ou un compte', () => {
    expect(SEED_SOURCE).not.toMatch(
      /INSERT INTO field_provenance[^`]{0,200}VALUES[^`]*'(?:contact|account)'[^`]*'human'/,
    )
  })
})
