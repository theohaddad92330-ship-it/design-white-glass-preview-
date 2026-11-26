import { computeHierarchyLevel, isKnownContactSource } from '@bellum/contracts'
import { DEMO_KNOWN_CONTACTS_RELATION } from './demo-coverage'
import { DEMO_DOSSIERS, demoContactSource } from './demo-dataset'

/**
 * #4678-#4680 (craft rule n°9) — « ET EN DÉMONSTRATION, UN CONTACT IMPORTÉ DU CRM MONTRE QUOI ? »
 *
 * Un contact venu d'un import est une relation connue : bloc « Connu » en tête de la liste, place dans
 * l'organigramme, badge de présence. Sans compte importé portant au moins deux contacts connus — dont un en
 * doublon probable avec un contact DÉDUIT du graphe —, un prospect découvrirait en réunion que ces écrans sont
 * vides. Cette garde relit le SEMIS ; elle sait dire NON (un compte importé sans contact connu, ou sans doublon à
 * montrer, la fait rougir) et lit le prédicat des contrats, jamais une liste recopiée.
 *
 * Aucune table ni clé de `raw_analysis` neuve : `contacts.source`, `record_import_marks` et le graphe sont déjà
 * classés dans `demo-coverage.ts` (seedés). Rien n'est donc déplacé vers « vide à dessein ».
 */
describe('couverture démo — un contact importé du CRM est une relation (#4678-#4680)', () => {
  const imported = DEMO_DOSSIERS.filter(dossier => dossier.account.origin === 'import')
  const known = (dossier: (typeof DEMO_DOSSIERS)[number]) =>
    dossier.contacts.filter(contact => isKnownContactSource(demoContactSource(contact.full_name)))

  it('lit un corpus non vide : un compte versé par un import existe', () => {
    expect(imported.length).toBeGreaterThanOrEqual(1)
  })

  it('un compte importé porte au moins deux contacts connus', () => {
    expect(imported.some(dossier => known(dossier).length >= 2)).toBe(true)
  })

  it('SAIT DIRE NON — tous les contacts de la salle ne sont pas « connus » (le bloc discrimine)', () => {
    for (const dossier of imported) expect(known(dossier).length).toBeLessThan(dossier.contacts.length)
  })

  it('l’un d’eux occupe la place d’un contact DÉDUIT du graphe : même famille, même niveau — doublon probable', () => {
    const levelOf = {
      governance: 'L0',
      c_level: 'L1',
      direction: 'L2',
      management: 'L3',
      expert: 'L4',
      operationnel: 'L4',
    }
    const duplicates = imported.flatMap(dossier => {
      const graph = (
        dossier.account.raw_analysis as { org?: { orgGraph?: { people?: Array<Record<string, unknown>> } } }
      ).org?.orgGraph
      return known(dossier).filter(contact =>
        (graph?.people ?? []).some(
          person =>
            person['roleInferred'] === true &&
            person['hierarchyLevel'] === levelOf[computeHierarchyLevel(contact.title) as keyof typeof levelOf] &&
            person['family'] === contact.family,
        ),
      )
    })
    expect(duplicates.length).toBeGreaterThanOrEqual(1)
  })

  it('un contact connu sans niveau rangeable (achats) est semé : le bloc « Connus de l’équipe » a de quoi s’afficher', () => {
    const pinned = imported.flatMap(known).filter(contact => computeHierarchyLevel(contact.title) === 'achats')
    expect(pinned.length).toBeGreaterThanOrEqual(1)
  })

  it('les contacts connus semés sont des personnes SIMULÉES : aucune coordonnée réelle', () => {
    for (const contact of imported.flatMap(known)) {
      if (!contact.email) continue
      expect(contact.email).toMatch(/\.example$/)
    }
  })
  it('classe la nouveauté « seedée » et nomme sa source — jamais « vide à dessein »', () => {
    expect(DEMO_KNOWN_CONTACTS_RELATION.state).toBe('seede')
    expect(DEMO_KNOWN_CONTACTS_RELATION.reason).toMatch(/DENSITY\.Kiabi/)
  })
})
