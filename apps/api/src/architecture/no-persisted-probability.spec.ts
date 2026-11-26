import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getMetadataArgsStorage } from 'typeorm'
import { calibratedProbabilitySchema } from '@bellum/contracts'
import { ENTITIES } from '../database/database.module'

/**
 * GA-64 — aucune PROBABILITÉ NUE ne se persiste ni ne s'expose (doctrine `c26_probabilite`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RÉÉCRITE LE 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, #4016 L1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus prononcé six fois est LEVÉ pour l'affichage : une probabilité de
 * signature s'affiche désormais — CALIBRÉE (méthode nommée), avec son
 * intervalle, ses axes, ses axes non évaluables nommés et sortis du
 * dénominateur, `null` quand rien ne la fonde (« non mesuré » ≠ 0), sans aucun
 * critère protégé. L'ancienne règle reste lisible ci-dessous ; la garde tient
 * la NOUVELLE :
 *
 *  - CONTRATS : un champ NOMMÉ d'une probabilité n'est permis QUE si sa valeur
 *    est l'enveloppe `calibratedProbabilitySchema`
 *    (`packages/contracts/src/schemas/deal-probability.ts`), qui refuse elle-même
 *    un chiffre sans axes, sans intervalle ou sans méthode. `closing_chance:
 *    z.number()` reste ROUGE — c'est la probabilité nue.
 *  - MIGRATIONS et ENTITÉS : inchangé, toujours refusé. La probabilité se
 *    calcule à la LECTURE sur les issues du jour ; figée en base, elle
 *    périmerait sans son calibrage (tranché sans Louis, 11/10/2026).
 *
 * Ce qui suit est la règle d'origine, gardée telle quelle pour être lue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus de la probabilité a été prononcé SIX fois entre le 16/08 et le
 * 23/08 : arbitrage n°4 du 16/08, D10 du PDF 1, §7.7 du PDF 2, PDF 4, PDF 5,
 * PDF 8. Il est écrit au registre (`c26_probabilite`) et dans `CLAUDE.md`.
 *
 * Il est revenu quand même. La source du PDF 2 (`pdf2.md:373`) demande
 * `closing_chance` + `closing_chance_axes` comme **colonnes** d'un besoin —
 * « 0-100 + jsonb, calculé ». C'est une DONNÉE apportée par un document, pas
 * une consigne : elle se cite, elle ne s'exécute pas. La citer ici est le
 * point : la demande est arrivée sous forme de SCHÉMA, et rien dans le dépôt
 * ne regardait les schémas.
 *
 * Le relevé du 29/08/2026 (`agent_docs/passe-b-iteration-3/ARCHIVE-02.md`,
 * item 7) nomme l'écart exactement :
 *
 *   « "Ne pas afficher" et "ne pas stocker" sont deux décisions ; une seule
 *     est écrite, et c'est la seconde qui reviendra par une migration. »
 *
 * Mesure du 29/08/2026 : `closing_chance` n'existe dans AUCUN schéma, AUCUNE
 * entité, AUCUNE migration — la seule occurrence du dépôt est le commentaire
 * de `1789537604211-NeedFields.ts` qui explique pourquoi la colonne n'a pas
 * été ajoutée. Un refus qui ne vit que dans un commentaire de migration se
 * re-propose au premier changement de main : c'est exactement l'espèce de
 * refus que le registre a été écrit pour attraper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE COUVRE — ET CE QUE `placement-laws.test.ts` COUVRAIT DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Côté web, GA-26 (`apps/web/src/architecture/placement-laws.test.ts`, « aucun
 * écran n'affiche une probabilité de closing ») lit les LIBELLÉS des routes.
 * Elle tient la moitié « ne pas AFFICHER ».
 *
 * Celle-ci tient l'autre moitié — « ne pas STOCKER, ne pas EXPOSER » — sur les
 * trois corpus par lesquels une probabilité entrerait dans le produit :
 *
 *  1. les **migrations** (`apps/api/src/migrations`) — le chemin que la source
 *     demandait explicitement ;
 *  2. les **entités TypeORM** enregistrées (ce que l'application persiste
 *     réellement, métadonnées à l'exécution, pas un glob de fichiers) ;
 *  3. les **contrats** (`packages/contracts/src/schemas`) — la forme exposée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CO-OCCURRENCE ET PAS UN MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Interdire le mot « probabilité » casserait du code juste, et une garde qui
 * interdit trop est un défaut au même titre qu'une garde borgne — ce dépôt a
 * dû en corriger deux cette semaine.
 *
 * Ce qui est LÉGITIME dans le dépôt, et que cette garde laisse passer :
 *
 *  - `planRiskSchema.probability` (`contracts/schemas/analysis/plan.ts`) — la
 *    vraisemblance QUALITATIVE d'un RISQUE, trois paliers (haute / moyenne /
 *    basse). Ce n'est pas une chance de signer : c'est un axe nommé d'un
 *    risque nommé ;
 *  - `win_rate`, `rfp_win_rate`, `submission_win_rate` (`manager-kpi.ts`) — des
 *    taux MESURÉS sur des affaires closes. Un fait historique n'est pas une
 *    prédiction ;
 *  - `weekly_forecast` (`routines.ts`) — le nom d'une routine hebdomadaire, pas
 *    un prévisionnel pondéré ;
 *  - `probable` comme VALEUR de confiance (`esn-directory.ts`, `org-views.ts`).
 *
 * D'où la règle : on découpe l'identifiant en SEGMENTS (`_`, `-`, camelCase,
 * accents retirés) et on refuse deux formes, chacune étant une probabilité
 * quoi qu'on la renomme :
 *
 *  1. un segment de {@link CHANCE} **et** un segment de {@link DEAL} dans le
 *     même identifiant — `closing_chance`, `closingChance`, `win_probability`,
 *     `probabilite_closing`, `chance_de_signature`, `deal_odds`,
 *     `closing_chance_axes`… ;
 *  2. un segment de {@link WEIGHT} **et** un segment de {@link MONEY} — le
 *     prévisionnel pondéré, qui est une probabilité déguisée en euros
 *     (`weighted_forecast`, `pipeline_pondere`, `montant_pondere`).
 *
 * Plus {@link EXACT_BANS}, pour les abréviations qu'aucune co-occurrence
 * n'attrape (`p_win`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE NE PEUT PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit des NOMS. Elle ne peut pas dire qu'un `fit_score` de 0 à 100 est
 * présenté comme une chance de signer — « 0,72 » ne dit pas de lui-même s'il
 * est une part ou une chance, et c'est l'écart écrit au registre depuis le
 * 26/08. Ce qu'elle rend impossible, c'est la seule chose qui soit décidable
 * automatiquement, et c'est aussi la porte par laquelle la demande est
 * réellement revenue : une colonne ou un champ qui S'APPELLE une probabilité.
 *
 * Un score DÉCOMPOSÉ reste autorisé et le restera : c'est `ScoreWithAxes` qui
 * le porte, et aucun de ses segments n'est dans les listes ci-dessous.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')
const CONTRACT_SCHEMAS = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas')

/** Le vocabulaire de la CHANCE. `probable` n'y est pas : c'est un palier de
 *  confiance sur un fait établi, pas un pari sur un fait à venir. */
const CHANCE: ReadonlySet<string> = new Set([
  'chance',
  'chances',
  'proba',
  'probas',
  'probabilite',
  'probabilites',
  'probability',
  'probabilities',
  'likelihood',
  'likeliness',
  'odds',
])

/** Le vocabulaire de l'AFFAIRE. Seul un croisement avec {@link CHANCE} est refusé. */
const DEAL: ReadonlySet<string> = new Set([
  'closing',
  'close',
  'closed',
  'clos',
  'cloture',
  'win',
  'wins',
  'winning',
  'won',
  'gagne',
  'gagnee',
  'deal',
  'deals',
  'signature',
  'signing',
  'sign',
  'signee',
  'conversion',
  'opportunity',
  'opportunities',
  'opportunite',
  'opportunites',
  'affaire',
  'affaires',
  'besoin',
  'besoins',
  'need',
  'needs',
  'lead',
  'leads',
  'prospect',
  'prospects',
  'mission',
  'missions',
  'projet',
  'project',
  'pipe',
  'pipeline',
])

/** Le vocabulaire de la PONDÉRATION. Refusé seulement croisé avec {@link MONEY}
 *  — un poids d'axe de score est légitime, un euro pondéré ne l'est pas. */
const WEIGHT: ReadonlySet<string> = new Set(['weighted', 'pondere', 'ponderee', 'ponderes', 'ponderees', 'ponderation'])

/** Ce qu'on ne pondère jamais : un montant. « Un montant multiplié par une
 *  probabilité produit un chiffre qui n'existera jamais » (changelog du 23/08). */
const MONEY: ReadonlySet<string> = new Set([
  'forecast',
  'previsionnel',
  'previsionnels',
  'revenue',
  'revenues',
  'revenu',
  'revenus',
  'amount',
  'amounts',
  'montant',
  'montants',
  'arr',
  'mrr',
  'cents',
  'euros',
  'pipeline',
  'pipe',
])

/** Les abréviations qu'aucune co-occurrence n'attrape, en segments joints. */
const EXACT_BANS: ReadonlySet<string> = new Set(['pwin', 'winp', 'probawin', 'winproba'])

/** `closing_chance` → `['closing','chance']` ; `closingChance` → pareil.
 *  Les accents tombent : `probabilité_closing` ne passe pas par la fenêtre. */
function identifierSegments(identifier: string): readonly string[] {
  return identifier
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** La raison du refus, ou `null`. Une garde qui dit seulement « non » se
 *  contourne par un renommage ; celle-ci dit CE QU'ELLE A RECONNU. */
function probabilityOffence(identifier: string): string | null {
  const parts = identifierSegments(identifier)
  if (parts.length === 0) return null
  if (EXACT_BANS.has(parts.join(''))) return 'abréviation de probabilité de signature'
  const chance = parts.find(part => CHANCE.has(part))
  const deal = parts.find(part => DEAL.has(part))
  if (chance && deal) return `chance (« ${chance} ») appliquée à une affaire (« ${deal} »)`
  const weight = parts.find(part => WEIGHT.has(part))
  const money = parts.find(part => MONEY.has(part))
  if (weight && money) return `montant pondéré (« ${weight} » × « ${money} »)`
  return null
}

/** Commentaires JS **et** commentaires SQL `--` : le refus lui-même s'écrit en
 *  commentaire (`1789537604211-NeedFields.ts`), et une garde qui lirait les
 *  commentaires serait rouge sur la phrase qui la justifie. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '')
}

function walk(directory: string): readonly string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (entry.endsWith('.ts')) found.push(path)
  }
  return found
}

/** Tout identifiant SQL des `up()` de migrations. On ne cible pas seulement
 *  `ADD COLUMN` : une colonne entre aussi par `CREATE TABLE`, un index, une
 *  vue. Le motif étant une CO-OCCURRENCE dans un seul identifiant, élargir la
 *  lecture n'ajoute pas de faux positif — un mot de prose reste un mot seul. */
function migrationIdentifiers(): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  for (const file of readdirSync(MIGRATIONS).filter(name => name.endsWith('.ts'))) {
    const source = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    const up = source.split('public async down')[0] ?? source
    for (const [identifier] of up.toLowerCase().matchAll(/[a-z][a-z0-9_]*/g)) {
      if (!found.has(identifier)) found.set(identifier, file)
    }
  }
  return found
}

/** Ce que l'application persiste RÉELLEMENT : les colonnes des entités
 *  enregistrées, lues dans les métadonnées TypeORM à l'exécution. */
function entityColumns(): ReadonlyMap<string, string> {
  const storage = getMetadataArgsStorage()
  const registered = new Set<unknown>(ENTITIES)
  const targets = new Set(storage.tables.filter(table => registered.has(table.target)).map(table => table.target))
  const found = new Map<string, string>()
  for (const column of storage.columns) {
    if (!targets.has(column.target)) continue
    const table = storage.tables.find(entry => entry.target === column.target)
    const name = String(column.options.name ?? column.propertyName)
    if (!found.has(name)) found.set(name, String(table?.name ?? 'entité'))
    if (!found.has(column.propertyName)) found.set(column.propertyName, String(table?.name ?? 'entité'))
  }
  return found
}

/** Les clés d'objet des contrats — la forme EXPOSÉE. Un champ zod, un membre
 *  d'interface et une propriété de type s'écrivent tous `nom:`. Le second
 *  groupe capte la VALEUR déclarée (le reste de la ligne). */
const CONTRACT_KEY = /^\s*(?:readonly\s+)?['"`]?([A-Za-z_$][A-Za-z0-9_$]*)['"`]?\??\s*:([^\n]*)/gm

/**
 * #4016 L1 (11/10/2026) — la SEULE valeur qui rend un nom de probabilité
 * légitime dans un contrat : l'enveloppe calibrée, éventuellement nullable.
 * Tout le reste — `z.number()`, un type `number`, un objet maison — est une
 * probabilité NUE.
 */
const CALIBRATED_ENVELOPE =
  /^\s*(?:calibratedProbabilitySchema|CalibratedProbability)\b(?:\.nullable\(\)|\s*\|\s*null)?\s*,?\s*$/

function isCalibratedEnvelope(declaredValue: string): boolean {
  return CALIBRATED_ENVELOPE.test(declaredValue)
}

type ContractOccurrence = { key: string; file: string; value: string }

function contractOccurrences(): readonly ContractOccurrence[] {
  const found: ContractOccurrence[] = []
  for (const path of walk(CONTRACT_SCHEMAS)) {
    if (path.endsWith('.test.ts')) continue
    const source = stripComments(readFileSync(path, 'utf8'))
    for (const [, key, value] of source.matchAll(CONTRACT_KEY)) {
      found.push({ key: key as string, file: path.slice(path.indexOf('packages')), value: value ?? '' })
    }
  }
  return found
}

function contractKeys(occurrences: readonly ContractOccurrence[]): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  for (const { key, file } of occurrences) if (!found.has(key)) found.set(key, file)
  return found
}

/** L'offense d'une clé de contrat — `null` si elle est légitime OU calibrée. */
function contractOffence(occurrence: ContractOccurrence): string | null {
  const offence = probabilityOffence(occurrence.key)
  if (offence === null) return null
  return isCalibratedEnvelope(occurrence.value) ? null : `${offence}, valeur NUE (${occurrence.value.trim()})`
}

describe('GA-64 — aucune probabilité persistée, aucune probabilité NUE exposée', () => {
  const migrations = migrationIdentifiers()
  const columns = entityColumns()
  const occurrences = contractOccurrences()
  const keys = contractKeys(occurrences)

  it('lit un corpus non vide, sur les trois côtés', () => {
    // Une garde qui ne lit rien est verte pour toujours. Chaque témoin est un
    // nom qui EXISTE aujourd'hui : si un extracteur se casse, ceci tombe.
    expect(migrations.has('project_needs')).toBe(true)
    expect(migrations.size).toBeGreaterThan(500)
    expect(columns.has('created_at')).toBe(true)
    expect(columns.size).toBeGreaterThan(200)
    expect(keys.has('provenance')).toBe(true)
    expect(keys.size).toBeGreaterThan(500)
  })

  it('lit bien le mot « probability » — et le laisse passer', () => {
    // Le témoin qui prouve que la garde vise le SENS et pas le mot :
    // `planRiskSchema.probability` est dans le corpus, et la garde est verte.
    expect(keys.has('probability')).toBe(true)
    expect(probabilityOffence('probability')).toBeNull()
  })

  it('aucune migration n’écrit une probabilité', () => {
    const offenders = [...migrations]
      .map(([identifier, file]) => {
        const offence = probabilityOffence(identifier)
        return offence ? `${file} : ${identifier} — ${offence}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(offenders.sort()).toEqual([])
  })

  it('aucune entité ne persiste une probabilité', () => {
    const offenders = [...columns]
      .map(([name, table]) => {
        const offence = probabilityOffence(name)
        return offence ? `${table}.${name} — ${offence}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(offenders.sort()).toEqual([])
  })

  it('aucun contrat n’expose une probabilité NUE — seule l’enveloppe calibrée passe', () => {
    const offenders = occurrences
      .map(occurrence => {
        const offence = contractOffence(occurrence)
        return offence ? `${occurrence.file} : ${occurrence.key} — ${offence}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(offenders.sort()).toEqual([])
  })

  describe('#4016 L1 (11/10/2026) — la probabilité CALIBRÉE passe, la NUE ne passe pas', () => {
    it('lit la probabilité de signature du CA probable — et la laisse passer parce qu’elle est calibrée', () => {
      // Témoin RÉEL : sans lui, une garde qui ne lirait plus rien serait verte.
      const real = occurrences.find(o => o.key === 'closing_probability')
      expect(real?.file).toBe('packages/contracts/src/schemas/deal-probability.ts')
      expect(probabilityOffence('closing_probability')).not.toBeNull()
      expect(contractOffence(real as ContractOccurrence)).toBeNull()
    })

    it('SAIT DIRE NON — le même nom, porté par un nombre, est refusé', () => {
      for (const value of [
        ' z.number().min(0).max(1),',
        ' number',
        ' z.number().nullable(),',
        ' closingProbabilitySchema,',
        ' z.object({ value: z.number() }),',
      ]) {
        expect(contractOffence({ key: 'closing_probability', file: 'x', value })).not.toBeNull()
      }
      expect(contractOffence({ key: 'closing_chance', file: 'x', value: ' z.number(),' })).not.toBeNull()
      expect(contractOffence({ key: 'weighted_forecast', file: 'x', value: ' z.number().int(),' })).not.toBeNull()
    })

    it('accepte l’enveloppe, nullable ou non', () => {
      for (const value of [
        ' calibratedProbabilitySchema,',
        ' calibratedProbabilitySchema.nullable(),',
        ' CalibratedProbability',
        ' CalibratedProbability | null',
      ]) {
        expect(contractOffence({ key: 'win_probability', file: 'x', value })).toBeNull()
      }
    })

    it('l’enveloppe a des DENTS — elle refuse elle-même un chiffre nu', () => {
      // Une exception de nom ne vaut que si la valeur permise refuse ce que
      // l'ancienne règle refusait. Sinon la garde serait contournée par un type.
      expect(calibratedProbabilitySchema.safeParse(0.72).success).toBe(false)
      expect(calibratedProbabilitySchema.safeParse({ method: 'beta_binomial_stage_v1', value: 0.72 }).success).toBe(
        false,
      )
    })
  })

  it('la garde sait dire NON — les treize formes de la même demande', () => {
    // Les noms exacts des six refus, plus leurs renommages plausibles.
    for (const forbidden of [
      'closing_chance', // pdf2.md:373, la demande d'origine
      'closing_chance_axes', // sa colonne jsonb compagne
      'closingChance',
      'win_probability',
      'winProbability',
      'probabilite_closing',
      'chance_de_signature',
      'deal_odds',
      'signature_likelihood',
      'weighted_forecast',
      'montant_pondere',
      'pipeline_pondere',
      'p_win',
    ]) {
      expect(`${forbidden} → ${probabilityOffence(forbidden) !== null}`).toBe(`${forbidden} → true`)
    }
  })

  it('la garde n’interdit PAS ce qui est légitime', () => {
    // Une garde qui interdit trop est un défaut au même titre qu'une garde
    // borgne. Chacun de ces noms EXISTE dans le dépôt et doit rester possible.
    for (const allowed of [
      'probability', // vraisemblance d'un RISQUE, trois paliers qualitatifs
      'win_rate', // taux mesuré sur des affaires closes
      'rfp_win_rate',
      'submission_win_rate',
      'submissionWinRate',
      'weekly_forecast', // le nom d'une routine
      'weight', // poids d'un axe de score
      'axis_weight',
      'weighted_score', // un score pondéré n'est pas un euro pondéré
      'confidence',
      'closed_at',
      'close_reason',
      'lead_score',
      'score_axes',
      'deal_amount',
    ]) {
      expect(`${allowed} → ${probabilityOffence(allowed)}`).toBe(`${allowed} → null`)
    }
  })
})
