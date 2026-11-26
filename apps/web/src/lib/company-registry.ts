/**
 * #1884 — l'adresse de la fiche PUBLIQUE d'une entreprise, à partir de son SIREN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE BESOIN
 * ─────────────────────────────────────────────────────────────────────────────
 * « Rendre cliquable le SIREN pour nous renvoyer vers Pappers ou l'INPI, ce qui
 * offre le plus d'infos possibles. » Le SIREN est affiché dans l'entête du
 * dossier de compte depuis toujours : c'est un identifiant, pas une information
 * — il ne sert qu'à aller lire ailleurs. Sans lien, le commercial le
 * sélectionne, le copie et le colle dans un moteur de recherche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DESTINATION, ET POURQUOI ELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche du registre telle que le produit la donne DÉJÀ : c'est exactement
 * l'adresse que `analysis.pappers_url` porte et que la carte « Financiers » du
 * dossier ouvre sous le libellé « Voir la fiche au registre »
 * (`account-detail/tabs/sections/CompanyPublicDataSection.tsx`). Deux liens vers
 * la même chose, depuis le même dossier, avec deux destinations différentes,
 * auraient été un choix à expliquer à chaque fois.
 *
 * Elle répond aussi à la question posée — « ce qui offre le plus d'infos » : sur
 * une seule page publique, les comptes déposés sur plusieurs exercices, les
 * dirigeants, les bénéficiaires effectifs, les annonces BODACC et les actes.
 * Le registre national (INPI) expose l'immatriculation seule, et met ses
 * documents derrière un compte.
 *
 * Le chemin `/entreprise/<siren>` se résout sans le slug du nom : c'est ce qui
 * permet de le construire à partir du seul SIREN, sans rien inventer.
 *
 * ⚠️ Le NOM du service ne s'écrit nulle part à l'écran — c'est un fournisseur de
 * données du produit, et GA-44 le garde. Le lien dit où il mène (« la fiche au
 * registre »), ce qui est l'honnêteté que la règle demande d'un lien sortant ;
 * c'est la destination qui est nommée, pas la maison qui l'héberge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout ce qui n'est pas un SIREN rend `undefined`, et l'appelant n'affiche alors
 * PAS de lien — jamais une recherche vide, jamais une fiche devinée. Le contrat
 * le dit (`account.ts` : « Pappers SIREN (9-digit French company id). Nullable
 * for legacy / non-FR rows »), et les comptes hors France portent leur
 * identifiant dans `registry_id` + `registry_country`, qui ne se lisent pas sur
 * ce registre-ci.
 */

/** Un SIREN : neuf chiffres, ni plus ni moins. Un SIRET (14) désigne un établissement. */
const SIREN = /^\d{9}$/

/**
 * L'adresse de la fiche publique du compte, ou `undefined` s'il n'y en a pas.
 *
 * Les espaces sont retirés avant la vérification : « 402 968 655 » est la MISE
 * EN FORME d'un SIREN, pas une autre valeur.
 */
export function companyRegistryUrl(siren: string | null | undefined): string | undefined {
  if (!siren) return undefined
  const digits = siren.replace(/\s/g, '')
  if (!SIREN.test(digits)) return undefined
  return `https://www.pappers.fr/entreprise/${digits}`
}
