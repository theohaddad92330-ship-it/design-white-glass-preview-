/**
 * LA CLÉ DU RÉFÉRENTIEL ESN — une seule implémentation, dans son propre module.
 *
 * Elle vivait en méthode statique sur `EsnDirectoryService`, et y reste
 * atteignable (`EsnDirectoryService.normalize` DÉLÈGUE ici — une dérivation
 * vit à un seul endroit). Elle en est sortie le 11/09/2026 parce que le
 * classement des suggestions (#1887) en a besoin AUSSI, et qu'un module qui
 * importerait le service pendant que le service l'importe ferait un cycle : au
 * chargement, l'un des deux verrait l'autre à moitié construit.
 *
 * Ce que la normalisation fait, et pourquoi chaque étape : les accents sont
 * DÉPLIÉS puis retirés (« Sogéti » et « Sogeti » sont la même ESN, et une
 * comparaison SQL insensible à la casse ne les rapproche pas), la casse est
 * repliée, et tout ce qui n'est ni lettre ni chiffre devient une espace
 * (« SII Sud-Ouest », « SII SUD OUEST » et « SII  sud/ouest » sont un seul nom).
 */
export function normalizeEsnName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
