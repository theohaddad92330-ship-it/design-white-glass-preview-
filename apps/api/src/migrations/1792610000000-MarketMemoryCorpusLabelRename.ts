import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1603.3 — `parcours-observes` → `bellum_market_memory_v1`, AVEC SA REPRISE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI MAINTENANT, ET PAS AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le point demandait `bellum_market_memory_v1` comme nom de source canonique.
 * Il avait été refusé DEUX fois, et le refus était juste : renommer la
 * constante sans reprendre l'existant aurait coupé le corpus en deux. Cette
 * colonne n'a qu'UN usage — savoir d'où vient une ligne — et deux étiquettes
 * pour un même corpus détruisent exactement ce pour quoi elle existe.
 *
 * Louis a tranché le 11/09/2026 : « oui migration ». La valeur change donc, et
 * les lignes déjà écrites la suivent dans la MÊME migration. C'est la seule
 * forme qui ne laisse jamais deux corpus coexister.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA REPRISE TOUCHE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre tables portent `corpus_label` (`text NOT NULL`) :
 * `market_company_signal`, `market_esn_client`, `market_company_stack`,
 * `market_ex_esn_at_client`. ~60 067 lignes au total en production.
 *
 * La valeur est COMPOSÉE : `parcours-observes@<version> (<début>..<fin>)`
 * (`buildCorpusLabel`). On ne remplace donc que le PRÉFIXE, et on garde la
 * version et la période — elles sont l'information d'audit, et les perdre
 * coûterait plus cher que le renommage ne rapporte.
 *
 * ⚠️ `substring` sur le préfixe, PAS `replace()`. Un `replace()` global
 * changerait aussi une occurrence au milieu de la chaîne ; ici seule la tête
 * doit bouger, et une reprise qui touche plus que sa cible ne se défait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENTE, ET QUI S'ADDITIONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le `WHERE ... LIKE 'parcours-observes%'` ne matche plus rien après le premier
 * passage : rejouer la migration ne réécrit rien. Chaque table affiche son
 * compte AVANT, ses lignes MODIFIÉES et ses lignes INCHANGÉES, et les trois
 * s'additionnent — aucun nombre n'est déduit par soustraction, c'est la règle
 * du dépôt et elle vaut particulièrement ici, où le total est le seul moyen de
 * savoir si la reprise a été complète.
 *
 * ⚠️ AUCUNE CONTRAINTE À ÉLARGIR. `corpus_label` ne porte aucun `CHECK` —
 * vérifié sur les quatre migrations qui la créent. La règle « la contrainte
 * s'élargit AVANT le code qui écrit la valeur » (GA-11/GA-12) n'a donc rien à
 * faire ici, et ce n'est pas un oubli : c'est une colonne d'audit libre.
 *
 * `down()` fait le chemin inverse, exactement, et reste idempotent lui aussi.
 */
const TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
] as const

const ANCIEN = 'parcours-observes'
const NOUVEAU = 'bellum_market_memory_v1'

async function renamePrefix(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
  for (const table of TABLES) {
    const [{ total }] = (await queryRunner.query(`SELECT count(*)::int AS total FROM ${table}`)) as [{ total: number }]
    const [{ cibles }] = (await queryRunner.query(
      // La MÊME condition que l'UPDATE ci-dessous, au caractère près : un
      // compteur qui compte autre chose que ce qui est écrit rend un rapport
      // faux et rassurant.
      `SELECT count(*)::int AS cibles FROM ${table} WHERE left(corpus_label, length($1)) = $1`,
      [from],
    )) as [{ cibles: number }]

    // ⚠️ `substring(col FROM $n)` avec un PARAMÈTRE de position oblige Postgres à
    // inférer le type de `$n` dans une position où il ne le peut pas toujours :
    // selon le pilote, il reçoit une chaîne et la fonction ne résout pas. Un
    // échec ici ne casse pas seulement la reprise — il empêche le service de
    // DÉMARRER, et l'ancien conteneur reste servi sans que rien ne dise pourquoi.
    //
    // `left()` + `right()` n'ont aucune ambiguïté de type, et `length($1)` est
    // calculé par Postgres lui-même : la longueur du préfixe n'a plus à voyager
    // comme paramètre. Le résultat est identique, la surface d'échec est nulle.
    await queryRunner.query(
      `UPDATE ${table}
          SET corpus_label = $1 || right(corpus_label, length(corpus_label) - length($2))
        WHERE left(corpus_label, length($2)) = $2`,
      [to, from],
    )

    // Les trois nombres s'additionnent : total = modifiées + inchangées.
    // Écrit dans la sortie de migration pour que la reprise soit VÉRIFIABLE
    // après coup, et pas seulement supposée.
    // eslint-disable-next-line no-console
    console.log(`[#1603.3] ${table} — total ${total} · modifiées ${cibles} · inchangées ${total - cibles}`)
  }
}

export class MarketMemoryCorpusLabelRename1792610000000 implements MigrationInterface {
  name = 'MarketMemoryCorpusLabelRename1792610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await renamePrefix(queryRunner, ANCIEN, NOUVEAU)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await renamePrefix(queryRunner, NOUVEAU, ANCIEN)
  }
}
