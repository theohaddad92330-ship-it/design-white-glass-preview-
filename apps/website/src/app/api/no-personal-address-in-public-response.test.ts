import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Aucune adresse NOMINATIVE ne part dans une réponse d'API publique.
 *
 * Les routes de `app/api/` du site sont **anonymes** : n'importe qui peut les
 * appeler. Deux d'entre elles répondaient, quand la clé d'envoi manque :
 * « Écrivez-nous à <prénom>@bellum-it.com » — c'est-à-dire qu'elles
 * divulguaient l'adresse personnelle d'un salarié à tout appelant, y compris
 * un moissonneur. Le défaut était signalé le 24/08 comme « bug de production »
 * et n'a jamais été repris : il dormait dans une archive marquée `DONE`.
 *
 * Ce que cette garde tient : **une adresse de RÔLE** (`contact@`, `dpo@`,
 * `support@`, `security@`) peut être publiée — c'est sa raison d'être, et les
 * CGU en publient déjà. Une adresse qui nomme une PERSONNE, non.
 *
 * ⚠️ Elle regarde les CHAÎNES LITTÉRALES du fichier, pas la réponse à
 * l'exécution : une adresse assemblée à partir de morceaux lui échapperait.
 * C'est une garde de forme, pas une preuve — et le dire vaut mieux que le
 * laisser croire.
 */

const API = join(__dirname)

/** Les adresses qu'on a le droit de publier : elles ne nomment personne. */
const ROLE_MAILBOXES = ['contact', 'dpo', 'support', 'security', 'privacy', 'legal', 'hello', 'onboarding', 'noreply']

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full))
      continue
    }
    if (entry === 'route.ts' || entry === 'route.tsx') out.push(full)
  }
  return out
}

/** Les adresses citées en clair dans un fichier, dédupliquées. */
function addressesIn(source: string): string[] {
  return [...new Set(source.match(EMAIL) ?? [])]
}

function isRoleAddress(address: string): boolean {
  const mailbox = address.split('@')[0]?.toLowerCase() ?? ''
  return ROLE_MAILBOXES.includes(mailbox)
}

describe('aucune adresse nominative dans une réponse d’API publique', () => {
  const files = routeFiles(API)

  it('la garde LIT quelque chose — un corpus vide passerait au vert pour toujours', () => {
    expect(files.length).toBeGreaterThan(1)
    const total = files.reduce((n, f) => n + readFileSync(f, 'utf8').length, 0)
    expect(total).toBeGreaterThan(1_000)
    // Et elle sait reconnaître une adresse : sans ça, « zéro nominative »
    // voudrait seulement dire « zéro adresse trouvée ».
    const seen = files.flatMap(f => addressesIn(readFileSync(f, 'utf8')))
    expect(seen.length).toBeGreaterThan(0)
  })

  it('une adresse de RÔLE reste publiable, une adresse de PERSONNE non', () => {
    expect(isRoleAddress('contact@bellum-it.com')).toBe(true)
    expect(isRoleAddress('dpo@bellum-it.com')).toBe(true)
    // Le cas exact qui a produit le défaut :
    expect(isRoleAddress('theo@bellum-it.com')).toBe(false)
    expect(isRoleAddress('louis@bellum-it.com')).toBe(false)
  })

  it('aucune route ne cite une adresse nominative en clair', () => {
    const offenders = files.flatMap(file =>
      addressesIn(readFileSync(file, 'utf8'))
        .filter(address => !isRoleAddress(address))
        .map(address => `${file.slice(API.length + 1)} → ${address}`),
    )
    // Si ce test tombe : remplace l'adresse par une adresse de RÔLE dans le
    // message rendu à l'appelant, et fais du destinataire un réglage
    // (`process.env.*`) plutôt qu'une constante suivie par git.
    expect(offenders).toEqual([])
  })
})
