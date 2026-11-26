# Rapport — #4749 organigramme vide ET muet (branche claude/l-organigramme-4749)

**Pourquoi `entityId` est null** (lu dans le code) : graines = résolution JAMAIS tentée (`"entityId": None` en dur,
org_graph_assembler.py ~1437), tentable seulement si la graine porte `entity` ; vague enrichie = tentée par nom
d'entité exact, null = aucune correspondance. Sans donnée : rattachement inconnu NOMMÉ, la personne n'est pas perdue.
**Écran (fix(web))** : `unplacedOrgSummary` + `OrgUnplacedNotice` — « Personnes connues : N · non rattachées : M » et
la raison (aucun rattachement hiérarchique établi, rien deviné). Posée quand `buildFocalOrgView` rend null
(Hiérarchie et Focale) ou quand des personnes du graphe n'ont aucune entité. « Non enrichis » atteignable sans
direction focale, plafond 12 + « +N de plus » inchangé. Jamais « 0 », probabilité, nom ou critère protégé lu.
**IA (fix(ia))** : une graine qui nomme une entité connue (nom exact) y est rattachée ; sinon `entityId` None.
**Tests (données synthétiques)** : HierarchyOrgView.unplaced.test.tsx (5, 2 rouges d'abord pour `return null`),
FocalOrgView.test.tsx (+2), négatifs (aucun contact / contacts non fournis), #4679 (contact CRM placé dans l'arbre).
Vitest ciblé organigramme+gardes : 50 fichiers, 729 verts ; tsc web 0 `error TS`, exit 0.
pytest -k org : 511 verts (+2, 1 rouge d'abord) ; ruff propre.
**Reste** : DÉMO (règle 9) NON faite — un dossier « contacts, aucun plaçable » exige un nouveau dossier dans
demo-dataset.ts (nombreuses specs de comptage) ; non classé « vide à dessein » pour contourner. Aucune clé
raw_analysis neuve, donc aucune garde demo-coverage rouge. À confirmer : les graines de prod portent-elles `entity` ?
Sinon le compte D reste non rattaché côté IA (l'écran le dit). Env : dist de packages/\* bâtis localement (gitignorés).
