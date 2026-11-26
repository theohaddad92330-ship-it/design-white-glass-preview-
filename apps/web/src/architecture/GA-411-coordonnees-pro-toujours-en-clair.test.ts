/**
 * GA-411 — LES COORDONNÉES PRO S'AFFICHENT TOUJOURS EN CLAIR.
 *
 * Décision de Louis du 04/10/2026, définitive (doctrine
 * `c87_coordonnees_pro_toujours_en_clair`) : e-mail, téléphone, nom et prénom,
 * LinkedIn, poste, société, adresse pro — une donnée DÉJÀ EN BASE s'affiche
 * en entier, sans clic « Révéler ». Ce sont des coordonnées professionnelles,
 * l'outil n'est pas public, et c'est la force du produit.
 *
 * CE QUE LA GARDE REFUSE
 * Qu'un MASQUAGE D'AFFICHAGE revienne : un assistant `maskEmail` / `maskPhone`
 * / `maskName`, un composant `<MaskedEmail>`, une route `email-reveal`, ou un
 * gabarit qui fabrique `m****@societe.com`. Elle lit l'application web ET le
 * contexte de Laura côté API (`ia-proxy`), là où une donnée en base devient
 * un texte qu'un humain ou le modèle lit.
 *
 * CE QU'ELLE NE VISE PAS — et qui reste juste
 *  · le geste PAYANT d'enrichissement (« Enrichir », révéler auprès d'un
 *    fournisseur une coordonnée qu'on n'a PAS) : il garde son débit de crédits ;
 *  · le nom de famille qu'un fournisseur publie lui-même masqué
 *    (`lastNameObfuscated`) : on ne l'a pas en entier, on ne l'invente pas ;
 *  · les secrets, jetons, mots de passe et clés (`••••••••` d'un champ de mot
 *    de passe), et le masquage des JOURNAUX d'observabilité (`pii-masking.ts`,
 *    Langfuse, Sentry) : un journal n'est pas un écran.
 *
 * Une garde protège une règle, elle ne l'invente pas : elle LIT un corpus réel,
 * elle sait dire NON, et elle n'attrape pas ce qu'elle ne vise pas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'

const WEB_SRC = fileURLToPath(new URL('../', import.meta.url))
const DASHBOARD_MANAGER = fileURLToPath(new URL('../../../dashboard-manager/src/', import.meta.url))
const LAURA_CONTEXTE = fileURLToPath(new URL('../../../api/src/modules/ia-proxy/', import.meta.url))

/**
 * Les FORMES d'un masquage d'affichage. Liste courte et fermée, écrite pour
 * être relue : une forme nouvelle s'ajoute ici avec son exemple ci-dessous.
 */
const MASQUAGE_D_AFFICHAGE = [
  /\bmask(?:Email|Phone|Name|LinkedIn)\b/,
  /\bMasked(?:Email|Phone|Name)\b/,
  /email-reveal/,
  // `m****@societe.com` fabriqué par gabarit ou concaténation.
  /\*{3,}@|\*{3,}\$\{/,
]

function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function masqueUnAffichage(source: string): boolean {
  const code = sansCommentaires(source)
  return MASQUAGE_D_AFFICHAGE.some(motif => motif.test(code))
}

function fichiersDeProduction(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) {
      if (entree === 'architecture' || entree === '__tests__' || entree === 'node_modules') continue
      fichiersDeProduction(chemin, out)
    } else if (/\.tsx?$/.test(entree) && !/\.(test|spec)\.tsx?$/.test(entree)) {
      out.push(chemin)
    }
  }
  return out
}

describe('GA-411 — coordonnées pro toujours en clair (c87, Louis 04/10/2026)', () => {
  it('LIT quelque chose — le web et le contexte de Laura sont dans le corpus', () => {
    const web = fichiersDeProduction(WEB_SRC)
    const laura = fichiersDeProduction(LAURA_CONTEXTE)
    expect(web.length).toBeGreaterThan(500)
    expect(laura.map(c => relative(LAURA_CONTEXTE, c))).toContain('contact-identity-label.ts')
    // Le back-office (c87, 05/10) : les adresses y sont en clair aussi.
    expect(fichiersDeProduction(DASHBOARD_MANAGER).map(c => relative(DASHBOARD_MANAGER, c))).toContain(
      'app/_components/email-en-clair.tsx',
    )
  })

  it('sait dire NON — chaque forme de masquage est refusée', () => {
    expect(masqueUnAffichage("import { maskEmail } from '@/lib/mask-email'")).toBe(true)
    expect(masqueUnAffichage('const p = maskPhone(contact.phone)')).toBe(true)
    expect(masqueUnAffichage('<MaskedEmail email={c.email} context="x" />')).toBe(true)
    expect(masqueUnAffichage("void fetch('/api/admin/email-reveal')")).toBe(true)
    expect(masqueUnAffichage('return `${local[0]}****${domain}`')).toBe(true)
    expect(masqueUnAffichage("const shown = 'j****@acme.fr'")).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    // Le nom de famille que le FOURNISSEUR publie masqué — on ne l'a pas en entier.
    expect(masqueUnAffichage('const n = `${hit.firstName} ${hit.lastNameObfuscated}`')).toBe(false)
    // Le badge « Nom à révéler » d'une demi-identité, et l'ancrage de page.
    expect(masqueUnAffichage('if (identity.nameToReveal) badge()')).toBe(false)
    expect(masqueUnAffichage('revealTarget(anchorId)')).toBe(false)
    // Un champ de mot de passe — un secret, pas une coordonnée.
    expect(masqueUnAffichage("placeholder: '••••••••'")).toBe(false)
    // Sa propre justification, en commentaire.
    expect(masqueUnAffichage('// jamais de maskEmail ici (c87)\nconst a = 1')).toBe(false)
  })

  it('un nom complet tenu en base ne se réduit jamais à « prénom + initiale »', () => {
    // La règle EXÉCUTÉE, pas seulement lue : même avec le masque du fournisseur
    // encore rangé à côté, le nom qu'on tient s'affiche en entier.
    expect(contactDisplayIdentity({ full_name: 'Severine Mondy', last_name_obfuscated: 'Mo***y' }).label).toBe(
      'Severine Mondy',
    )
    // Et le cas qui reste légitime : un prénom seul, le reste n'est pas en base.
    expect(contactDisplayIdentity({ full_name: 'Severine', last_name_obfuscated: 'Mo***y' }).label).toBe('Severine M.')
  })

  it('aucun écran ni contexte de Laura ne masque une coordonnée déjà en base', () => {
    const fautifs = [
      ...fichiersDeProduction(WEB_SRC),
      ...fichiersDeProduction(LAURA_CONTEXTE),
      ...fichiersDeProduction(DASHBOARD_MANAGER),
    ]
      .filter(chemin => masqueUnAffichage(readFileSync(chemin, 'utf8')))
      .map(chemin => relative(join(WEB_SRC, '../../..'), chemin))

    expect(
      fautifs,
      [
        'Un masquage d’affichage est revenu (c87, Louis 04/10/2026 : coordonnées pro toujours en clair).',
        'Une donnée déjà en base s’affiche en entier, sans clic « Révéler ».',
        '',
        ...fautifs,
      ].join('\n'),
    ).toEqual([])
  })
})
