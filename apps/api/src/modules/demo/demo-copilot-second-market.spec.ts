import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_ACTIVITIES,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_PARTNER_RELATIONS,
  DEMO_SG_ESN_PARTNERS,
} from './demo-dataset'

/**
 * La PARITÉ DÉMO des cinq outils du second marché (tome 6 §16).
 *
 * Le fichier `demo-coverage.ts` garde les TABLES : une table purgée doit
 * être classée seedée ou vide à dessein. Il ne peut rien dire de ces cinq
 * outils-là, parce qu'ils n'introduisent AUCUNE table — ils enveloppent des
 * lectures dont les tables sont déjà classées seedées.
 *
 * Et pourtant la question de la craft rule n°9 reste entière, sous une autre
 * forme : **une capacité qui devient appelable par Laura doit avoir de quoi
 * répondre dans la salle.** Une table peut être « seedée » et l'outil qui la
 * lit rendre `[]` quand même, parce que son filtre porte sur autre chose que
 * l'existence des lignes. C'est exactement le cas du réseau dormant : la table
 * `contacts` est seedée depuis des mois, et le filtre exige une coordonnée ET
 * un silence — deux conditions que rien ne garantissait.
 *
 * Sans ces gardes, le défaut ne se découvrirait pas en CI mais en réunion, sur
 * un « qui je n'ai pas relancé ? » auquel Laura répondrait « personne ».
 */
describe('parité démo — les cinq outils du second marché ont de quoi répondre', () => {
  describe('get_account_access', () => {
    it('le client de livraison porte un coût d’accès déclaré par l’équipe — jamais prêté à une personne', () => {
      // Décision Louis 05/10/2026 (« démo au max ») : le coût revient comme geste de
      // l'équipe sur le compte. Sans lui, `access_facts` est vide et la sonde de
      // complétude purge la salle en boucle (incident du 05/10).
      expect(DEMO_DELIVERY_CLIENT.accessFacts.length).toBeGreaterThan(0)
      for (const fact of DEMO_DELIVERY_CLIENT.accessFacts) {
        expect(fact.detail).toMatch(/équipe/)
        expect(fact.kind).not.toBe('lock')
      }
    })

    it('la barrière d’achat est semée AVEC ses proxies — un score nu ne se montre pas', () => {
      // Lue sur un VRAI dossier (Société Générale), calculée par le moteur de production.
      const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
      const barrier = sg?.account.raw_analysis['access_barrier'] as {
        score: number | null
        proxies: unknown[]
      }
      expect(barrier).toBeDefined()
      // C'est la moitié qui rend la réponse de Laura utilisable : « la porte
      // est dure » sans dire sur quoi ça repose n'est pas un conseil.
      expect(barrier.proxies.length).toBeGreaterThan(0)
    })

    it('le client de livraison porte des ENTITÉS — les portes classées', () => {
      // `entry_points` est ce que le §16 appelle `get_access_path` : sans
      // entités, l'outil rend le verrou et rien par où entrer.
      //
      // ⚠️ Lues dans la TABLE `account_entities`, pas dans `raw_analysis` —
      // le blob d'analyse porte les SITES, la table porte les entités
      // juridiques, et les confondre est la faute que l'onglet Accès a
      // déjà payée une fois.
      expect(DEMO_DELIVERY_CLIENT.entities.length).toBeGreaterThan(0)
      // Décision Louis 04/10/2026 — aucune porte n'affirme un titulaire de
      // rang 1 : le dossier SNCF ne nomme aucune ESN en place. La phrase
      // « passer par » est VIDE À DESSEIN sur le client de livraison ; l'autre
      // verdict — « on ne sait pas qui tient cette entité » — se montre.
      const withIncumbent = DEMO_DELIVERY_CLIENT.entities.filter(entity => String(entity.rank1) === 'yes')
      expect(withIncumbent).toEqual([])
      const without = DEMO_DELIVERY_CLIENT.entities.filter(entity => String(entity.rank1) !== 'yes')
      expect(without.length).toBeGreaterThan(0)
    })
  })

  describe('get_esn_on_account', () => {
    it('le client de livraison ne porte AUCUNE ESN en place — aucune n’est observée chez SNCF', () => {
      expect(DEMO_DELIVERY_CLIENT.partners).toEqual([])
    })

    it('les ESN en place vivent sur un vrai compte, DÉTECTÉES et non déclarées', () => {
      // Le relevé Société Générale les écrit en `source = 'analysis'` : la
      // provenance « détecté » se montre sur des ESN réellement observées.
      expect(DEMO_SG_ESN_PARTNERS.length).toBeGreaterThan(0)
      expect(DEMO_SG_ESN_PARTNERS.every(partner => partner.partnerSource === 'analysis')).toBe(true)
    })
  })

  describe('search_partners', () => {
    it('le canal partenaire porte plusieurs étapes, pas une seule', () => {
      expect(DEMO_PARTNER_RELATIONS.length).toBeGreaterThan(1)
      const stages = new Set(DEMO_PARTNER_RELATIONS.map(partner => partner.stage))
      // Une salle où les trois partenaires seraient à la même étape ne
      // montrerait pas que c'est un CYCLE.
      expect(stages.size).toBeGreaterThan(1)
    })

    it('au moins un partenaire est SOUS le seuil de score — l’absence de score se montre', () => {
      // Sous trois placements il n'y a pas de score, et c'est la règle qu'on
      // veut voir en démonstration : « pas encore mesuré » n'est pas zéro.
      const unscorable = DEMO_PARTNER_RELATIONS.filter(partner => partner.placementsTotal < 3)
      expect(unscorable.length).toBeGreaterThan(0)
    })
  })

  describe('search_dormant_network', () => {
    /**
     * Le filtre du réseau dormant, tel que `contacts.service.ts` l'écrit :
     * aucune activité depuis N mois, ET une coordonnée (e-mail ou LinkedIn),
     * ET pas d'opt-out.
     *
     * ⚠️ La salle de démonstration refuse par construction toute coordonnée aux
     * personnes RÉELLES : seuls les interlocuteurs FICTIFS du client d'exemple
     * en portent une. C'est cette règle-là qui rend la garde nécessaire — le
     * jour où quelqu'un retire l'adresse d'un contact fictif pour une raison
     * de confidentialité, la liste dormante se vide sans qu'aucun autre test
     * ne bouge, et Laura répond « personne » en démonstration.
     */
    // Décision Louis 04/10/2026 — les coordonnées des VRAIES personnes des briefs sont en clair : le réseau joignable est celui de toute la salle.
    const contactsWithChannel = [
      ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts),
      ...DEMO_DELIVERY_CLIENT.contacts,
    ].filter(contact => contact.email)
    const contactsWithActivity = new Set(
      DEMO_ACTIVITIES.map(activity => activity.contact).filter((name): name is string => name !== null),
    )

    it('au moins un contact JOIGNABLE existe dans la salle', () => {
      expect(contactsWithChannel.length).toBeGreaterThan(0)
    })

    it('au moins un contact joignable n’a AUCUNE activité — donc il est dormant', () => {
      const dormant = contactsWithChannel.filter(contact => !contactsWithActivity.has(contact.full_name))
      expect(dormant.length).toBeGreaterThan(0)
    })
  })

  describe('get_territory_overview', () => {
    it('la salle suit des territoires — mais la lecture, elle, est un fait de MARCHÉ', () => {
      // ⚠️ Le seul des cinq outils dont la réponse ne vient PAS de l'espace.
      // L'aperçu d'un territoire lit quatre sources publiques (registre,
      // offres, marchés publics) et le référentiel ESN, qui est MUTUALISÉ
      // entre tous les espaces — `demo-reset.service.ts` l'exclut d'ailleurs
      // explicitement de la purge pour cette raison.
      //
      // Il n'y a donc rien à seeder, et surtout rien qu'on DOIVE seeder :
      // fabriquer un faux territoire ferait mentir la démonstration sur la
      // seule donnée qu'un prospect peut vérifier lui-même en deux minutes.
      // Ce qui est seedé est l'ABONNEMENT, pour que l'écran Marché s'ouvre
      // rempli ; l'aperçu, lui, répond exactement comme en production — et
      // quand une source est muette, il le DIT bloc par bloc.
      const carrier = DEMO_DOSSIERS.find(
        dossier => dossier.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name,
      )
      expect(carrier?.account.headquarters).toBeTruthy()
    })

    it('le pont n’appelle le service IA que pour CETTE lecture, et rien d’autre', () => {
      /**
       * L'exemption qui rend l'exemption honnête.
       *
       * `demo-model-calls.spec.ts` exempte le pont parce que son seul appel
       * au service IA — `territoryOverview` — ne touche aucun modèle et ne
       * débite rien. Mais cette exemption est indexée par MODULE : le jour
       * où quelqu'un ajoute un vrai appel Claude dans ce contrôleur, la
       * garde resterait verte et la salle de démonstration se mettrait à
       * appeler un modèle en silence.
       *
       * C'est le motif « exemption trop large », et il se referme ici :
       * cette garde nomme l'appel autorisé plutôt que le module.
       */
      const source = readFileSync(join(__dirname, '..', 'copilot-bridge', 'copilot-bridge.controller.ts'), 'utf8')
      const calls = [...source.matchAll(/this\.ia\.([a-zA-Z]+)/g)].map(match => match[1])
      // Le corpus n'est pas vide : sans cette ligne, un renommage du champ
      // injecté rendrait la garde verte sur zéro appel lu.
      expect(calls.length).toBeGreaterThan(0)
      expect([...new Set(calls)]).toEqual(['territoryOverview'])
    })
  })
})
