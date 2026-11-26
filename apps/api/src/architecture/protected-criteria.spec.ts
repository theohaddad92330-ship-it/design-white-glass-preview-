import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-06 — aucun moteur de sélection ne lit un critère protégé.
 *
 * Âge, genre, origine, nationalité, photo, nom de famille, situation
 * familiale : ces champs ne doivent jamais entrer dans un classement de
 * personnes. C'est le seul des six interdits de l'IA qui n'avait **aucune
 * garde** — et il était respecté par accident de modélisation, pas par
 * décision : `birth_date`, `gender` et `marital_status` n'existent nulle part.
 *
 * Deux de ces champs existent pourtant bel et bien : `photo_url`, collecté et
 * stocké sur les contacts, et `full_name`, qui est l'identité canonique. Rien
 * n'empêchait un futur moteur de scoring de les lire. Cette garde le pose
 * AVANT que le cas ne se présente, parce qu'après, ça s'appelle un incident.
 *
 * Le périmètre est délibérément étroit : les fichiers qui CLASSENT des
 * personnes. Afficher une photo sur une fiche est légitime ; s'en servir pour
 * ordonner des candidats ne l'est pas. Une garde qui interdirait le champ
 * partout serait ignorée en une semaine.
 */

const SRC = join(__dirname, '..')

/** Les fichiers qui ordonnent, notent ou sélectionnent des PERSONNES. */
const SELECTION_ENGINES = [
  'modules/consultants/consultant-matching.ts',
  'modules/consultants/talent.service.ts',
  // Le parsing d'un CV LIT un document où ces champs figurent souvent (photo,
  // date de naissance, situation familiale). Rien ne les empêchait d'entrer
  // dans une fiche puis dans un classement. ⚠️ Deux dates circulent sur l'entrée
  // en vigueur de l'annexe III de l'AI Act pour le tri de candidats —
  // 02/08/2026 et 02/12/2027 — et aucune n'a été vérifiée contre le texte du
  // règlement. Cette garde ne dépend d'aucune des deux : le droit des données
  // personnelles suffit à la fonder.
  'modules/consultants/cv-parse.service.ts',
  'modules/consultants/cv-intake.service.ts',
  'modules/analysis/contact-score.ts',
  'modules/crm/lead-score.ts',
  'modules/crm/crm-duplicates.ts',
  'modules/analytics/interlocutor.ts',
]

/**
 * Les critères protégés, dans les graphies qui traversent réellement le code
 * (colonne SQL et champ TypeScript). `full_name` est un cas particulier :
 * l'identité est nécessaire pour DÉSIGNER une personne, elle ne doit jamais
 * peser dans son classement — d'où sa présence ici, sur les seuls moteurs.
 */
const PROTECTED_CRITERIA = [
  'birth_date',
  'birthDate',
  'gender',
  'nationality',
  'photo_url',
  'photoUrl',
  'marital_status',
  'maritalStatus',
  'ethnicity',
  'religion',
]

/**
 * Le NOYAU de classement — les fonctions qui calculent un rang, à distinguer
 * des services qui les appellent.
 *
 * Elles sont tenues plus strictement : l'identité et l'adresse s'y ajoutent aux
 * critères interdits. Le commentaire d'en-tête de cette garde affirmait déjà que
 * `full_name` était verrouillé, et le tracker du socle le répétait — c'était
 * faux, la liste ne l'a jamais contenu. Il ne pouvait pas y entrer sans casser
 * `consultant-matching.ts`, qui porte légitimement le nom dans SON RÉSULTAT pour
 * désigner la personne. D'où deux périmètres au lieu d'un mensonge : le noyau ne
 * reçoit même pas l'identité (`MatchCandidate` n'a pas de champ nom), et cette
 * liste-ci le vérifie.
 *
 * `address` est interdite au-delà du code postal : une zone de mobilité est un
 * critère légitime, le domicile de quelqu'un ne l'est pas.
 */
const RANKING_CORE_CRITERIA = [...PROTECTED_CRITERIA, 'full_name', 'fullName', 'address']

/** Les fichiers qui CALCULENT un rang, par opposition à ceux qui l'affichent. */
const RANKING_CORES = [
  'modules/consultants/matching/axes.ts',
  'modules/consultants/matching/pushable.ts',
  'modules/consultants/matching/prefilter.ts',
  'modules/consultants/matching/engine.ts',
]

/**
 * #2120.15 / #2120.19 / #2120.30-38 — le NOYAU du classement des contacts d'un
 * compte (chemin recommandé). Tenu plus strictement encore que les noyaux de
 * matching : la ville, le pays et le fuseau d'une personne n'y entrent pas non
 * plus. L'exception « ville / pays » de c58 vaut pour la charge utile d'un
 * PROMPT qui désigne quelqu'un, pas pour un calcul qui l'ORDONNE — deux contacts
 * équivalents ne changent pas de rang parce que l'un est à Lyon et l'autre à
 * Montréal.
 */
const CONTACT_RANKING_CORE_CRITERIA = [...RANKING_CORE_CRITERIA, 'location', 'timezone']
const CONTACT_RANKING_CORES = ['modules/contacts/contact-ranking.ts']

function existingEngines(): string[] {
  return SELECTION_ENGINES.filter(relative => {
    try {
      return statSync(join(SRC, relative)).isFile()
    } catch {
      return false
    }
  })
}

describe('GA-06 — les critères protégés ne franchissent aucun moteur de sélection', () => {
  it.each(existingEngines())('%s ne lit aucun critère protégé', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8')
    const found = PROTECTED_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(source))
    // Si ce test tombe : ce champ ne doit pas peser dans un classement de
    // personnes. Retire-le du calcul — ou, si l'usage est purement
    // d'affichage, sors ce fichier de SELECTION_ENGINES en disant pourquoi.
    expect(found).toEqual([])
  })

  it.each(RANKING_CORES)('%s ne lit ni identité ni adresse', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8')
    const found = RANKING_CORE_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(source))
    // Si ce test tombe : le noyau de classement vient de recevoir une donnée
    // qu'il n'a pas à connaître. La corriger ici, pas dans l'appelant.
    expect(found).toEqual([])
  })

  it.each(CONTACT_RANKING_CORES)('%s ne lit ni identité, ni photo, ni adresse, ni localisation', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8')
    // Le corpus n'est pas vide : une garde qui lit un fichier vide passe au vert pour toujours.
    expect(source).toMatch(/export function rankAccountContacts/)
    const found = CONTACT_RANKING_CORE_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(source))
    // Si ce test tombe : le classement des contacts vient de recevoir un champ
    // qui ne doit pas ordonner des personnes. Le retirer de `RankableContactRow`.
    expect(found).toEqual([])
  })

  it('le noyau du classement des contacts existe', () => {
    expect(CONTACT_RANKING_CORES.filter(relative => statSync(join(SRC, relative)).isFile())).toEqual(
      CONTACT_RANKING_CORES,
    )
  })

  it('les noyaux de classement déclarés existent tous', () => {
    // Écrit AVANT le moteur (PDF 4 §13.1). Si un de ces fichiers disparaît,
    // c'est la liste qu'il faut mettre à jour — pas la garde qu'il faut taire.
    expect(RANKING_CORES.filter(relative => statSync(join(SRC, relative)).isFile())).toEqual(RANKING_CORES)
  })

  it('la liste des moteurs surveillés n’est pas vide', () => {
    // Une garde qui ne surveille rien passe au vert pour toujours. Si tous les
    // fichiers listés disparaissent, c'est la liste qu'il faut mettre à jour.
    expect(existingEngines().length).toBeGreaterThan(0)
  })

  it('les moteurs déclarés existent tous — une entrée périmée ne garde plus rien', () => {
    expect(existingEngines()).toEqual(SELECTION_ENGINES)
  })
})
