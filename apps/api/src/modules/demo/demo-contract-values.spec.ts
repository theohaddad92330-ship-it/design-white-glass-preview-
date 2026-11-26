import {
  APPLICATION_SECTOR_CODES,
  contactSourceSchema,
  decisionRoleSchema,
  DEFAULT_PARK_REASONS,
  offerDomainSchema,
  priorityGateSchema,
} from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { DENSIFIED_COMPANIES, densifiedContactsFor } from './demo-contact-density'

/**
 * Toute valeur que le seed de démonstration ÉCRIT doit être acceptée par la base.
 *
 * Le défaut que ce test verrouille a mis le lien de démonstration entièrement
 * hors service. La table de densité avait été écrite avec les libellés
 * FRANÇAIS des rôles — « prescripteur », « acheteur », « utilisateur »,
 * « influenceur », « décideur » — parce que c'est ainsi qu'un commercial les
 * nomme. Mais `contacts.decision_role` porte une contrainte `CHECK` sur
 * l'énumération canonique, et aucun de ces mots n'en fait partie.
 *
 * En production : `new row for relation "contacts" violates check constraint
 * "contacts_decision_role_check"`, `POST /demo/session` en 500, et « Démo
 * indisponible » pour tout visiteur. 209 contacts sur 5 comptes, aucun
 * insérable.
 *
 * Aucun test ne le voyait : le dataset se relit très bien en mémoire, et c'est
 * la BASE qui refuse. Ce test compare donc les valeurs produites au CONTRAT,
 * qui est la même source de vérité que la contrainte SQL — c'est la leçon déjà
 * apprise sur `account_vocabulary.kind` puis sur `contacts_source_check`.
 */
describe('les valeurs écrites par le seed de démonstration sont acceptées par la base', () => {
  const densified = DENSIFIED_COMPANIES.flatMap(company => densifiedContactsFor(company))

  it('la table de densité n’est pas vide', () => {
    // Un jeu vide ferait passer le test sans rien vérifier. Le plancher suit le
    // corpus RÉEL : depuis le 01/10/2026 la table ne densifie plus que deux
    // comptes cibles (Société Générale, SNCF — 90 contacts) ; Groupe BPCE porte
    // son CSV réel et ENGIE/TotalEnergies/Alstom leurs briefs, qui ne se
    // densifient PAS de personnes simulées (coordonnées réelles en clair).
    expect(DENSIFIED_COMPANIES.length).toBeGreaterThanOrEqual(2)
    expect(densified.length).toBeGreaterThan(50)
  })

  it('chaque contact densifié porte un rôle de décision canonique', () => {
    const invalid = [
      ...new Set(
        densified.map(contact => contact.decision_role).filter(role => !decisionRoleSchema.safeParse(role).success),
      ),
    ]
    // Le message porte la valeur fautive : « violates check constraint » en
    // production ne dit pas laquelle, ni combien de lignes elle concerne.
    expect(invalid).toEqual([])
  })

  it('chaque contact des dossiers porte un rôle de décision canonique', () => {
    const invalid = [
      ...new Set(
        DEMO_DOSSIERS.flatMap(dossier => dossier.contacts ?? [])
          .map(contact => contact.decision_role)
          .filter(role => role != null && !decisionRoleSchema.safeParse(role).success),
      ),
    ]
    expect(invalid).toEqual([])
  })

  it('les libellés français ne sont JAMAIS écrits tels quels', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper.
    for (const label of ['prescripteur', 'acheteur', 'utilisateur', 'influenceur', 'decideur']) {
      expect(decisionRoleSchema.safeParse(label).success).toBe(false)
    }
    expect(densified.some(contact => contact.decision_role === ('prescripteur' as never))).toBe(false)
  })

  it('la source posée sur un contact de démonstration est déclarée au contrat', () => {
    // Même règle, autre colonne contrainte : `contacts_source_check`.
    expect(contactSourceSchema.safeParse('demo').success).toBe(true)
  })

  /**
   * Le secteur d'application du projet de démonstration.
   *
   * Cette colonne n'a PAS de contrainte `CHECK` : un code inventé s'insère sans
   * broncher, le panneau n'affiche rien, et personne ne sait pourquoi. Mesuré
   * en écrivant ce seed — `transport_logistics` n'existe pas, et rien ne l'a
   * dit. La leçon `account_vocabulary.kind` vaut donc aussi quand la base ne
   * refuse RIEN : la seule barrière est ce test.
   */
  it('les secteurs du projet de démonstration existent au référentiel', () => {
    const codes = DEMO_DELIVERY_CLIENT.project.application_sector_codes
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.filter(code => !APPLICATION_SECTOR_CODES.includes(code))).toEqual([])
  })

  it('la famille de prestation du projet de démonstration est un domaine déclaré', () => {
    expect(offerDomainSchema.safeParse(DEMO_DELIVERY_CLIENT.project.primary_domain_code).success).toBe(true)
  })

  it('la garde sait dire NON — un code inventé serait vu', () => {
    expect(APPLICATION_SECTOR_CODES.includes('transport_logistics')).toBe(false)
  })
  /**
   * La porte de priorisation des dossiers de démonstration.
   *
   * ⚠️ La garde de couverture démo raisonne par TABLE : `accounts` y est
   * déclarée « seedée », et elle l'était — mais sa colonne `priority_gate`
   * restait nulle sur les quatre dossiers. Un prospect voyait donc un
   * portefeuille où la question « travaille-t-on ce compte » n'avait jamais été
   * posée, présenté comme le produit réel. Une table seedée peut avoir une
   * colonne vide qui pilote un écran entier ; ce test est la barrière.
   */
  it('les trois issues de la porte G1 sont montrées, et toutes sont déclarées au contrat', () => {
    const gates = DEMO_DOSSIERS.map(client => client.account.priority_gate)
    expect(gates.filter(gate => !priorityGateSchema.safeParse(gate).success)).toEqual([])
    // Les TROIS issues, pas une seule répétée : un jeu qui ne montre que
    // « priorisé » ne montre pas la décision, il montre son résultat heureux.
    expect(new Set(gates).size).toBe(3)
  })

  it('un compte ÉCARTÉ porte son motif, et le motif est au catalogue', () => {
    // Un écartement sans motif est exactement ce que la porte interdit : le
    // seed ne doit pas montrer un geste que le produit refuse.
    const parked = DEMO_DOSSIERS.filter(client => client.account.priority_gate === 'parked')
    expect(parked.length).toBeGreaterThan(0)
    for (const client of parked) {
      expect(DEFAULT_PARK_REASONS.map(reason => reason.key)).toContain(client.account.gate_reason)
    }
  })

  it('un compte EN ATTENTE ne porte aucun motif — rien n’a encore été tranché', () => {
    for (const client of DEMO_DOSSIERS.filter(c => c.account.priority_gate === 'pending')) {
      expect(client.account.gate_reason).toBeNull()
    }
  })
})
