/**
 * Les vocabulaires du REGISTRE — régions, catégories d'entreprise, formes
 * juridiques.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUT CE FICHIER A ÉTÉ MESURÉ, RIEN N'Y EST DEVINÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `recherche-entreprises.api.gouv.fr` **ignore en silence** un paramètre qu'il
 * ne connaît pas : le total revient inchangé, sans erreur, sans avertissement.
 * « Ça marche » et « c'est ignoré » se ressemblent donc exactement, et un code
 * inventé produit un filtre qui ne filtre rien.
 *
 * Chaque valeur ci-dessous a été interrogée le 04/09/2026, avec
 * `parametre_bidon=42` comme TÉMOIN de la méthode (base NAF 30.30Z = 745
 * établissements ; le témoin rend 745, donc il est bien ignoré).
 *
 * ⚠️ Les codes de forme juridique volontairement ABSENTS le sont parce que je
 * n'ai pas pu établir leur libellé avec certitude — pas parce qu'ils
 * n'existent pas. Un libellé faux sur un filtre est pire qu'un filtre manquant :
 * il fait chercher autre chose que ce qu'on croit. La liste est ADDITIVE.
 */

/** Les 18 régions INSEE. `region=76` mesuré à 156 sur la base (745 → 156). */
export const REGISTRY_REGIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: '84', label: 'Auvergne-Rhône-Alpes' },
  { code: '27', label: 'Bourgogne-Franche-Comté' },
  { code: '53', label: 'Bretagne' },
  { code: '24', label: 'Centre-Val de Loire' },
  { code: '94', label: 'Corse' },
  { code: '44', label: 'Grand Est' },
  { code: '32', label: 'Hauts-de-France' },
  { code: '11', label: 'Île-de-France' },
  { code: '28', label: 'Normandie' },
  { code: '75', label: 'Nouvelle-Aquitaine' },
  { code: '76', label: 'Occitanie' },
  { code: '52', label: 'Pays de la Loire' },
  { code: '93', label: "Provence-Alpes-Côte d'Azur" },
  { code: '01', label: 'Guadeloupe' },
  { code: '02', label: 'Martinique' },
  { code: '03', label: 'Guyane' },
  { code: '04', label: 'La Réunion' },
  { code: '06', label: 'Mayotte' },
]

/**
 * Catégorie INSEE — elle croise effectif, chiffre d'affaires ET bilan, ce que
 * l'effectif seul ne fait pas. C'est elle qui rend « ETI industrielle »
 * exprimable en un clic. `categorie_entreprise=ETI` mesuré à 52 (745 → 52).
 *
 * ⚠️ JAMAIS un défaut. Le dépôt a déjà refusé `categorie_entreprise=ETI,GE`
 * comme correctif automatique au tri du registre, parce que « les clients d'une
 * ESN ne sont pas tous des ETI, et une PME de 200 personnes est une cible
 * parfaitement légitime ». Ici l'utilisateur le CHOISIT.
 */
export const COMPANY_CATEGORIES: ReadonlyArray<{ code: string; labelKey: string }> = [
  { code: 'PME', labelKey: 'rail.companyCategory.pme' },
  { code: 'ETI', labelKey: 'rail.companyCategory.eti' },
  { code: 'GE', labelKey: 'rail.companyCategory.ge' },
]

/**
 * Formes juridiques — chaque entrée porte les codes INSEE que le registre a
 * RECONNUS. `nature_juridique=5710` mesuré à 400 (745 → 400) ; un code inconnu
 * (5720, 5498) fait échouer la réponse au lieu de la laisser passer, ce qui est
 * la seule raison pour laquelle cette liste est vérifiable.
 *
 * Elle est COURTE et assumée telle : ce sont les formes sous lesquelles les
 * clients d'une ESN sont immatriculés. Elle s'allonge quand quelqu'un a besoin
 * d'une forme de plus ET peut établir son libellé.
 */
export const LEGAL_FORMS: ReadonlyArray<{ code: string; labelKey: string }> = [
  { code: '5710', labelKey: 'rail.legalForm.sas' },
  { code: '5499', labelKey: 'rail.legalForm.sarl' },
  { code: '5599', labelKey: 'rail.legalForm.sa' },
  { code: '6540', labelKey: 'rail.legalForm.sci' },
  { code: '9220', labelKey: 'rail.legalForm.association' },
  { code: '1000', labelKey: 'rail.legalForm.ei' },
]

/** 01-95, 2A/2B (Corse), 971-976 (DOM). */
const DEPARTMENT_RE = /^(?:0[1-9]|[1-8]\d|9[0-5]|2[AB]|97[1-6])$/

/**
 * TOUS les départements exploitables d'une saisie libre — plus seulement le
 * premier.
 *
 * ⚠️ `parseDepartment` (singulier) en gardait UN et jetait le reste, parce que
 * « les deux endpoints prennent un département ». C'est faux depuis : le
 * registre en accepte nativement une liste — `departement=31,33` rend 142 quand
 * 31 seul en rend 97 et 33 seul 45. Le champ INVITAIT déjà à en coller
 * plusieurs (il accepte virgules et espaces) ; il n'en honorait qu'un, sans le
 * dire. Un chiffre seul est complété (« 1 » → 01).
 */
export function parseDepartments(raw: string): string[] {
  const out: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    const trimmed = token.trim().toUpperCase()
    if (!trimmed) continue
    const padded = /^\d$/.test(trimmed) ? `0${trimmed}` : trimmed
    if (DEPARTMENT_RE.test(padded) && !out.includes(padded)) out.push(padded)
  }
  return out
}

/** Un montant saisi en euros → entier positif, ou `undefined`. Un montant
 *  illisible n'est JAMAIS 0 : zéro euro de chiffre d'affaires est une valeur
 *  vraie et différente de « non renseigné ». */
export function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return undefined
  const value = Number(digits)
  return Number.isSafeInteger(value) ? value : undefined
}
