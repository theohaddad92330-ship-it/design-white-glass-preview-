/**
 * Une durée telle qu'un humain la lit.
 *
 * La grille affichait « 300 min libres ». C'est exact et illisible : personne
 * ne convertit 300 minutes de tête, et le chiffre qu'on cherche — « j'ai cinq
 * heures » — n'apparaît nulle part. Au-delà d'une heure, on lit des heures.
 *
 * Les minutes restent pour ce qui est court, parce que « 0 h 45 » se lit moins
 * bien que « 45 min ».
 */
export function durationLabel(minutes: number, hourSuffix = 'h'): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  // « 2 h » et non « 2 h 00 » : le zéro n'ajoute rien et allonge la ligne.
  return rest === 0 ? `${hours} ${hourSuffix}` : `${hours} ${hourSuffix} ${String(rest).padStart(2, '0')}`
}
