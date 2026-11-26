# Registre — le libellé ment (#2693, #2697)

base : d57706d7a — 22/09/2026
branche : fix/libelles-incoherents-22-09

⚠️ Correction en vol (voir rapport) : #2693 et #2697 étaient DÉJÀ écrits, sur
`origin/fix/trois-defauts-nommes-22-09` (déjà pris dans `integration-vague-14-22-09`),
au moment où ce lot a démarré — pas vu au brief initial. Aucune des deux
implémentations n'est donc de moi ; ce registre ne consigne le détail QUE des
deux points que j'ai réellement livrés (le balayage de famille et ses deux
gardes).

| # | Demande | Écran/sujet | Mesuré au code | État | Preuve en recette |
|---|---|---|---|---|---|
| #2693 | Le champ « Étape de départ » affiche une clé i18n brute au lieu de son libellé | `/accounts` → Opportunités → Signaux → Qualifier maintenant → Convertir en opportunité | `QualificationLeadsQueue.tsx:686` lit maintenant `DEFAULT_STAGE_LABELS[candidate][lang]` (`@bellum/contracts`, la même source que `PipelineSlaView.tsx`) au lieu de `t(\`stages.${candidate}\`)`, qui collisionnait avec le namespace du funnel de pistes. | **déjà là** — `fix/trois-defauts-nommes-22-09`, commit `2322de565` | CODE — `QualificationLeadsQueue.convert.test.tsx` (5/5 sur cette branche). À recetter en ÉCRAN une fois `integration-vague-14-22-09` en prod. |
| #2697 | Le même état de disponibilité (`derived: 'unknown'`) portait deux libellés — « À revalider » (vue rapide + pool) et « À confirmer » (badge, chip de filtre avancé, export CSV) | `/consultants` — `TalentFilters.tsx`, `TalentPoolView.tsx` | `views.to_revalidate` / `pool.segments.to_revalidate` retirés des catalogues FR+EN ; `TalentFilters.tsx` et `TalentPoolView.tsx` lisent `staffing.unknown` pour cette valeur ; `enum-keys.test.ts` exempte `to_revalidate` des deux entrées concernées, avec sa raison en commentaire. | **déjà là** — `fix/trois-defauts-nommes-22-09`, commit `1606645d6` | CODE — `TalentFilters.test.tsx` + `TalentPoolView.test.tsx` (un cas rouge→vert chacun, vert sur cette branche). À recetter en ÉCRAN une fois en prod. |
| #2693/#2697.G1 | Balayage de famille — clé i18n dynamique rendue comme du texte, ailleurs dans le dépôt | Toute l'app, FR + EN, appels `t(\`préfixe.${x}\`)` | Garde `apps/web/src/architecture/une-cle-i18n-dynamique-ne-resout-jamais-un-objet.test.ts` (GA-383) : refuse tout template dont l'interpolation est la clé FINALE et dont le préfixe résout, en FR OU EN, vers un namespace où TOUS les enfants existants sont des objets. Corpus complet balayé (>400 fichiers, >10 appels dynamiques recensés) : **un seul historique, celui de #2693, allowlisté explicitement le temps que l'intégration atteigne `main`** — aucun autre jumeau vivant. | **livré** | CODE — 5/5 sur `une-cle-i18n-dynamique-ne-resout-jamais-un-objet.test.ts`. Preuve qu'elle rougit : test « sait dire NON » (coupable factice nommé) + le call site réel de #2693, non retiré de main au moment de l'écriture, EST cet allowlisted (donc prouvé détecté, sans quoi l'allowlist serait un no-op — vérifié en le retirant temporairement : le test « aucune clé dynamique… » rougit alors en nommant `QualificationLeadsQueue.tsx → fr:projects:stages` / `en:...`). |
| #2693/#2697.G2 | Balayage de famille — un même état de disponibilité redéfini à plusieurs endroits, ailleurs que to_revalidate/unknown | `/consultants` — `TALENT_VIEWS` (vivier) × `TALENT_POOL_SEGMENTS` (pool) | Garde `apps/web/src/architecture/un-etat-ne-porte-pas-deux-libelles.test.ts` (GA-384) : tout nom PARTAGÉ entre les deux tableaux d'énumération (`dormant`, `to_revalidate`, `never_submitted` aujourd'hui) doit porter le MÊME mot en `views.*` et `pool.segments.*`, FR et EN. Balayage réel : les trois noms partagés concordent déjà (`dormant`="Dormants"/"Dormants", `never_submitted`="Jamais positionnés"/"Jamais positionnés", `to_revalidate`="À revalider"/"À revalider" — cohérents ENTRE EUX avant même le correctif de #2697, qui divergeait d'un TROISIÈME namespace, `staffing.unknown`, hors du périmètre structurel que cette garde peut verrouiller sans arbitrage produit — voir le commentaire du fichier). Aucun autre jumeau structurel trouvé. | **livré** | CODE — 4/4 sur `un-etat-ne-porte-pas-deux-libelles.test.ts`. Preuve qu'elle rougit : test « sait dire NON » (fixture synthétique nommée) + plantage réel sur `pool.segments.dormant` (FR, `"Dormants (pool)"`) → rouge nommant `fr:consultants:views.dormant ("Dormants") ≠ pool.segments.dormant ("Dormants (pool)")`, restauré aussitôt. |

## QUESTIONS
- Aucune sur ce lot : le choix du mot pour #2697 (« À confirmer ») a déjà été
  arbitré par Louis dans `1606645d6`, cohérent avec mon analyse indépendante
  avant de découvrir la duplication de travail.
- GA-384 ne verrouille PAS l'alias vue/badge (`views.to_revalidate` ↔
  `staffing.unknown`) : c'est un arbitrage produit (`on_bench`/`staffing.available`
  diffèrent À DESSEIN, même mécanique), pas une forme structurelle détectable
  sans faux positif. Assumé et documenté dans le fichier de la garde.
