/**
 * Le secteur d'un compte, réduit à ce qui se LIT dans une liste (#1315.3).
 *
 * Le champ `sector` porte la chaîne d'enrichissement complète : un libellé
 * lisible, puis le libellé NAF officiel, puis le code, puis parfois le
 * verbiage du registre, par exemple :
 *
 *   « Activités immobilières - location de terrains et d'autres biens
 *     immobiliers (NAF 68.20B) pour l'entité juridique identifiée… »
 *
 * Sur une ligne de liste, cette phrase est l'information PRINCIPALE alors
 * qu'elle n'apprend rien : elle pousse le nom, le score et le geste hors de
 * l'écran. Le retour demandait « un secteur lisible plutôt que le long texte
 * NAF ».
 *
 * ⚠️ Deux règles tiennent cette fonction :
 *
 * 1. **On raccourcit, on n'efface jamais.** Si rien de lisible ne reste après
 *    découpe, la chaîne d'origine revient telle quelle — un secteur réel vaut
 *    mieux qu'un vide, et « absent » doit rester réservé à ce qui est vraiment
 *    absent. Les appelants gardent le texte entier en `title`.
 * 2. **Absent reste absent** : `null`, `undefined` et le blanc rendent `null`,
 *    jamais une chaîne de remplissage.
 *
 * ⚠️ #1800 (09/09/2026) — elle vivait dans le paquet partagé parce que DEUX
 * mondes l'appelaient : l'écran (listes de comptes, comptes similaires) ET
 * l'API (`favorites.service.ts` construisait le `sublabel` d'un compte favori
 * côté serveur). Le second appelant a disparu avec la notion de favori (retour
 * Louis, « supprime la notion de favori ») — elle reste dans ce paquet partagé
 * parce que plusieurs ÉCRANS web l'appellent encore (comptes, comptes
 * similaires, veille), pas parce qu'un appelant serveur en a encore besoin.
 */
export function compactSector(sector: string | null | undefined): string | null {
  const full = (sector ?? '').trim()
  if (!full) return null

  // Le code NAF et tout ce qui le suit : c'est de la référence, pas de la lecture.
  const withoutNaf = full.replace(/\s*\(\s*NAF[^)]*\)[\s\S]*$/iu, '').trim()

  // Le séparateur est un tiret ENTOURÉ D'ESPACES : « Agro-alimentaire » et
  // « Auvergne-Rhône-Alpes » n'en portent pas, ils traversent intacts.
  const head = withoutNaf.split(/\s+[—–-]\s+/u)[0]?.trim() ?? ''

  const result = head || withoutNaf || full
  // #4321.1 — un secteur qui n'est qu'un CODE (« 9 / 64.19 Z ») ne se lit pas : il se tait.
  return /^[\d\s./]+[A-Za-z]?$/u.test(result) ? null : result
}
