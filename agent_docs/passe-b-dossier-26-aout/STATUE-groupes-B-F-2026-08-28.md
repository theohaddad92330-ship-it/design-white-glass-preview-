# Statuage des groupes B et F — 28/08/2026

> Preuve n°2 du certificat. **99 + 183 = 282 lignes, 0 sans statut.**
> Groupe B : `À VÉRIFIER` **0 %**. Groupe F : **1,1 %**, deux items bornés et nommés.

| groupe            | lignes | LIVRÉ | ABSENT | NON PORTEUR | REFUSÉ | PÉRIMÉ | NON PROUVÉ | DOUBLON | À VÉRIFIER |
| ----------------- | -----: | ----: | -----: | ----------: | -----: | -----: | ---------: | ------: | ---------: |
| **B** (PDF-04→06) |     99 |    43 |     49 |           1 |      1 |      1 |      **3** |       1 |      **0** |
| **F** (PDF-18→22) |    183 |    67 |     31 |      **53** | **20** |      9 |      **0** |       1 |          2 |

Couverture vérifiée par script dans les deux cas : ids uniques, **zéro double, zéro manquant**.

---

## 1. Le constat du groupe F : 29 % de backlog fantôme

**53 des 183 lignes ne sont PAS des exigences produit.** Et la concentration est nette : **PDF-20, le document de positionnement et de mise sur le marché, est du backlog fantôme à 19/27.**

Un script de démonstration, un deck en 12 planches, les 12 objections et leurs réponses, la médiane de cycle de vente, les 7 métriques GTM, les signaux d'arrêt d'acquisition : **du matériel de vente inventorié comme des trous de produit**. Il n'en sort que **trois exigences produit réelles** (F103, F104, F107) et quatre interdits.

Rapporté aux autres groupes, la progression est parlante — **D : 3 % · A : 10,3 % · F : 29 %.** Plus le document est stratégique, plus il inventorie des choses qui ne se codent pas.

## 2. Et 20 `REFUSÉ` — un cinquième des « trous » sont des décisions

Sur le groupe F, **20 lignes sont refusées par doctrine, pas absentes par oubli** : l'affacturage et la cession de créance (le produit s'arrête à « prêt à facturer »), le contrôle d'identité réglementaire d'un fournisseur, le domaine complet des notes de frais, la paie et la comptabilité, « Envoyer la facture » en bouton principal, le score unique « 92 % », « +35 % de précision », « paiements effectués 0,4 % », l'état « conflit », le cercle en orange, le mot « Organisations », les cinq formulations abandonnées.

⚠️ **Plusieurs sont tenus PAR ABSENCE, et c'est fragile** : `affacturage` rend zéro, donc l'interdit tient — jusqu'au jour où quelqu'un l'écrit. C'est exactement ce que le registre de doctrine existe pour empêcher, et c'est pourquoi quinze de ces refus y ont été inscrits le même jour (`c29`→`c43`).

---

## 3. ⚠️ Deux violations de doctrine VIVANTES, trouvées en statuant

### F183 — des courbes INVENTÉES à côté de chiffres vrais

`apps/web/src/features/dashboard/lib/sparklines.ts:8-10` exporte **deux séries fabriquées à la main** (`SPARKLINE_UP`, `SPARKLINE_FLAT`), rendues par `KpiRow.tsx:32,46,55` **à côté de chiffres réels**. Le fichier l'assume en commentaire — « décoratif pur » — mais un commentaire ne protège personne : à l'écran, une courbe montante à côté d'un chiffre vrai **se lit comme la tendance de ce chiffre**.

C'est l'interdit le plus dur du dépôt (« JAMAIS de donnée fictive »), et c'est aussi ce que F56 et F176 refusent explicitement dans le même document. **Un lot le traite.**

### F100 — une formulation explicitement abandonnée, en production

« **Copilote commercial IA** » est l'une des cinq formulations que le positionnement abandonne, et elle vit à `apps/website/src/features/chatbot/lib/public-kb.ts:51`. Elle heurte aussi la règle de nommage : « Laura » est un NOM, « copilote » le nom commun de la CATÉGORIE. **Même lot.**

---

## 4. Ce que la re-confrontation a corrigé dans `VERIFIE-groupes-A-F.md`

**Les dix `NON PROUVÉ` du groupe F ont TOUS basculé — il n'en reste zéro.** Sept sont branchés depuis (dont `METHOD_RULES` et la porte d'ingestion, fermés le 27/08 dans cette même session), deux sont périmés, un est en réalité `ABSENT`.

Trois défauts de la table, dont deux inédits :

| Défaut                                            | Détail                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`F84` n'a JAMAIS été statué**                   | La plage `F70, F76, F79, F81–F83, F85–F95` **saute F84**. C'est le seul trou de couverture du fichier — et l'item décrit par la source comme « le SEUL levier qui déplace la courbe » du coût unitaire (cache + routage, −45 %). Statué **ABSENT** : le seul hit est une intention en commentaire |
| **`F104` est compté DEUX FOIS**, en contradiction | `LIVRÉ` en table **et** dans la plage `ABSENT F98–F124`. Collision inédite, en plus de `F17` déjà connue                                                                                                                                                                                          |
| **`F167` est apparié au MAUVAIS intitulé**        | La ligne « ontologie fait→projet→opportunité » décrit un autre fichier. Le vrai F167 est `ABSENT`                                                                                                                                                                                                 |

### ⚠️ Une consigne que j'avais donnée était FAUSSE, et la mesure l'a dit

J'avais écrit à l'agent que « les comptes annoncés dans les plages ne correspondent pas au nombre d'identifiants réels ». **C'est vrai sur le groupe A, faux sur le groupe F** : ses sept plages se déplient **exactement** au nombre annoncé (13, 21, 12, 17, 27, 8, 28).

L'agent l'a mesuré et me l'a contredit, chiffres à l'appui. C'est le comportement attendu — et c'est aussi un rappel que **mes propres briefs vieillissent comme les tables qu'ils décrivent.**

---

## 5. Le groupe B : trois `NON PROUVÉ`, dont un inédit

- **`useTalentRetention`** (`talent-api.ts:128`) — un aller-retour serveur complet, RGPD compris (`previewPurge`, `dueNow`), que **zéro composant ne monte**. Ni la table ni la passe indépendante ne l'avaient. **Prise nouvelle.**
- **`resolveChannel` côté encaissement** — un seul appelant, le circuit relevé. `resolveChannelForContact` est un **homonyme local**, pas le contrat.
- **Les scores risque/opportunité côté web** — la méthode client et sa clé de cache existent, sans hook ni composant.

**Deux preuves de la table étaient fausses sans que le verdict le soit** (même défaut que C-22) : l'absence de `dormant` (104 fichiers en réalité — mais comme état de contexte, pas comme statut) et celle de `portage` (19 fichiers — mais comme contrat consultant, pas comme canal de mission). **Le verdict tient, la preuve non.**

### La péremption, mesurée par groupe

L'agent a contredit le taux annoncé, avec ses chiffres : sur les 50 `ABSENT` du groupe B, **3 seulement ont changé (6 %)**, pas 28 %. En revanche les **`NON PROUVÉ` ont fondu à 60 %** et **100 % des `À VÉRIFIER` ont bougé**.

⇒ **Ce n'est pas « les tables vieillissent de 28 % ». C'est : les `ABSENT` sont stables (6 à 15 %), les `NON PROUVÉ` s'effondrent (60 %), et un `À VÉRIFIER` n'est pas un statut — il bouge toujours.**

---

## 6. Le dernier trou de la preuve n°2, déclaré

`passeB-groupe-B.md` porte **15 « rapprochements incertains » identifiés `A` → `O`** (l.156-171). Ils ne sont statués **nulle part** : les tables reconstruites les déclarent « hors périmètre », et aucun statuage du 28/08 ne les couvre. Ils sont passés entre les mailles de tous les filtres, qui cherchaient `^\| *[0-9]+`.

Trois touchent la facturation et le vivier — « factures entrantes », « refus de payer un sous-traitant », « compteur de marge brute non mesurable ». **Un lot les statue.** Tant qu'ils ne le sont pas, la preuve n°2 ne peut pas être signée.
