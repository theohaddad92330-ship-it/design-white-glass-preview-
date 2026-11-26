import type { UniversalImportType } from '@bellum/contracts'

/**
 * Le PETIT FICHIER D'EXEMPLE de l'import universel — craft rule n°9 : le geste
 * d'import se démontre (salle de démonstration comprise) sans que le
 * commercial ait un export sous la main.
 *
 * Même parti pris que `features/import/lib/import-template.ts` : une ligne
 * d'exemple dans un FICHIER n'affirme rien sur personne, chaque valeur est un
 * placeholder évident (`exemple.fr`, « Exemple SAS »). La dernière colonne n'a
 * AUCUN champ d'accueil, à dessein : elle montre qu'une colonne inconnue est
 * CONSERVÉE (« informations complémentaires ») au lieu d'être jetée.
 */
const SAMPLES: Partial<Record<UniversalImportType, string[]>> = {
  // #4052 / #4053 — un export CRM de contacts, société en colonnes : les références (`EX-…`) montrent en
  // salle qu'un fichier contacts CRÉE ses comptes (« Exemple Conseil SAS », « Exemple Données SA ») et qu'un
  // réimport du même fichier ne copie rien. Depuis une fiche compte, les colonnes société restent lisibles.
  contact: [
    'Référence CRM;Nom complet;Poste;E-mail;Téléphone;Référence société;Société;Type société;Code interne ERP',
    'EX-C1;Jeanne Exemple;Directrice des systèmes d’information;jeanne@exemple.fr;+33600000001;EX-S1;Exemple Conseil SAS;Client;ERP-0001',
    'EX-C2;Paul Exemple;Responsable achats IT;paul@exemple.fr;+33600000002;EX-S1;Exemple Conseil SAS;Client;ERP-0002',
    'EX-C3;Lina Exemple;Head of Data;lina@exemple.fr;;EX-S2;Exemple Données SA;Prospect;ERP-0003',
  ],
  account: [
    'Raison sociale;SIREN;Site web;Secteur;Effectif;Commercial historique',
    'Exemple Industrie SAS;000000001;exemple-industrie.fr;Industrie;1200;Équipe Ouest',
    'Exemple Banque SA;000000002;exemple-banque.fr;Banque;5400;Équipe Paris',
  ],
}

/** Le fichier d'exemple d'un type, ou `null` quand le type n'en a pas encore — dit, pas inventé. */
export function sampleFileFor(type: UniversalImportType): File | null {
  const lines = SAMPLES[type]
  if (!lines) return null
  // Sans type MIME : c'est une ENTRÉE (un modèle à déposer), pas une sortie de données de l'espace.
  return new File([`${lines.join('\n')}\n`], `exemple-${type}.csv`)
}
