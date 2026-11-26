# Recherche du texte source exact — #3009 (#2314, cold account bottom-up playbook)

Base : `feat/epopees-3009-2796-25-09` (origin/main du 25/09), suite à #3009 « texte source
exact à fournir avant tout code ». Sources cherchées dans le dossier local gitignoré
`agent_docs/sources/` (recopie locale des documents du Drive de Louis), par CHEMIN ABSOLU.

## Périmètre

Les 25 points listés par #3009 : #2314.2 #2314.3 #2314.4 #2314.6 #2314.12 #2314.13 #2314.14
#2314.15 #2314.16 #2314.17 #2314.19 #2314.20 #2314.21 #2314.22 #2314.23 #2314.24 #2314.25
#2314.26 #2314.27 #2314.28 #2314.29 #2314.30 #2314.31 #2314.32 #2314.38 (registre source :
`.claude/notes/registre-2026-09-17-lau-055-2314.md`).

## Patron déjà en place dans le dépôt (pour mémoire)

`git grep -n "Théo\|annexe" -- apps packages` : le dépôt cite déjà l'annexe méthodologie et
l'annexe organigramme des dizaines de fois (`account.entity.ts:90`, `accounts.service.ts:333`,
`analysis-ondemand.service.ts:204`, migrations diverses…), toujours de la même façon — un
commentaire qui cite le FICHIER + la PAGE/section, jamais un extrait reformulé. C'est le patron
à suivre : recopier VERBATIM depuis la source, avec sa référence, jamais deviner.

## Sources lues

- `BELLUMAI_ANNEXE_METHODOLOGIE_SALES_ESN_2026-07-21.pdf` → converti par `pdftotext -layout`
  (901 lignes). Contient p.12-13 « OUVRIR UN COMPTE » : le tableau des stratégies d'ouverture
  (bottom-up / middle-out / top-down / sandwich / rang 2 / prospection inversée / public) et le
  tableau des profils de contact (Board, C-level, N-1 budget, N-2 manager, Expert, Achats, RH,
  hors scope). C'est la source de ce qui est DÉJÀ marqué « déjà là » dans le registre (2314.7,
  2314.8, 2314.9, 2314.11, 2314.18, 2314.34) — hors périmètre des 25 points bloqués.
- `BELLUMAI_ANNEXE_ORGANIGRAMME_ACCOUNT_MAPPING_2026-07-21.pdf` → converti (835 lignes). Même
  résultat : chemins bottom-up génériques (N-2→N-1→achats/sponsor), rien de sectoriel.
- `agent_docs/sources/dossier-26-aout/` (PDF-18_La-methode-commerciale.txt et les autres .txt).
- `agent_docs/sources/BELLUMAI_ITERATION_3_01/…/repo_mirrors/*.md`,
  `BELLUMAI_ITERATION_3_03/…` (Laura/copilot), `BELLUMAI_ITERATION_3_05/…` (accessibilité/scoring),
  `BELLUMAI_ITERATION_3_09/…/repo_historical_mirrors/*.md`.
- `BELLUMAI_JUNE_2026_RECOVERY_AND_CODE_GAPS_2026-08-24/08_RAG_AND_KNOWLEDGE_DELTA/
  commercial_method_delta.md` (delta de connaissance commerciale — mentionne « top-down et
  bottom-up doivent fonctionner en parallèle », rien de sectoriel).

## Recherches ciblées (grep -ni), résultat NÉGATIF sur tous les fichiers ci-dessus

`bottom-up`, `cold account`, `LAU-FINAL-055`, `première porte`, `fallback`, `cyber`,
`environnement`, `automobile`, `pharma`, `infrastructure`, `ingénierie`, `conseil métier`,
`DRSE`, `RSE`, `CIO`, `méthodes usine`, `opérationnel`/`manager`/`achats` (comme trio de
personas nommées).

## Constat

Le texte qui décrit précisément ce que #2314 demande — les 9 routes sectorielles (Cyber, Data,
ingénierie, industrie, environnement, automobile, pharma, infrastructure, conseil métier), les
questions par persona (OPÉRATIONNEL / MANAGER / ACHATS), la liste « PREMIER OBJECTIF » (bon
périmètre / bon owner / réalité du besoin / recours externe / timing / voie d'achat / personne
suivante) et les deux anti-patterns (DRSE sur un sujet d'autorisation de site, CIO sur un sujet
de méthodes usine) — **n'existe QUE dans le corps de l'issue #2314** (retour transmis le
15/09/2026, catégorie « metier », citation en bloc `>`), **jamais dans l'annexe méthodologie ni
l'annexe organigramme**, ni dans aucun autre document local de `agent_docs/sources/`.

C'est précisément la distinction que fait #3009 : le patron du dépôt est de recopier depuis
**l'annexe** (un document de référence stable, daté, paginé), pas depuis un retour bêta déjà
condensé — un retour en pointe-forme, sans page ni section, ne permet pas de vérifier qu'il
reprend le texte ORIGINAL de Théo mot pour mot plutôt qu'un résumé de Louis. Fabriquer les 7
routes sectorielles manquantes (seuls 2 exemples anti-patterns sur 9 sont donnés) inventerait
une règle non vérifiable.

## Conclusion

**Aucun des 25 points n'est livrable en l'état.** L'annexe complète mentionnée par #3009 comme
débloquant n'est pas dans `agent_docs/sources/` (recherche exhaustive ci-dessus, négative). Le
registre `.claude/notes/registre-2026-09-17-lau-055-2314.md` garde ses lignes et son état
inchangés (aucune cellule d'état modifiée par cette note). #3009 reste ouverte, dans l'attente
du document annexe complet de Théo (Drive de Louis, pas encore recopié localement pour cette
partie).
