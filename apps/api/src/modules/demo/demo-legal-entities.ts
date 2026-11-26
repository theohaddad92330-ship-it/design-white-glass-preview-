/**
 * LES DEUX SOCIÉTÉS DE L'ESN de la salle de démonstration (D9 · 01/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES N'Y ÉTAIENT PAS, ET POURQUOI ELLES Y SONT
 * ─────────────────────────────────────────────────────────────────────────────
 * `legal_entities` était classée « vide à dessein » depuis la création de la
 * salle, avec une raison qui se tenait : « un espace de démonstration présente
 * UNE ESN fictive : y déclarer deux raisons sociales montrerait une organisation
 * de groupe que le jeu de données ne raconte pas, et ferait apparaître un
 * sélecteur dont aucune mission n'a besoin ».
 *
 * Elle est devenue FAUSSE le 01/09/2026, le jour où le filtre par société du
 * tableau de bord Finance a cessé d'être décoratif. « Un sélecteur dont aucune
 * mission n'a besoin » décrivait un contrôle désactivé ; il décrit maintenant un
 * contrôle qui commande quatre lectures financières, et qu'un prospect
 * trouverait éteint. C'est exactement le défaut que la parité démo existe pour
 * empêcher — un écran livré mais vide se découvre en réunion, pas en CI.
 *
 * ⚠️ Une justification « vide à dessein » ne périme pas toute seule : celle-ci
 * a survécu à la livraison de la capacité qu'elle décrivait. C'est pourquoi elle
 * est REMPLACÉE ici plutôt qu'amendée, et pourquoi la table passe en semis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX, ET PAS TROIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux suffit à faire la démonstration entière : un filtre qui change les
 * chiffres a besoin d'au moins deux valeurs, et le total « toutes les sociétés »
 * doit rester supérieur à chacune. Une troisième n'ajouterait qu'une ligne au
 * menu déroulant, et diluerait les neuf missions au point que chaque société
 * passerait sous le seuil de mesurabilité de la marge — la salle montrerait
 * alors « non mesurable » partout, ce qui est juste et illisible.
 *
 * ⚠️ Elles portent une raison sociale explicitement FICTIVE et AUCUN numéro
 * d'immatriculation : un SIREN inventé pointerait vers une société qui existe
 * vraiment, exactement le refus déjà écrit en face du client d'exemple.
 */
export const DEMO_LEGAL_ENTITIES = [
  {
    name: 'BELLUM CONSEIL',
    /** `null` assumé : voir l'entête. Le contrat l'accepte, et c'est même le cas
     *  qui a fait écrire `registration_number` en facultatif — une ESN belge ou
     *  suisse n'a pas de SIREN. */
    registration_number: null as string | null,
    country: 'FR',
    // #2422.3 — TVA, adresse, devise : une renseignée pour montrer l'écran
    // rempli, l'autre `null` pour montrer « non renseigné » (GA-18/19) plutôt
    // que deux lignes identiques qui ne prouveraient rien de la distinction.
    vat_number: 'FR12345678901' as string | null,
    address: '18 avenue de la République, 75011 Paris' as string | null,
    currency: 'EUR' as string | null,
  },
  {
    name: 'BELLUM RÉGIE SUD',
    registration_number: null as string | null,
    country: 'FR',
    vat_number: null as string | null,
    address: null as string | null,
    currency: null as string | null,
  },
] as const

/**
 * QUELLE SOCIÉTÉ PORTE QUELLE MISSION — par le LIBELLÉ de la mission.
 *
 * ⚠️ Par le libellé et non par un rang : `DEMO_DELIVERY_CLIENT.missions` est un
 * tableau que d'autres lots réordonnent et complètent, et une jointure par
 * POSITION se décale en silence — le rattachement partirait sur la mauvaise
 * mission sans qu'aucun test ne rougisse. Le libellé est déjà la clé que le
 * semis utilise pour retrouver une mission (`missionIds`).
 *
 * ⚠️ Une mission ABSENTE de cette table reste NON RATTACHÉE, et c'est
 * délibéré : c'est le cas qu'un prospect doit voir, parce que c'est celui qui
 * explique pourquoi la somme des deux sociétés est inférieure au total. Une
 * mission que personne n'a rattachée n'appartient à aucune société — la clause
 * SQL le tient (`legalEntityClause` n'ajoute AUCUN `OR … IS NULL`), et la salle
 * doit le montrer plutôt que de le cacher.
 *
 * La répartition est choisie pour que le filtre DISE quelque chose : le conseil
 * garde les missions au forfait et les gros lots, la régie porte les renforts en
 * régie. C'est la répartition que l'on trouve réellement chez une ESN à deux
 * structures, et elle fait apparaître un ÉCART DE MARGE entre les deux — ce que
 * le filtre sert à voir.
 */
export const DEMO_MISSION_LEGAL_ENTITY: Readonly<Record<string, string>> = {
  'Fiabilisation plateforme — renfort exploitation': 'BELLUM RÉGIE SUD',
  'Cadrage données transport — lot 2': 'BELLUM CONSEIL',
  'Refonte des applications voyageurs — forfait': 'BELLUM CONSEIL',
  'Industrialisation d’un cas d’usage de recherche — mise en production': 'BELLUM CONSEIL',
  'Migration du socle applicatif vers les conteneurs — lot 1': 'BELLUM CONSEIL',
  'Convergence des applications temps réel — lots interfaces et reprise': 'BELLUM RÉGIE SUD',
  'Socle conteneurisé des applications terrain — run': 'BELLUM RÉGIE SUD',
  'Supervision applicative du socle transport — astreinte': 'BELLUM RÉGIE SUD',
  // « Reprise de l'ordonnancement des flux — lot pilote » n'est VOLONTAIREMENT
  // pas rattachée : voir plus haut.
}
