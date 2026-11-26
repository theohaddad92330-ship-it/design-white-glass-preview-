/**
 * GA-203 — l'état « prêt à facturer » d'un compte ne dépend plus d'un plafond
 * de pagination (§9 du 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoiceReadiness` est calculé PAR MISSION, PAR MOIS, sur le serveur. La
 * ligne rendue ne portait, jusqu'au 30/08, QUE `accountName` — une CHAÎNE —
 * alors que la requête joignait déjà `accounts` sans sélectionner `a.id`.
 * Faute d'`accountId`, l'écran des comptes devait joindre par `missionId` en
 * passant par `GET /delivery/missions`, plafonné à 200 lignes SANS
 * pagination : un compte dont toutes les missions tombaient au-delà de ce
 * plafond s'affichait « non mesuré » — un état ABSENT sans raison de l'être.
 *
 * Le correctif ajoute `accountId` à `invoiceReadinessSchema`
 * (`packages/contracts`) et le sélectionne côté service ; côté écran, il
 * retire la jointure par `missionId` et regroupe directement les lignes de
 * `GET /delivery/invoice-readiness` (non plafonné) par `accountId`.
 *
 * ⚠️ Joindre par NOM aurait été PIRE que le défaut d'origine — deux comptes
 * peuvent porter le même nom, et un nom peut être `null` — c'est la
 * « jointure par position » que ce dépôt a déjà payée. La garde refuse donc
 * les DEUX régressions : revenir à `GET /delivery/missions`, ou joindre par
 * `accountName`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE (CLAUDE.md)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle SAIT DIRE NON → `dependsOnCappedMissionsList` reconnaît la forme
 *    EXACTE du défaut sur des extraits ADVERSARIAUX (la vraie ancienne
 *    fonction, un appel `useMissions()`, une jointure par `accountName`) —
 *    ces trois sous-tests rougiraient si le détecteur cessait de les repérer ;
 *  · elle LIT quelque chose → `describe('le corpus…')` vérifie que les deux
 *    fichiers protégés existent, ne sont pas vides, et portent bien la
 *    fonction attendue — un fichier vidé ferait rougir ces assertions, jamais
 *    passer la garde au vert.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FEATURE_DIR = join(__dirname, '..', 'features', 'accounts', 'view', 'accounts-list')
const INDEX_FILE = join(FEATURE_DIR, 'accountInvoiceReadiness.ts')
const HOOK_FILE = join(FEATURE_DIR, 'useAccountInvoiceReadiness.ts')

/**
 * Le compte s'appuie-t-il encore sur une source PLAFONNÉE ou une jointure par
 * NOM pour savoir à quel compte appartient une ligne de facturation ?
 *
 * Trois signaux, chacun suffisant seul :
 *  - `missionIdsByAccount` — le nom EXACT de l'index intermédiaire que
 *    l'ancienne jointure par `missionId` construisait ;
 *  - `useMissions(` — l'appel au hook qui lit `GET /delivery/missions`
 *    (plafonné à 200 lignes) ;
 *  - `accountName ===` ou `.accountName)` en position de clé de regroupement
 *    — la jointure par NOM que ce dépôt a déjà refusée ailleurs (deux comptes
 *    peuvent porter le même nom, un nom peut être `null`).
 *
 * Retirée avant lecture : la partie COMMENTAIRE d'un fichier — un exemple
 * fautif CITÉ en docblock ne doit pas faire rougir la garde qu'il documente
 * (le piège payé sur GA-121 : « des listes découpées sans retirer les
 * commentaires »).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function dependsOnCappedMissionsList(source: string): boolean {
  const clean = stripComments(source)
  return (
    /missionIdsByAccount/.test(clean) ||
    /useMissions\s*\(/.test(clean) ||
    /groupBy(?:AccountName|Name)\s*\(/.test(clean)
  )
}

describe('GA-203 — la garde lit bien quelque chose', () => {
  it('les deux fichiers protégés existent et ne sont pas vidés', () => {
    expect(statSync(INDEX_FILE).size, 'corpus vide : accountInvoiceReadiness.ts').toBeGreaterThan(1_000)
    expect(statSync(HOOK_FILE).size, 'corpus vide : useAccountInvoiceReadiness.ts').toBeGreaterThan(300)
  })

  it('accountInvoiceReadiness.ts porte bien la fonction qui construit l’index, regroupée par `accountId`', () => {
    const source = readFileSync(INDEX_FILE, 'utf8')
    expect(source).toContain('buildAccountInvoiceReadinessIndex')
    expect(source).toContain('.accountId')
  })
})

describe('GA-203 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut d’origine — un JOIN missionId → account_id via la liste plafonnée', () => {
    // La vraie fonction d'avant le 30/08 (`git show`), pas une caricature.
    const faulty = `
      function buildAccountInvoiceReadinessIndex(accountIdsWithMission, missions, readinessItems) {
        const readinessByMission = new Map(readinessItems.map(item => [item.missionId, item]))
        const missionIdsByAccount = new Map()
        for (const mission of missions) {
          const existing = missionIdsByAccount.get(mission.account_id)
          if (existing) existing.push(mission.id)
          else missionIdsByAccount.set(mission.account_id, [mission.id])
        }
      }
    `
    expect(dependsOnCappedMissionsList(faulty)).toBe(true)
  })

  it('repère l’appel `useMissions()` dans le hook — même sans le join, la source plafonnée resterait lue', () => {
    const faulty = `
      const missions = useMissions()
      const index = buildAccountInvoiceReadinessIndex(accountIdsWithMission, missions.data?.missions ?? [], readiness.data?.items ?? [])
      return { failed: digest.isError || missions.isError || readiness.isError, get: accountId => accountInvoiceReadinessOf(index, accountId) }
    `
    expect(dependsOnCappedMissionsList(faulty)).toBe(true)
  })

  it('repère une jointure par NOM — pire que le défaut d’origine, deux comptes peuvent partager un nom', () => {
    const faulty = `
      function groupByAccountName(readinessItems) {
        const byName = new Map()
        for (const item of readinessItems) byName.set(item.accountName, item)
        return byName
      }
    `
    expect(dependsOnCappedMissionsList(faulty)).toBe(true)
  })

  it('laisse passer la forme corrigée — un regroupement direct par `accountId`, et lit les commentaires comme des commentaires', () => {
    const fixed = `
      function buildAccountInvoiceReadinessIndex(accountIdsWithMission, readinessItems) {
        const rowsByAccount = new Map()
        for (const item of readinessItems) {
          if (item.accountId === null) continue
          const existing = rowsByAccount.get(item.accountId)
          if (existing) existing.push(item)
          else rowsByAccount.set(item.accountId, [item])
        }
      }
    `
    expect(dependsOnCappedMissionsList(fixed)).toBe(false)
    // Un exemple fautif CITÉ dans un commentaire n'est pas du code qui dépend
    // encore du plafond.
    expect(
      dependsOnCappedMissionsList('/* avant le 30/08 : const missions = useMissions() ; missionIdsByAccount */'),
    ).toBe(false)
  })
})

describe('GA-203 — l’état d’un compte ne dépend plus d’un plafond de pagination', () => {
  it('accountInvoiceReadiness.ts ne construit plus d’index par `missionId` ni par nom', () => {
    const source = readFileSync(INDEX_FILE, 'utf8')
    expect(dependsOnCappedMissionsList(source)).toBe(false)
  })

  it('useAccountInvoiceReadiness.ts n’appelle plus `useMissions()`', () => {
    const source = readFileSync(HOOK_FILE, 'utf8')
    expect(dependsOnCappedMissionsList(source)).toBe(false)
  })
})
