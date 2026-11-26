import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MissionScoresService } from './mission-scores.service'

/**
 * Le prévisionnel, et le plancher qui n'en était pas un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 27/08
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur `/pilotage/finance`, deux cartes du MÊME bloc traitaient l'absence de deux
 * façons opposées :
 *
 *  - « Chiffre d'affaires » : « Aucune source pour ce chiffre — rien n'a encore
 *    été enregistré. **Ce n'est pas « zéro euro »** » ⇒ valeur « non mesuré » ;
 *  - « Prévisionnel » : « Espéré · **580 lignes sans montant — le total est un
 *    plancher** » ⇒ valeur **0 €**.
 *
 * Or `/pilotage/qualite` mesurait au même moment « Projets ouverts sans montant :
 * 580 sur 580 », soit CENT POUR CENT. Quand aucune ligne ne porte de montant, il
 * n'y a aucun plancher mesuré : « 0 € » se lit « rien d'espéré » alors que 580
 * affaires attendent leur montant.
 *
 * La cause est la même qu'au chiffre d'affaires, corrigée là-bas et pas ici :
 * `COALESCE(SUM(...), 0)`. En SQL, `SUM()` sans aucune valeur rend `NULL` ; le
 * `COALESCE` en faisait un zéro que l'écran affichait comme un montant mesuré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS UN DÉFAUT, ET QUI NE DOIT PAS LE DEVENIR
 * ─────────────────────────────────────────────────────────────────────────────
 * La convention « le total est un plancher » reste JUSTE dès qu'au moins une
 * ligne porte un montant : le total existe, il est seulement incomplet. Et zéro
 * ligne du tout reste 0 € — un pipe vide vaut bien zéro, contrairement à
 * l'encaissé, dont la colonne source n'est écrite par rien.
 */

type Row = { cents: string | null; without_amount: string | null; total: string | null }

/** Le raccourci vers la ligne privée, sans passer par les trois requêtes. */
async function line(rows: Row[]) {
  const service = new MissionScoresService({ manager: { query: async () => rows } } as never)
  const build = (service as unknown as { line: (k: string, sql: string, p: unknown[]) => Promise<unknown> }).line
  return (await build.call(service, 'hoped', 'SELECT 1', [])) as {
    amountCents: number | null
    withoutAmount: number
    count: number
  }
}

describe('le prévisionnel — un plancher suppose qu’une ligne porte un montant', () => {
  it('CENT POUR CENT des lignes sans montant : `null`, jamais 0 € (recette du 27/08)', async () => {
    // ⚠️ La première version de ce test passait AU VERT sur le code fautif :
    // elle nourrissait `cents: null`, alors que la requête, à cause de son
    // `COALESCE(SUM(...), 0)`, rend la chaîne « 0 ». Le fixture doit avoir la
    // forme que le lecteur reçoit VRAIMENT — les deux formes sont donc jouées,
    // celle d'avant la correction du SQL et celle d'après.
    for (const cents of ['0', null]) {
      const result = await line([{ cents, without_amount: '580', total: '580' }])
      expect(result.amountCents).toBeNull()
      expect(result.withoutAmount).toBe(580)
      expect(result.count).toBe(580)
    }
  })

  it('une seule ligne chiffrée suffit à faire un plancher — le comportement existant ne bouge pas', async () => {
    const result = await line([{ cents: '4500000', without_amount: '579', total: '580' }])
    expect(result.amountCents).toBe(4_500_000)
    expect(result.withoutAmount).toBe(579)
  })

  it('AUCUNE ligne : zéro est VRAI — un pipe vide vaut bien zéro', async () => {
    // À la différence de l'encaissé, dont la colonne source n'est écrite par
    // rien : là-bas « aucune ligne » veut dire « personne n'a jamais
    // enregistré », ici il veut dire « il n'y a aucune affaire ouverte ».
    for (const cents of ['0', null]) {
      const result = await line([{ cents, without_amount: '0', total: '0' }])
      expect(result.amountCents).toBe(0)
      expect(result.count).toBe(0)
    }
  })

  it('un vrai zéro chiffré RESTE zéro', async () => {
    const result = await line([{ cents: '0', without_amount: '0', total: '3' }])
    expect(result.amountCents).toBe(0)
  })

  it('une lecture en ÉCHEC reste distincte de l’absence', async () => {
    const service = new MissionScoresService({
      manager: {
        query: async () => {
          throw new Error('boom')
        },
      },
    } as never)
    const build = (service as unknown as { line: (k: string, sql: string, p: unknown[]) => Promise<unknown> }).line
    const result = (await build.call(service, 'hoped', 'SELECT 1', [])) as { amountCents: number | null }
    expect(result.amountCents).toBeNull()
  })
})

describe('les requêtes du prévisionnel ne rattrapent plus le vide en zéro', () => {
  it('aucune des trois ne COALESCE sa somme à 0', () => {
    // Garde de FORME, comme pour le chiffre d'affaires : c'est le
    // `COALESCE(SUM(...), 0)` qui produit le faux zéro, et il se réintroduit
    // d'un copier-coller.
    // ⚠️ Les COMMENTAIRES sont retirés d'abord — une garde doit lire le CODE,
    // pas la prose qui cite le motif fautif.
    const raw = readFileSync(join(__dirname, 'mission-scores.service.ts'), 'utf8')
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // Bornée au PRÉVISIONNEL : la requête de capacité, juste en dessous, a son
    // propre `COALESCE` et son propre arbitrage. Une garde qui déborde de ce
    // qu'elle protège finit par être désactivée pour une raison légitime.
    const start = stripped.indexOf('async forecast(')
    const end = stripped.indexOf('async capacity(')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const source = stripped.slice(start, end)
    // La garde LIT quelque chose : les trois requêtes du prévisionnel sont bien
    // dans cette tranche.
    expect((source.match(/AS without_amount/g) ?? []).length).toBe(3)
    expect(source).not.toMatch(/COALESCE\(SUM\(/)
  })
})
