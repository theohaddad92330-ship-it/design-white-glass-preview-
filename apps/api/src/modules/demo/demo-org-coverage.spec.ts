import { deriveOrgCoverage, orgGraphSchema } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_ORG_PEOPLE_WITHOUT_RECORD } from './demo-org-graphs'

/**
 * Le bandeau de couverture d'un dossier de démonstration doit dire la VÉRITÉ
 * sur ce dossier-là.
 *
 * Pourquoi cette garde. Le bandeau annonce « N découverts · M enrichis », et
 * juste en dessous « Voir tous les contacts » ouvre la liste. Si les deux
 * nombres viennent de sources différentes, un prospect clique sur « 340 » et
 * trouve 12 fiches — c'est le pire moment possible pour découvrir un écart, et
 * c'est exactement ce que la parité de démonstration existe pour empêcher.
 *
 * Elle tient donc l'égalité, pas la présence : `discovered` DOIT être le nombre
 * de contacts réellement seedés sur le dossier, densification comprise.
 */
describe('couverture des organigrammes de démonstration', () => {
  it('lit un corpus non vide — une garde qui ne lit rien ne garde rien', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThanOrEqual(5)
  })

  for (const dossier of DEMO_DOSSIERS) {
    describe(dossier.account.company_name, () => {
      const org = (dossier.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
      const graph = orgGraphSchema.parse(org?.orgGraph)
      const header = deriveOrgCoverage(graph)

      it('annonce EXACTEMENT le nombre de contacts seedés sur le dossier', () => {
        expect(header.discovered).toBe(dossier.contacts.length)
      })

      it('n’annonce comme enrichis que les contacts dont l’identité est résolue', () => {
        const enriched = dossier.contacts.filter(c => c.lifecycle_state !== 'detecte').length
        expect(header.llmEnriched).toBe(enriched)
        expect(header.llmEnriched!).toBeLessThanOrEqual(header.discovered!)
      })

      it('situe déterministiquement tout contact qui porte une famille', () => {
        const situated = dossier.contacts.filter(c => c.family.trim().length > 0).length
        expect(header.deterministicClassified).toBe(situated)
      })

      it('dit la taille de vague, pour que le CTA annonce son coût avant le clic', () => {
        expect(header.enrichmentBatchSize).toBe(50)
      })

      it('ne devine PAS le rattachement à une entité — le trou reste nommé', () => {
        // Le graphe rattache les personnes qu'il porte ; le corpus, lui, n'est
        // pas rattaché. Écrire un nombre ici ferait passer un compte d'enrichis
        // pour un compte de rattachés.
        expect(header.attachedToEntity).toBeNull()
        expect(header.unassigned).toBeNull()
      })

      it('#2543.5f/.5g — ne devine PAS l’état de la source, ni le repli, ni l’élargissement : vide à dessein, zéro appel réseau', () => {
        // Un dossier de démonstration est SEEDÉ, jamais collecté par une
        // vraie recherche Apollo/repli web/passe d'élargissement — écrire un
        // `sourceStatus`, un `fallback` ou un `widened` ici fabriquerait un
        // fait qui n'a jamais eu lieu, exactement ce que la règle interdit
        // (même raisonnement que `attachedToEntity` juste au-dessus).
        // `CONTACTS_AUTO_WIDEN_DISABLED` est ACTIF par défaut depuis #2543.5g
        // (agent_docs/env-reference.md) — mais ça ne change rien ICI : la
        // passe ne part que dans `phase2_contacts.py`, sur une vraie requête
        // Apollo, et un dossier de démonstration n'en lance jamais aucune.
        //
        // #2658.1 (décision Louis, 21/09/2026) — l'écran qui lisait ce bloc,
        // `EngineCoverageFunnelBand`, a été retiré de l'onglet Contacts
        // (revient sur #2552.1) : cette garde continue de tenir la mesure
        // VRAIE côté API, même sans écran pour l'afficher.
        expect(header.sourceStatus).toBeNull()
        expect(header.sourceTotalEntries).toBeNull()
        expect(header.fallback).toBeNull()
        expect(header.widened).toBeNull()
      })

      it('reste une PROJECTION : le graphe ne recopie pas le corpus', () => {
        const contactSlugs = new Set(dossier.contacts.map(c => orgPersonSlug(c.full_name)))
        // EXEMPTION NOMMÉE (#4509) : la seule personne que la démo laisse SANS fiche pour montrer
        // « Créer sa fiche » (DEMO_ORG_PEOPLE_WITHOUT_RECORD) — aucune autre.
        const withoutRecord = DEMO_ORG_PEOPLE_WITHOUT_RECORD[dossier.account.company_name] ?? []
        const exempt = graph.people.filter(person => withoutRecord.includes(person.fullName))
        for (const person of graph.people) {
          if (!withoutRecord.includes(person.fullName)) expect(contactSlugs.has(person.id)).toBe(true)
        }
        expect(graph.people.length - exempt.length).toBeLessThanOrEqual(dossier.contacts.length)
      })
    })
  }

  it('au moins un dossier montre qu’il RESTE des contacts à enrichir', () => {
    // Sans celui-là, la démonstration n'aurait que des bandeaux où découverts
    // et enrichis sont égaux : le prospect ne verrait jamais l'état que la
    // fonctionnalité existe pour montrer — « il y en a plus que ce que tu vois ».
    const remaining = DEMO_DOSSIERS.map(d => {
      const org = (d.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
      return deriveOrgCoverage(orgGraphSchema.parse(org?.orgGraph)).remainingEnrichment ?? 0
    })
    expect(Math.max(...remaining)).toBeGreaterThan(0)
  })
})
