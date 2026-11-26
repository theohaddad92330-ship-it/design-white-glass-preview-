/**
 * Le gabarit téléchargeable d'une source d'import (#2078.31).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LIGNE D'EXEMPLE, ET POURQUOI ELLE N'EST PAS UNE DONNÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * « JAMAIS de donnée fictive » (règle du dépôt) porte sur ce que le produit
 * AFFIRME d'une entreprise, d'un contact ou d'une analyse — un score inventé,
 * un statut deviné. Une ligne d'exemple dans un GABARIT DE FICHIER n'affirme
 * rien sur personne : elle montre la FORME attendue, comme le fait n'importe
 * quel assistant d'import du marché. Chaque valeur est explicitement un
 * placeholder (« exemple.fr », « Jean Dupont ») — jamais une donnée qui
 * pourrait se lire comme réelle.
 *
 * Les colonnes viennent de `card.fields` — DÉRIVÉES des alias du catalogue
 * côté serveur (`receivableFields`), jamais recopiées à la main ici : un champ
 * ajouté au catalogue apparaît dans le gabarit sans toucher ce fichier.
 */
const EXAMPLE_VALUES: Readonly<Record<string, string>> = {
  email: 'jean.dupont@exemple.fr',
  name: 'Jean Dupont',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: '+33612345678',
  company: 'Exemple SAS',
  siren: '123456789',
  domain: 'exemple.fr',
  title: 'Responsable commercial',
  startDate: '2026-01-15',
  endDate: '2026-06-30',
  dailyRate: '550',
  amount: '15000',
  skills: 'React, TypeScript',
  owner: 'jean.dupont@exemple.fr',
  availableFrom: '2026-02-01',
  label: 'Projet exemple',
  stage: 'detected',
  body: 'Note d’exemple',
  kind: 'reunion',
  channel: 'email',
}

/** Le repli générique — jamais une case vide, qui se lirait comme un bug du gabarit. */
const GENERIC_EXAMPLE = 'exemple'

/** Un CSV à deux lignes : l'en-tête reçu, puis un exemple par colonne. */
export function importTemplateCsv(fields: readonly string[]): string {
  const columns = fields.length > 0 ? fields : ['name']
  const header = columns.join(',')
  const example = columns.map(field => EXAMPLE_VALUES[field] ?? GENERIC_EXAMPLE).join(',')
  return `${header}\n${example}\n`
}
