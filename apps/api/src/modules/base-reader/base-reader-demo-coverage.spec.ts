import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4792 — « ET EN DÉMONSTRATION, LE LECTEUR COMMUN RÉPOND QUOI ? » (craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉPONSE ÉCRITE, ET POURQUOI ELLE N'AJOUTE AUCUN SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce lot n'ajoute AUCUNE table et AUCUNE clé de `raw_analysis` : le lecteur lit ce qui existe
 * (`accounts`, `project_needs`, `signal_history`, `consultants`, `consultant_experiences`). Il n'y a
 * donc rien à classer dans `demo-coverage.ts` — et surtout rien à y déplacer vers « vide à dessein ».
 *
 * Mais une table seedée ne suffit pas : un lecteur peut lire une table pleine et rendre `[]` parce que
 * son FILTRE porte sur autre chose que l'existence des lignes. C'est le piège nommé dans
 * `demo-coverage.ts` lui-même. Ce lecteur-ci filtre sur un MÉTIER et un LIEU : la salle doit donc
 * porter, pour chaque famille, au moins une ligne qui réponde à ces deux critères-là.
 *
 * Les trois familles dans la salle, au 29/10/2026 :
 *  - COMPTES : seedés avec un siège (`headquarters`) — un lieu se rapproche donc sur eux ;
 *  - BESOINS : `project_needs` est seedée (le besoin phare et les cinq rôles du dossier client) avec
 *    un LIEU (« Lyon », « Lyon (69) ») ET des compétences nommées (Kubernetes, Terraform) ;
 *  - CONSULTANTS : `consultants` est seedée avec une pile (`stack`) et des zones (« 69 », « IDF »).
 *
 * ⚠️ La sous-famille « offres collectées » (`signal_history`) reste VIDE dans la salle, et ce n'est pas
 * une décision de ce lot : elle est déjà classée vide à dessein dans `demo-coverage.ts` — « la veille
 * quotidienne ne tourne pas en salle, les signaux viennent du dossier ». La famille BESOINS n'est donc
 * pas vide pour autant : ses besoins ENREGISTRÉS répondent. Rien n'a été déplacé pour faire passer un
 * test ; cette ligne-là existait avant le lot et dit pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE, ET CE QU'ELLE NE PEUT PAS MESURER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le TEXTE du jeu de démonstration, pas une base : la VM n'a aucune base, et le vrai volume
 * (80 besoins Java à Lille, 3 600 consultants) ne se vérifie que chez Louis, par la requête écrite dans
 * la PR. Ce qu'elle garde est ce qu'une garde peut garder ici : le jour où la salle perd le LIEU de ses
 * besoins, la PILE de ses consultants ou le SIÈGE de ses comptes, ce test rougit — et le lien de
 * démonstration n'ouvre pas un écran vide devant un prospect.
 */

const DATASET = readFileSync(join(__dirname, '..', 'demo', 'demo-dataset.ts'), 'utf8')

describe('#4792 — la salle de démonstration répond au lecteur commun', () => {
  it('les COMPTES de la salle portent un siège : un lieu se rapproche sur eux', () => {
    expect(DATASET).toMatch(/\bheadquarters:\s*'[^']+'/)
  })

  it('les BESOINS de la salle portent un LIEU et une compétence nommée', () => {
    // Le besoin phare : « Lyon », Kubernetes / Terraform (`DEMO_FLAGSHIP_NEED`).
    expect(DATASET).toContain("location: 'Lyon'")
    expect(DATASET).toMatch(/term:\s*'Kubernetes'/)
    // Et les rôles du dossier client, au département écrit en clair — la forme que le lecteur
    // rapproche quand on lui donne « 69 ».
    expect(DATASET).toContain("location: 'Lyon (69)'")
  })

  it('les CONSULTANTS de la salle portent une pile ET une zone', () => {
    expect(DATASET).toMatch(/stack:\s*\['Kubernetes'/)
    // « 69 » NU dans les zones : c'est pour cette forme que `placeCodes` existe.
    expect(DATASET).toMatch(/zones:\s*\['IDF',\s*'69'\]/)
  })

  it('…et un consentement, sans quoi aucune personne ne fait de ligne', () => {
    // Le lecteur borne les personnes au consentement VALIDE : une salle sans consentement semé
    // rendrait une famille vide sans qu'aucune table ne soit vide.
    expect(DATASET).toMatch(/consent_given_days_ago:\s*\d+/)
    expect(DATASET).toMatch(/consent_expires_in_days:\s*\d+/)
  })
})
