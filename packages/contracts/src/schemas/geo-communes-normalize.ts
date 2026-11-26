/**
 * Normalisation d'un nom de commune, partagée par le script de génération (clés de la table) et
 * l'exécution : casse, accents, ligatures, tirets/espaces, « St/Ste » ⇒ « saint/sainte »,
 * arrondissements (« Paris 15e », « Lyon 3e », « Marseille 8e ») ramenés à la commune.
 * Sans import : le script la charge directement.
 */
export function normalizeCityName(value: string): string {
  const words = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ \d+(?: ?(?:er|e|eme|nd|nde|ieme))?(?: (?:arrondissement|arr))?$/, '')
    .split(' ')
    .map(w => (w === 'st' ? 'saint' : w === 'ste' ? 'sainte' : w))
  return words.join(' ')
}
