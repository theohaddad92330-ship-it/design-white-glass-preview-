import { formaterInstant } from '@/lib/dates'
import type { DemoLead } from '@/lib/demo-leads'
import { STATUT_PROSPECT_DEMO } from './prospects.logic'

/**
 * #4387 — Louis, 20/10/2026 : « les prospects ont rempli le formulaire d'accès
 * à la démo pour être recontactés ; export complet autorisé sur cette page
 * seule, journalisé ». Ce module ne fait que FORMATER (pur) : l'autorisation et
 * le journal vivent dans la route `api/admin/prospects/export`.
 *
 * ⚠️ E-mails et téléphones EN CLAIR (doctrine c87, Louis 04/10/2026).
 */

/**
 * Les libellés de la liste fermée « Fonction » du formulaire de démo — miroir
 * de `apps/web/src/i18n/locales/fr/common.json` (`jobTitleOptions`), que le
 * back-office ne peut pas importer. Une clé inconnue sort BRUTE : jamais un
 * libellé inventé.
 */
const LIBELLES_ROLE: Readonly<Record<string, string>> = {
  business_developer: 'Business Developer / Business Manager',
  manager: 'Manager / Responsable d’équipe',
  agency_director: 'Directeur d’agence / BU',
  sales_director: 'Directeur commercial / Head of Sales',
  esn_founder: 'Fondateur / Dirigeant d’ESN',
  freelance: 'Freelance / Indépendant',
  other: 'Autre',
}

export function libelleRoleDeclare(cle: string): string {
  return LIBELLES_ROLE[cle] ?? cle
}

/**
 * Une cellule CSV : RFC 4180 (guillemets doublés, champ entouré dès qu'il porte
 * le séparateur, un guillemet ou un saut de ligne) ET protection contre
 * l'injection de formule — un tableur exécute une cellule qui commence par
 * `=`, `+`, `-` ou `@` ; une apostrophe en tête la rend inerte.
 */
export function cellulePourCsv(valeur: string | number | undefined): string {
  if (valeur === undefined) return ''
  let texte = String(valeur)
  if (/^[=+\-@]/.test(texte)) texte = `'${texte}`
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

const FORMAT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as const

/** `19/10/2026 10:30`, lu à Paris ; une date illisible sort VIDE (jamais « — »). */
function dateExport(valeur: string): string {
  return formaterInstant(valeur, FORMAT_DATE, '').replace(',', '')
}

export const COLONNES_EXPORT_PROSPECTS: ReadonlyArray<{
  entete: string
  valeur: (lead: DemoLead) => string | number | undefined
}> = [
  { entete: 'Prénom', valeur: l => l.firstName },
  { entete: 'Nom', valeur: l => l.lastName },
  { entete: 'E-mail', valeur: l => l.email },
  { entete: 'Téléphone', valeur: l => l.phone },
  { entete: 'Rôle déclaré', valeur: l => libelleRoleDeclare(l.jobTitle) },
  { entete: 'Entreprise', valeur: l => l.company },
  { entete: 'Statut', valeur: () => STATUT_PROSPECT_DEMO },
  { entete: 'Premier accès', valeur: l => dateExport(l.firstAccessAt) },
  { entete: 'Dernier accès', valeur: l => dateExport(l.lastAccessAt) },
  { entete: 'Nombre d’accès', valeur: l => l.accessCount },
  { entete: 'Source', valeur: l => l.source },
  { entete: 'UTM source', valeur: l => l.utmSource },
  { entete: 'UTM support', valeur: l => l.utmMedium },
  { entete: 'UTM campagne', valeur: l => l.utmCampaign },
  { entete: 'UTM terme', valeur: l => l.utmTerm },
  { entete: 'UTM contenu', valeur: l => l.utmContent },
]

const BOM = '﻿'

/** Excel FR : BOM UTF-8, séparateur `;`, fin de ligne CRLF. */
export function csvDesProspects(leads: readonly DemoLead[]): string {
  const ligne = (cellules: Array<string | number | undefined>) => cellules.map(cellulePourCsv).join(';')
  const lignes = [
    ligne(COLONNES_EXPORT_PROSPECTS.map(c => c.entete)),
    ...leads.map(lead => ligne(COLONNES_EXPORT_PROSPECTS.map(c => c.valeur(lead)))),
  ]
  return `${BOM}${lignes.join('\r\n')}\r\n`
}

/** `prospects-2026-10-20.csv` — le jour lu à Paris. */
export function nomFichierProspects(maintenant: Date): string {
  const [jj, mm, aaaa] = formaterInstant(maintenant, { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/')
  return `prospects-${aaaa}-${mm}-${jj}.csv`
}
