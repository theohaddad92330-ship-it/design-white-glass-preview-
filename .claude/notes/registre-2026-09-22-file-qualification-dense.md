base : d57706d7a — 22/09/2026

| # | demande | écran/sujet | mesuré au code | état | preuve en recette |
|---|---------|-------------|-----------------|------|--------------------|
| #2708.1 | borner la HAUTEUR de la ligne « Pistes à qualifier » sans perdre l'info | QualificationLeadsQueue.tsx | `lead.label` (span `text-sm font-medium`, ligne ~296) rendait le texte intégral d'un signal (~400 car.) sans `line-clamp` ; GA-63 (98c1c189b) avait déjà corrigé la LARGEUR (650→1195px), pas la hauteur. Posé : `line-clamp-2` + `title={lead.label}` (QualificationLeadsQueue.tsx:294-311). | recetté | ÉCRAN prod 23/09 (17d967788) — /accounts/8ea17309-dd66-412b-a4d5-fdbdc7612cda?tab=veille (onglet Opportunités, sous-onglet Signaux, section « À regarder en premier ») : carte 1 « L'activité omnicanale… » : `-webkit-line-clamp:2`, clientHeight=40px vs scrollHeight=200px (texte réel ~470 caractères) ; contrôle décisif : clamp neutralisé →  |
| #2708.2 | traiter le JUMEAU « 12 projets » (même page, mesuré 197px) | TabProjects.tsx | `row.label` (TableCell, ligne ~287) même défaut, aucun `line-clamp`. Posé : `line-clamp-2` + `title={row.label}` (TabProjects.tsx:285-301). | recetté | ÉCRAN prod 23/09 (17d967788) — /accounts/8ea17309-dd66-412b-a4d5-fdbdc7612cda?tab=veille (onglet Opportunités, sous-onglet Signaux, section « À regarder en premier ») : carte 1 « L'activité omnicanale… » : `-webkit-line-clamp:2`, clientHeight=40px vs scrollHeight=200px (texte réel ~470 caractères) ; contrôle décisif : clamp neutralisé →  |
| #2708.3 | poser la garde qui empêche le retour | apps/web/src/architecture/un-texte-libre-dans-une-ligne-dense-porte-une-borne-de-lignes.test.ts | GA-385 (réservé après scan de `origin/main` + 47 branches du 22/09, plus haut trouvé GA-382). Registre `FREE_TEXT_IN_DENSE_ROWS` (2 sites), vérifie `line-clamp-\d+` ET `title={<champ>}` sur la balise. Vérifiée rouge en RETIRANT réellement `line-clamp-2` de TabProjects.tsx (pas seulement le témoin synthétique) : 1 test rouge nommant le fichier ; remis en place → 5/5 verts. | recetté | ÉCRAN prod 23/09 (17d967788) — /accounts/8ea17309-dd66-412b-a4d5-fdbdc7612cda?tab=veille (onglet Opportunités, sous-onglet Signaux, section « À regarder en premier ») : carte 1 « L'activité omnicanale… » : `-webkit-line-clamp:2`, clientHeight=40px vs scrollHeight=200px (texte réel ~470 caractères) ; contrôle décisif : clamp neutralisé →  |
| #2708.4 | parité démo — le cas « besoin détecté, paragraphe long » doit exister | apps/api/src/modules/demo/demo-dataset.ts (`detectedSignals`), demo-coverage.ts (`DEMO_QUALIFICATION_LEADS_COVERAGE`) | 5ᵉ signal ajouté (~420 caractères, isolé — pas de `primary_domain_code`, pour ne pas changer le compte de convergence recompté par `demo-qualification-leads-coverage.spec.ts`). Classification mise à jour (raison nommée, pas un commentaire creux). | recetté | ÉCRAN prod 23/09 (17d967788) — /accounts/8ea17309-dd66-412b-a4d5-fdbdc7612cda?tab=veille (onglet Opportunités, sous-onglet Signaux, section « À regarder en premier ») : carte 1 « L'activité omnicanale… » : `-webkit-line-clamp:2`, clientHeight=40px vs scrollHeight=200px (texte réel ~470 caractères) ; contrôle décisif : clamp neutralisé →  |

## Antériorité — GA-63 (commit 98c1c189b) NE REVIENT PAS

GA-63 a retiré à raison le `max-w-70ch` que `index.css` posait par erreur sur le `<li>` de
`QualificationLeadsQueue.tsx` (il ne portait ni `flex` ni `justify-between`). Ce correctif
élargit la ligne de 650 à 1195px et TIENT — rien n'y est repris dans ce lot. Le défaut de
#2708/#2692 restant est un AUTRE défaut, sur le MÊME écran, révélé seulement parce que le
premier a été corrigé : `lead.label`/`row.label` n'ont eux-mêmes aucune borne de LONGUEUR,
et rien ne bornait leur HAUTEUR de rendu. Les deux corrections coexistent, elles ne
s'annulent pas — documenté en tête du commentaire à l'endroit du comportement
(QualificationLeadsQueue.tsx) et dans le docblock de la garde GA-385.

## Ce que la garde GA-385 NE SAIT PAS voir

jsdom ne met rien en page (`getBoundingClientRect` y rend 0 partout) : aucun test unitaire
ne peut voir qu'une ligne fait 145px ou 65px. La garde interdit donc la COMBINAISON
(champ libre + balise sans `line-clamp-`), jamais un pixel. La preuve que la hauteur a
réellement changé reste une mesure ÉCRAN, à faire en recette sur
`/accounts/8ea17309-dd66-412b-a4d5-fdbdc7612cda?tab=projects`.

## Famille identifiée, NON traitée (hors mesure, hors scope de ce lot)

D'autres `break-words` sans `line-clamp` existent sur des champs potentiellement libres :
`apps/web/src/features/accounts/view/account-detail/tabs/plan/{PlanNextMoves,
PlanSalesContext,ReverseProspectsSection,AggregatedTrajectoriesSection}.tsx` et
`apps/web/src/features/missions/view/MissionsTable.tsx`. Aucun n'a été mesuré en prod pour
ce lot (contrairement aux deux ci-dessus) : ne pas les traiter à l'aveugle. À qualifier
dans un lot dédié, avec sa propre mesure écran.
