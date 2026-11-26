import { OUTREACH_SEQUENCE_TEMPLATES } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { seatName } from './demo-seat-names'
import { DEMO_OUTREACH_PLAN } from './demo-seed.service'

/**
 * LE SEMIS DES SÉQUENCES NE SAUTE PAS EN SILENCE (#1509→#1515).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 04/09/2026, dans la salle de démonstration, sur le
 * commit qui venait d'être déployé : **deux lignes au lieu de quatre.**
 *
 * Le semis cherche chaque contact par son NOM et, s'il ne le trouve pas, passe
 * à la suivante — ce qui est le bon comportement (une séquence orpheline
 * afficherait un tiret là où l'écran promet un nom). Mais deux des quatre noms
 * n'étaient pas des contacts : « Camille Roussel » est une CONSULTANTE, et
 * « Sophie Lemaire » n'existe nulle part. Aucun test ne tombait, aucun log ne
 * le disait, et le cockpit de la salle montrait la moitié de ce qu'il devait.
 *
 * C'est la famille « le semis doit LIRE comme l'écran » : un semis qui saute
 * proprement est un semis qu'on croit avoir fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - elle LIT un corpus non vide (le plan ET les contacts de la salle) ;
 *  - elle sait dire NON (remplacer un nom par « Personne Inexistante » la fait
 *    rougir, et c'est exactement ce qui s'est produit en vrai) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas : les CONSULTANTS sont
 *    délibérément hors du corpus, puisque c'est cette confusion-là qui a coûté
 *    deux lignes.
 */

/**
 * Tous les noms de contact de la salle.
 *
 * ⚠️ DEUX sources, et l'oublier est la moitié du défaut. Les dossiers portent
 * les contacts des vraies entreprises ; le client FICTIF — celui qui porte les
 * missions et la facturation — porte les siens à part, sous une autre clé
 * (à part, sous `DEMO_DELIVERY_CLIENT`). Une garde qui ne lirait que la première déclarerait
 * introuvables des contacts qui existent, et se ferait désactiver.
 */
const DEMO_CONTACT_NAMES = new Set([
  ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
  ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
])

describe('le semis des séquences de démonstration', () => {
  it('LIT quelque chose : un plan non vide, et des contacts à y chercher', () => {
    // Sans ce test, un plan vidé par mégarde ferait passer les suivants au vert
    // sur zéro comparaison.
    expect(DEMO_OUTREACH_PLAN.length).toBeGreaterThanOrEqual(4)
    expect(DEMO_CONTACT_NAMES.size).toBeGreaterThan(10)
    // Les deux sources sont bien lues : sans la seconde, les contacts du client
    // fictif seraient déclarés introuvables alors qu'ils existent.
    expect(DEMO_CONTACT_NAMES.has(seatName('Directeur technique — entité numérique voyageurs'))).toBe(true)
  })

  it('ne cite QUE des contacts qui existent dans la salle', () => {
    const introuvables = DEMO_OUTREACH_PLAN.map(entry => entry.contact).filter(name => !DEMO_CONTACT_NAMES.has(name))
    // ⚠️ `expect` de jest ne prend PAS de second argument (celui de vitest) :
    // le nom fautif doit voyager DANS la valeur comparée, sinon l'échec dit
    // « [] n'est pas égal à ["X"] » et il faut le déboguer.
    expect(introuvables.map(name => `introuvable dans la salle : ${name}`)).toEqual([])
  })

  it('#4163 LF — une séquence ne vise pas un siège SANS NOM dont la fonction fait office de nom', () => {
    // Recette prod 14/10 : « Responsable des achats de prestations informatiques » s'affichait comme nom ET comme
    // fonction sur quatre cartes. Un siège (nom = fonction) n'est pas une personne à qui l'on écrit.
    // Décision Louis 01/11/2026 : les sièges de cadres portent désormais un NOM FICTIF (`demo-seat-names.ts`) ;
    // restent « sans nom » les sièges agrégés par famille métier (SG) — c'est eux que la garde lit.
    const seats = new Set(
      [...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts), ...DEMO_DELIVERY_CLIENT.contacts]
        .filter(contact => contact.full_name === contact.title)
        .map(contact => contact.full_name),
    )
    expect(seats.size).toBeGreaterThan(0) // la garde LIT des sièges, elle sait dire non
    const fautifs = DEMO_OUTREACH_PLAN.map(entry => entry.contact).filter(name => seats.has(name))
    expect(fautifs.map(name => `séquence sur un siège sans nom : ${name}`)).toEqual([])
  })

  it('ne pose pas plus d’étapes que le gabarit n’en porte', () => {
    // Le semis s'arrête à la définition manquante (`if (!definition) continue`),
    // donc un plan trop long produirait une séquence AMPUTÉE, en silence.
    for (const entry of DEMO_OUTREACH_PLAN) {
      const template = OUTREACH_SEQUENCE_TEMPLATES[entry.template]
      expect({ qui: `${entry.contact} — ${entry.template}`, trop: entry.steps.length > template.steps.length }).toEqual(
        {
          qui: `${entry.contact} — ${entry.template}`,
          trop: false,
        },
      )
    }
  })

  it('montre plusieurs états différents — une salle qui répète le même n’en montre qu’un', () => {
    // La raison d'être du semis : le cockpit distingue des états, la salle doit
    // en montrer plus d'un. Quatre lignes toutes « active » ne prouveraient rien.
    const statuses = new Set(DEMO_OUTREACH_PLAN.map(entry => entry.status))
    expect(statuses.size).toBeGreaterThanOrEqual(2)
    // Et plusieurs cadences : quatre fois le même gabarit ne montrerait pas que
    // le moteur en connaît six.
    expect(new Set(DEMO_OUTREACH_PLAN.map(entry => entry.template)).size).toBeGreaterThanOrEqual(3)
  })

  it('sait dire NON : un nom absent de la salle est bien détecté', () => {
    // La contre-épreuve, sur le cas RÉEL du 04/09 — « Camille Roussel » est une
    // consultante, pas un contact.
    expect(DEMO_CONTACT_NAMES.has('Camille Roussel')).toBe(false)
    expect(DEMO_CONTACT_NAMES.has('Sophie Lemaire')).toBe(false)
  })

  /**
   * #2325.35 — la salle DOIT montrer une collision de sollicitation de contact,
   * sinon l'écran livré (`contact_solicitation_collisions` de `get_pipeline_
   * health`) reste vide devant un prospect (craft rule n°9). Deux séquences
   * ACTIVES et INDÉPENDANTES (aucune campagne commune) visent le même contact.
   */
  it('#2325.35 — sème au moins un contact visé par deux séquences ACTIVES distinctes', () => {
    const activeByContact = new Map<string, number>()
    for (const entry of DEMO_OUTREACH_PLAN) {
      if (entry.status !== 'active') continue
      activeByContact.set(entry.contact, (activeByContact.get(entry.contact) ?? 0) + 1)
    }
    const collided = [...activeByContact.entries()].filter(([, count]) => count >= 2)
    expect(collided.map(([contact]) => contact)).toEqual(['Lorenzo Bini Smaghi'])
  })
})

/**
 * #3421 lot G03 (30/09) — retour prod : « frise et condition d'arrêt de
 * séquence, à voir sur une séquence réelle ». Le mécanisme existait
 * (`deriveOutreachDisplayStatus`, `SequenceDetailSheet.tsx`) mais AUCUNE
 * séquence — ni en démo, ni sur le compte de Louis — ne portait de
 * `cancel_reason` pour le prouver. Cette garde force le plan à en semer une.
 */
describe('#3421 — le plan sème une condition d’arrêt démontrable', () => {
  it('au moins une séquence `cancelled` porte une cause d’arrêt', () => {
    const cancelled = DEMO_OUTREACH_PLAN.filter(entry => entry.status === 'cancelled')
    expect(cancelled.length).toBeGreaterThanOrEqual(1)
    const withoutReason = cancelled.filter(entry => !entry.cancelReason).map(entry => entry.contact)
    expect(withoutReason).toEqual([])
  })

  it('une séquence `cancelled` porte au moins une étape FAITE et une étape SAUTÉE — la frise montre les deux', () => {
    const cancelled = DEMO_OUTREACH_PLAN.find(entry => entry.status === 'cancelled')
    expect(cancelled).toBeDefined()
    expect(cancelled?.steps.some(step => step.status === 'done')).toBe(true)
    expect(cancelled?.steps.some(step => step.status === 'skipped')).toBe(true)
  })

  it('`cancelReason` n’est posé QUE sur une séquence `cancelled` — jamais une cause inventée sur les autres états', () => {
    for (const entry of DEMO_OUTREACH_PLAN) {
      if (entry.status !== 'cancelled') expect(entry.cancelReason).toBeUndefined()
    }
  })
})

/**
 * #2203.32 → .38 — L'ÉTIQUETTE de campagne dans la salle de démonstration.
 *
 * Le filtre de campagne de l'écran des séquences ne s'affiche que si au moins
 * une étiquette existe. Sans semis, un prospect ouvrirait l'écran et ne
 * verrait JAMAIS la fonction — « un écran livré mais vide en démo se découvre
 * en réunion, pas en CI ».
 */
describe('#2203.32 → .38 — la campagne de la salle de démonstration', () => {
  const labels = DEMO_OUTREACH_PLAN.map(entry => entry.campaign).filter((label): label is string => Boolean(label))

  it('sème au moins UNE étiquette — sinon le filtre n’existe pas pour le visiteur', () => {
    expect(labels.length).toBeGreaterThan(0)
  })

  it('la fait partager par au moins DEUX séquences — une campagne se forme à plusieurs', () => {
    const counts = new Map<string, number>()
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
    const solitaires = [...counts.entries()].filter(([, count]) => count < 2).map(([label]) => label)
    expect(solitaires).toEqual([])
  })

  it('laisse des séquences SANS campagne — les deux cas existent en vrai', () => {
    expect(DEMO_OUTREACH_PLAN.some(entry => !entry.campaign)).toBe(true)
  })
})

/**
 * Épopée #2873 (#2367.14) — LA PROPOSITION DE MISE À JOUR CRM, DÉCLENCHÉE EN
 * SALLE.
 *
 * `sequenceCompletedCrmUpdate` (`routine-executors.ts`) ne signale une
 * séquence que si SA DATE DE COMPLÉTION (`completed_at`, jamais son seul
 * `status`) tombe dans les sept derniers jours. `seedOutreachSequences`
 * (`demo-seed.service.ts`) pose désormais cette date sur la DERNIÈRE étape
 * déjà semée de chaque entrée `completed` — cette garde reproduit le même
 * calcul de fenêtre sur les données du plan, sans toucher à la base, pour
 * prouver qu'au moins une entrée le déclenche vraiment.
 */
describe('#2873 — au moins une séquence TERMINÉE déclenche la proposition de mise à jour CRM', () => {
  const SEVEN_DAYS = 7

  it('une entrée `completed` porte une dernière étape dans la fenêtre de sept jours', () => {
    const completed = DEMO_OUTREACH_PLAN.filter(entry => entry.status === 'completed')
    expect(completed.length).toBeGreaterThanOrEqual(1)

    const triggering = completed.filter(entry => {
      const lastStep = entry.steps.at(-1)
      return lastStep !== undefined && lastStep.offsetDays >= -SEVEN_DAYS && lastStep.offsetDays <= 0
    })
    expect(triggering.map(entry => entry.contact)).toEqual(['Isabelle Rouault'])
  })
})
