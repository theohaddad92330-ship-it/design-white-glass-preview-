/**
 * Fonction de traduction passée aux blocs partagés : chaque brief (compte, marché)
 * garde SES clés dans SON espace de noms ; les blocs n'en imposent aucun.
 */
export type BriefT = (key: string, options?: Record<string, string | number>) => string
