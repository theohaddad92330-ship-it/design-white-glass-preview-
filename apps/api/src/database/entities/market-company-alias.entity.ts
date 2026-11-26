import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1756 — LE RÉCEPTACLE D'ALIAS de la mémoire marché, PARTAGÉ comme ses quatre sœurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE EXISTE POUR RENDRE RÉPARABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corpus est indexé sur SON libellé, le registre sur la raison sociale.
 * `marketMatchKey` normalise la casse, les accents et douze mots de structure —
 * pas un préfixe, pas un mot inséré. Mesuré en production le 08/09/2026 :
 * « SG SOCIETE GENERALE » normalise en `sg societe generale` et ne rencontre
 * jamais `societe generale`, ses 267 parcours observés compris. Le
 * rapprochement rend zéro, et zéro ressemble à « pas de donnée ».
 *
 * ⚠️ Il n'existe AUCUN identifiant stable des deux côtés — c'est écrit trois
 * fois dans ce dépôt (`market-company-resolution.ts`, `market-memory.service.ts`,
 * `packages/contracts/src/schemas/companies.ts`) : pas de SIREN, pas
 * d'identifiant de registre, pas de LinkedIn, et pas de site web côté
 * suggestion. Cette table ne fabrique donc pas un identifiant : elle enregistre
 * un rapprochement DÉCIDÉ AILLEURS, pour qu'il n'ait pas à être deviné à la
 * lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PORTE PAS, EXPRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Aucun `workspace_id`.** Un rapprochement entre une raison sociale et une
 *   entreprise du corpus est un fait de MARCHÉ, identique pour tous les espaces
 *   — même raison que `market_company_signal` (GA-16). Elle ne porte donc
 *   aucune donnée d'espace, et rien de ce qu'un espace pense d'un compte.
 * · **Aucune clé étrangère vers `market_company_signal`.** Le corpus est
 *   RÉIMPORTÉ ; une contrainte référentielle ferait échouer un import qui fait
 *   disparaître une clé, et une cascade DÉTRUIRAIT l'alias — or on archive, on
 *   ne supprime pas. Un alias qui vise une entreprise absente du corpus ne
 *   désigne simplement rien à la lecture, et c'est la bonne réponse.
 * · **Aucune contrainte `CHECK` sur `source`.** Le vocabulaire des sources
 *   d'alias n'est pas tranché — QUI remplit cette table est une décision
 *   produit en attente (le pack de données, ou le registre). Une contrainte
 *   posée maintenant refuserait la valeur de la décision qui n'est pas prise.
 *
 * ⚠️ **Aucun écrivain dans ce lot, et c'est voulu.** Ce lot construit le
 * réceptacle et le chemin de lecture, qui sont neutres aux deux options. Table
 * vide ⇒ le rapprochement rend exactement ce qu'il rendait avant.
 */
@Entity({ name: 'market_company_alias' })
export class MarketCompanyAliasEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /**
   * L'alias passé par NOTRE normalisation (`marketAliasKey`) — la clé cherchée.
   *
   * ⚠️ Index NON unique, à dessein : deux lignes peuvent viser deux entreprises
   * différentes. Une base qui refuserait de le stocker forcerait l'ingestion à
   * choisir, donc à trancher au hasard une ambiguïté — exactement ce que #1617 a
   * corrigé un cran plus bas. C'est la LECTURE qui refuse de départager.
   */
  @Index()
  @Column({ name: 'alias_key', type: 'text' })
  aliasKey!: string

  /**
   * L'alias tel qu'il a été écrit, avant normalisation — colonne d'AUDIT.
   *
   * Même statut que `corpus_label` sur `market_company_signal` : elle existe
   * pour qu'un opérateur sache d'où vient une ligne quand il ouvre la table.
   * Aucune lecture produit ne la rend.
   */
  @Column({ name: 'alias_label', type: 'text' })
  aliasLabel!: string

  /** La clé canonique visée — celle de `market_company_signal.company_key`. */
  @Column({ name: 'company_key', type: 'text' })
  companyKey!: string

  /**
   * D'où vient ce rapprochement — colonne d'AUDIT, comme `alias_label`.
   *
   * Elle existe pour que la décision « qui remplit cette table » soit
   * ENREGISTRÉE le jour où elle se prend, plutôt que reconstituée après coup.
   */
  @Column({ type: 'text' })
  source!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
