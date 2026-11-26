# Archive 04 — intégrations, qualité de la donnée, RAG, sécurité, infra

> Source : `BELLUMAI_ITERATION_3_04_INTEGRATIONS_DATA_QUALITY_RAG_SECURITY_INFRA_2026-08-24.zip`
> (382 652 octets, 23 fichiers au manifeste — **23 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, après `00`, `08`, `01`, `02` et `03`.

Deux sources, toutes deux déjà closes : **PDF 7** (intégrations et connecteurs,
21/08) et **Tome 2** (la donnée, sources, pipeline, 23/08). Plus quatre
inventaires de code et deux fichiers de racine.

---

## 1. Le fichier qui aurait produit 564 tickets, et zéro défaut

`code_evidence/missing_relative_imports.json` porte **564 entrées** de la forme
`["packages/char/src/char.test.ts", "./char.js"]`. Lu tel quel, c'est une liste
de 564 imports cassés.

**Il n'y en a aucun.** Vérifié par script, en résolvant chaque import contre le
disque :

| Mesure                                           | Valeur                          |
| ------------------------------------------------ | ------------------------------- |
| Entrées totales                                  | 564                             |
| Imports en `.js` (convention NodeNext)           | **562**                         |
| Résolus vers un `.ts` / `.tsx` / `index.ts` réel | **562**                         |
| Réellement introuvables                          | **2**                           |
| … et les deux sont des CONTRE-EXEMPLES délibérés | `esm-import-extensions.test.ts` |

En TypeScript configuré `module: NodeNext`, un fichier `char.ts` s'importe
`./char.js` — l'extension est celle de la SORTIE, pas de la source. Un script qui
teste l'existence du chemin littéral rend donc un faux positif par import, sur
tout le dépôt.

Les deux « restants » sont dans `packages/contracts/src/esm-import-extensions.test.ts`,
c'est-à-dire **le test qui garde précisément cette convention** : il cite
`from './workspace'` comme « l'exemple qui a cassé la production ». L'outil a
signalé la garde comme un défaut.

> **564 sur 564.** C'est la même famille que les comptes faux des trackers, mais
> venue de l'autre côté : un artefact produit par analyse statique, publié sans
> avoir été confronté au dépôt. Publier ce fichier comme backlog aurait créé
> 564 tickets fantômes — et occupé quelqu'un plusieurs jours à les refermer.

### Le fichier vide qui se lit « rien »

`code_evidence/migrations.txt` fait **0 octet**. Le dépôt porte **269**
migrations. L'extraction a échoué en silence, et un lecteur pressé y lit « pas de
migrations ». Même mécanique que le CSV d'inventaire de l'archive 00 : une
absence produite par l'outillage se lit comme une absence dans le produit.

---

## 2. Le tome 2, section par section

Trois sections du tome n'ont **aucune trace** dans son tracker
(`tome2-donnee-sources-pipeline-2026-08-21.md`) : §12 « Le format d'une fiche
source », §21 « Le même compte, cinq niveaux », §27 « Les 8 tests de garde de la
donnée ».

Appliquant la règle établie à l'archive 03 — **un écart de couverture ne devient
un ticket qu'après lecture du code** — les deux plus importantes ont été
mesurées.

### §27 — les huit gardes de la donnée existent, sous d'autres noms

| Garde du tome                                                             | Ce qui la porte dans le dépôt                                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GD-01` une portée absente produit un 503 NOMMÉ, jamais un tableau vide   | **GA-10** — `apps/api/src/architecture/qualified-empty-lists.spec.ts`                                             |
| `GD-02` toute valeur affichée porte sa source et sa date                  | `packages/contracts/src/schemas/provenance.ts` + la primitive `Provenance.tsx` + `crm-core/provenance.service.ts` |
| `GD-03` aucune donnée expirée présentée comme actuelle                    | les demi-vies d'`access_facts` (« information du 12 mars, à revérifier »), `reopens_on`, le decay du RAG          |
| `GD-04` aucun nom de fournisseur d'enrichissement dans une réponse client | `test_copilote_prompt_blocks.py` + `tool-capability-digest.spec.ts`                                               |
| `GD-05` aucun pourcentage de probabilité produit par une source           | **`c26_probabilite`**, ajoutée au registre de doctrine hier soir en croisant l'archive 02 — voir ci-dessous       |
| `GD-06` l'identité d'un espace contributeur n'est jamais exposée          | `community-facts.ts` — « l'origine d'une déclaration ne sort JAMAIS d'ici »                                       |
| `GD-07` le seuil de 3 espaces avant agrégation                            | `COMMUNITY_THRESHOLD = 3`, dans le contrat et nulle part ailleurs                                                 |
| `GD-08` chaque source déclare son comportement de panne                   | `apps/ia/app/services/source_registry.py` — la seule des huit que le tracker nommait                              |

**Huit sur huit.** Le tracker n'en citait qu'une ; le dépôt les porte toutes.

### §21 — les cinq niveaux, et la convergence avec `c26`

Le tome pose une échelle : **1 Fait · 2 Observation · 3 Inférence · 4 Hypothèse ·
5 Spéculation**, et déclare le niveau 5 **interdit**, avec pour exemple littéral
« 78 % de chances ».

C'est mot pour mot ce que `c26_probabilite` encode depuis hier — trouvée par un
autre chemin (le §7.7 du PDF 2 qui REDEMANDAIT le score de chance de closing).
Deux documents distincts, deux croisements distincts, la même règle. C'est le
meilleur argument possible pour qu'elle soit au registre.

Le niveau 3 exige un **badge « déduit »** : il existe
(`accountDetail.json:469` — « déduit · confiance {{confidence}}/100 » ;
`accountOrg.json:182` — « Pointillé : lien inféré — jamais présenté comme une
certitude »).

### §12 — le format d'une fiche source : **3 champs sur 7**

Le tome en demande sept : « ce qu'elle donne, sa **fraîcheur**, son **coût**, ses
limites, son **usage actuel**, son **usage sous-exploité**, et ce qui casse si
elle tombe ».

`SourceDeclaration` (`source_registry.py:36`) en porte trois : `level` (le régime
de collecte, qui tient lieu de « limites »), `behaviour` (le mode de panne) et
`loses` — « ce que l'utilisateur perd quand elle tombe », en français et concret,
parce que ce texte s'affiche.

Manquent : **fraîcheur**, **coût**, **usage actuel** et **usage sous-exploité**.
Le dernier est le plus intéressant du lot — c'est le champ qui dirait ce qu'une
source pourrait donner et ne donne pas. Non livré : le remplir pour seize sources
demande des mesures (fraîcheur réelle, coût unitaire) que seul un opérateur a, et
les inventer produirait exactement le chiffre de remplissage que le produit
s'interdit.

---

## 3. Les quatre résolutions du README

| Résolution                                                | Verdict                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connected` ≠ `read_verified` ≠ `write_verified`          | **TENUE** — c'est `c15` du registre de doctrine, et `deriveCapabilityState` + les sondes `connector_capability_probes` la portent depuis le PDF 7      |
| « La provenance / fraîcheur est obligatoire »             | **TENUE** — `GD-02` et `GD-03` ci-dessus                                                                                                               |
| « Aucun secret ni contenu confidentiel dans logs/traces » | **TENUE** — Langfuse ne capture aucun contenu par défaut (`LANGFUSE_CAPTURE_CONTENT` en opt-in), et `environment`/`release` ajoutés hier n'en sont pas |
| « Pas d'automation LinkedIn non autorisée »               | **TENUE** — `c24_linkedin` : le scraping est refusé, le commercial DÉCLARE ses interactions                                                            |

---

## 4. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                                      | Raison                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ouvrir des tickets depuis `missing_relative_imports.json` | 564 faux positifs sur 564. L'artefact est décrit ici pour que personne ne le rouvre en croyant y trouver du travail.                                                                                                                                |
| Refaire l'extraction de `migrations.txt`                  | C'est un artefact de l'archive, pas du dépôt. Le dépôt a ses 269 migrations et sa garde GA-36.                                                                                                                                                      |
| Mesurer le §12 du tome 2                                  | Non lu, donc **non mesuré** — dit tel quel plutôt que supposé couvert.                                                                                                                                                                              |
| Les « SLO, repair flows et audit writes » du README       | `repair` existe (`GET /tools/:provider/repair`, PDF 7) et l'écriture CRM gouvernée journalise déjà. Les SLO supposent une mesure de disponibilité par connecteur que le produit ne fait pas — et un SLO annoncé sans mesure est un chiffre inventé. |
