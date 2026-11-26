/**
 * Ce qu'est une fiche « à compléter », en un seul endroit.
 *
 * Le bandeau Contacts annonce « N coordonnées à compléter » (`getStats.toEnrich`)
 * et la liste offre le filtre correspondant (`channel=missing_details`). Les
 * deux DOIVENT lire la même définition : un filtre qui ne rendrait pas
 * exactement le nombre affiché sur la tuile ferait douter de tout l'écran.
 *
 * Définition : email OU téléphone manquant. Le LinkedIn n'entre pas dedans —
 * c'est un canal, pas une coordonnée de contact direct, et l'exiger classerait
 * « à compléter » des fiches parfaitement joignables.
 */
export function missingContactDetailsSql(alias?: string): string {
  const prefix = alias ? `${alias}.` : ''
  return `(${prefix}email IS NULL OR ${prefix}phone IS NULL)`
}

/**
 * #3821 — « Avec téléphone » ne retient que les numéros ENREGISTRÉS. Une colonne
 * non nulle ne prouve rien : recette prod du 07/10, trois lignes du filtre
 * affichaient un texte à la place d'un numéro. MÊME heuristique que
 * `looksLikePhoneNumber` (contracts) : 8 à 15 chiffres, aucune lettre.
 */
export function recordedPhoneSql(alias?: string): string {
  const col = alias ? `${alias}.phone` : 'phone'
  return `(${col} IS NOT NULL AND ${col} ~ '^[+0-9][0-9 ().-]*$' AND length(regexp_replace(${col}, '\\D', '', 'g')) BETWEEN 8 AND 15)`
}

/** Version TypeScript du même prédicat, pour les écrans et les tests. */
export function isMissingContactDetails(contact: { email?: string | null; phone?: string | null }): boolean {
  return !contact.email || !contact.phone
}
