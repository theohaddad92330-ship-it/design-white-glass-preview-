# Registre — LOT DC — le numéro d'un contact se trouve ou se dit (#2598)

base : af59a79bd — 18/09/2026
branche : `fix/le-numero-dun-contact-se-trouve-ou-se-dit-18-09`
Source : retour bêta in-app (Louis, `/contacts/9e4d46e2-b4da-461e-88b6-a48564e75bf4`, 18/09/2026 06:36)
Compte : 6 demandes — 2 livré · 2 retenu · 2 déjà là

## Mesure — ce qui existe déjà (avant de coder quoi que ce soit)

Le fil d'actions de l'issue montre : compte → onglet Personnes → contact →
« Compléter les infos manquantes » → « Enrichir (1 crédit) » → toast → « Voir
la fiche » → `/contacts/…` → clic sur « Non renseigné ». Un crédit a donc déjà
été dépensé AVANT la capture, et le téléphone restait absent.

`packages/contracts/src/schemas/contact-enrichment.ts:4-8` documente déjà EN
CODE le fait constaté : « Apollo remplit l'email mais ni le téléphone ni le
LinkedIn » — un problème de PROD connu, pas une invention. Le mécanisme
d'idempotence (`missingEnrichmentChannels`, `enrichmentCooldown`) existe déjà
et évite de refacturer un clic qui ne rapporterait rien — mais rien de tout ça
n'est DIT à l'écran : `ContactKeyInfo.tsx:100-101` (`InfoRow`) rend `null` dès
que `value` est vide, et la ligne « disponible — enrichir pour révéler »
(`phoneAvailable`/`emailAvailable`, `:199-201`) s'éteint elle-même dès qu'une
tentative a eu lieu (`enrichmentAttempted`, volontairement — test existant
`ContactKeyInfo.test.tsx:28-42`, « le silence est la réponse »). Résultat
mesuré : après une tentative ratée, la ligne téléphone ne dit RIEN — ni
« non renseigné », ni « non trouvé », ni ce qu'il faudrait pour l'avoir. C'est
la lecture la plus probable du « j'ai l'impression que j'ai jamais le
numéro » : l'écran ne CONFIRME jamais que la recherche a eu lieu et a échoué.

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2598.1 | confirmer : bug d'affichage ou limite connue fournisseur | web:contacts | `contact-enrichment.ts:4-8` documente déjà EN CODE que le fournisseur ne renvoie souvent aucun numéro — ce n'est pas un bug de calcul, c'est un fournisseur qui n'a pas la donnée | recetté | VÉRIF CODE 20/09 sur origin/main 501526d63 : contact-enrichment.ts:1-17 + :130-136 (missingEnrichmentChannels) + :155-169 (enrichmentCooldown) ← RENDU par ContactKeyInfo.tsx:209-213/250 (channelNotFound/channelNotFoundUntil, fr+en contacts.json:440-441) ; aussi ContactChannelMenu.tsx:61, ContactEngagementTrigger.tsx:37, ContactHeader.tsx:45 |
| 2598.2 | l'écran dit « non trouvé » au lieu de se taire | web:contacts | `ContactKeyInfo.tsx` : `InfoRow` rend `null` sur valeur vide (`:28`, `:100-101`) et `phoneAvailable`/`emailAvailable` s'éteignent après tentative (`:199-201`) — aucun état de repli n'existait pour « cherché, pas trouvé » | recetté | CODE `92d9cc378` : nouvelle `NotFoundRow` (`ContactKeyInfo.tsx`) rendue quand `!contact.phone \&\& enrichmentAttempted` (symétrique email) — jamais de remplacement par un « 0 » ou une valeur devinée (GA-18/19). FR/EN `contacts.json` (clés `keyInfo.channelNotFound`/`channelNotFoundUntil`) + changelog FR/EN (`2026-09-18-le-numero-dit-non-trouve`). Appelant : `ContactDetail.tsx:84` (déjà monté, inchangé). Test : `ContactKeyInfo.test.tsx` describe `#2598 un canal cherché et non trouvé se DIT`, 4 tests — `pnpm --filter @bellum/web exec vitest run src/features/contacts/view/contact-detail/components/ContactKeyInfo.test.tsx` : 18/18 verts. ‖ RECETTE ÉCRAN PRODUCTION 18/09/2026 (espace Louis, `6771c0206`), fiche d'un contact THALES après un enrichissement RÉEL — PROUVÉ : le champ téléphone affiche « Non trouvé par nos fournisseurs — à ajouter à la main si tu le connais ». C'est bien « cherché, non trouvé » et non « jamais cherché » : toute la distinction que ce point corrige. |
| 2598.3 | dit jusqu'à quand un nouvel essai a du sens | web:contacts | `enrichmentCooldown()` était déjà calculé ailleurs (`ContactHeader.tsx:45`, `ContactChannelMenu.tsx:61`) mais jamais lu par `ContactKeyInfo` | recetté | CODE `92d9cc378` : `ContactKeyInfo` importe `enrichmentCooldown`, affiche la date de réessai quand actif (même formule que `ContactChannelMenu.tsx` : `toLocaleDateString(i18n.language)`), sinon le message générique — jamais de date inventée quand `last_enrichment_result !== 'no_new_data'`. Test : 2 cas dans le même describe (cooldown actif / `matched` malgré canal manquant) — 18/18 verts (même run que 2598.2). ‖ RECETTE ÉCRAN PRODUCTION 18/09/2026 (espace Louis, `6771c0206`), même fiche, second essai immédiat — PROUVÉ : « Non trouvé — nouvel essai possible à partir du 18/10/2026 ». La date de réessai est affichée, et l'idempotence a bien bloqué le second débit (solde inchangé). |
| 2598.4 | fiche : bouton « corriger » invisible sans survol, rien tactile | web:contacts | `EditableField.tsx:107` : le crayon est `opacity-0 group-hover:opacity-100` — sur un écran tactile (pas de hover), rien ne signale que le champ est corrigeable. Pattern PARTAGÉ par tous les champs de toutes les fiches (contact, compte, mission…), pas spécifique au téléphone | recetté | RECETTÉ CODE 24/09 nuit (audit du passé) sur main 16dbc3ae2e — EditableField.tsx:126 min-h-11 min-w-11 (affordance permanente, plus d'opacity-0/group-hover) ← ContactRecordCard.tsx et AccountRecordCard.tsx:43-112, tous deux déjà dans les chaînes de route confirmées (2150.60 / 2318.7) | ‖ ⚠️ 21/09/2026 — la mention « NON EN PROD » de cette ligne est PÉRIMÉE : le commit cité est ancêtre de PROD `5483e3631` (`git merge-base --is-ancestor`). Le code EST servi ; ce point est RECETTABLE. L'état ne change pas pour autant — il lui manque sa preuve, pas son déploiement.
| 2598.5 | ce contact précis a-t-il un numéro caché ailleurs | web:contacts | Le contact cité (`9e4d46e2-b4da-461e-88b6-a48564e75bf4`) est une donnée de PRODUCTION réelle — aucun accès Postgres/Supabase réel depuis ce worktree (pas de docker, pas de credentials) pour vérifier `raw_data`/`apollo_enrichment.phone_numbers` sur cette fiche précise | recetté | Ne peut pas se mesurer depuis cet environnement. QUESTION produit, voir rapport. ‖ RECETTE ÉCRAN 18/09/2026 au soir, production `23e7bfc6c` (API sur `/version` ; web Vercel « Production – bellum-web » en succès sur ce commit), espace réel de Louis — `/contacts/9e4d46e2-…` : téléphone VIDE (« Non trouvé — nouvel essai possible à partir du 18/10/2026 ») ; aucun numéro ailleurs sur la fiche (Rôle & périmètre, Activité, menu « Contacter » : canaux e-mail / message / tâche seulement) ; « Déjà enrichi le 18/09/2026 — rien de plus trouvé ». Réponse à la question : NON, aucun numéro caché ailleurs ; l'écran dit honnêtement qu'aucun n'a été trouvé et quand réessayer. Aucune valeur recopiée. |
| 2598.6 | crédit déjà débité, pas de sur-facturation vérifiée | web:contacts, api:contacts | `contacts.service.ts` : `no_new_data` déclenche un remboursement (`credit: 'not_debited'`/`'refunded'`, `:1687`, `:1813`), `matched` débite (`credits_debited`, `:2172`) — le cycle crédit ne semble pas en cause dans le ressenti « payé pour rien » | recetté | VÉRIF CODE 20/09 sur origin/main 501526d63 : contrat 3 états contacts.service.ts:225, cooldown vers not_debited :1744-1754, débit réel :2239 ; testé contacts.service.spec.ts:1666/1671/1691. Les lignes citées au registre (218-221/1677-1687/2172) étaient FAUSSES — corrigées ici |

## Démo — parité (craft rule n°9)

Aucune nouvelle colonne : 2598.2/2598.3 lisent `phone`/`email`/`last_enrichment_at`/
`last_enrichment_result`/`last_enrichment_missing`, déjà classées « le clic
Enrichir les renseigne, en démo comme en réel » dans
`DEMO_CONTACT_ENRICHMENT_COLUMNS` (`apps/api/src/modules/demo/demo-coverage.ts:1901-1929`).
`enrichContactInDemo` (`contacts.service.ts:2280-2384`) pose déjà
`last_enrichment_at`/`last_enrichment_result: 'matched'` au clic « Enrichir »,
et `demoEnrichment` rend TOUJOURS `phone: null` (politique du 17/08 — jamais de
coordonnée inventée sur une société fictive). La nouvelle ligne « non trouvé »
est donc SEEDÉE au sens du mécanisme existant : atteignable en cliquant
« Enrichir » sur n'importe quel contact de démo dont le téléphone est encore
vide, sans code ni classification supplémentaire. Non vérifié à l'écran
(pas d'accès navigateur dans ce lot) — recette ÉCRAN à faire séparément si
besoin de preuve visuelle.
