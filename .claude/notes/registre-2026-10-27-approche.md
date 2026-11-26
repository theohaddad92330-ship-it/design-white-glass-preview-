# Registre — lot APPROCHE (vague L, 27/10/2026)

| Point | État | Preuve en recette (geste à l'écran en production) |
| --- | --- | --- |
| #4521.1 compte + contact en liens | **livré** (cause trouvée : `planMailContext` ne rattachait que par `owner_name` ; les 88 étapes en base ont `contact_id` NULL ET souvent pas de responsable) | `/actions` › Traiter : carte « Muriel Kumpflen (DG) » → le nom est un lien vers `/contacts/…`. Chaîne : `listOpenForUser` (`action-plan-items.service.ts`) → `MyPlanAction.contact_id` → `todayQueue.ts:413` → `TodayCard.tsx` `WhoLine` ← `BurstPanel.tsx:247` |
| #4521.3 bouton « Générer le mail » | **livré** par le même champ (`planMail.ts:15` exige `contactId`) | la carte e-mail affiche « Générer le mail » ; un seul `POST /ia/message` au clic |
| #4521.4 récap destinataires | **livré** par le même champ (`burst.ts:173`) | le bandeau ne dit plus « 96 sans destinataire nommé » pour les cartes dont le nom est cité |
| #4521 cartes sans nom cité et ≥2 contacts | **reformulé** : rien de deviné, la carte reste « sans destinataire » (honnête) ; le rattrapage d'écriture (`internal/admin/plan-item-contact-backfill`) reste un geste d'opérateur | carte « Envoyer un email J1 au DG » : pas de lien, comptée sans destinataire |
| #4521.2 date du signal | **déjà là** | `TodayCard.tsx` `SignalLine` : aucune parenthèse sans date |
| #4521.5 « Fait » ≠ envoi | **déjà là** | `TodayCard.tsx:532` infobulle `doneHint` |
| #4525 Appel en onglet | **déjà là** | `$id_.approach.$channel.tsx` → `ApproachPage.tsx:135` `CallApproachBody` ; route `approach/call` supprimée (`approach-call-route.test.ts`) |
| #4524 « Sur quoi Laura s'appuie » | **déjà là** | `ApproachPage.tsx:417` et `CallApproachBody.tsx:193` `ApproachGroundingBlock` ; démo : `demo-approach-grounding.spec.ts` |
| #4543 inconnues du brief | **déjà là** | `AccountBrief.tsx:74` ← route `accounts/$id_.brief.tsx:15` ; `brief-unknowns.ts` nomme « aucun concurrent » ; repli = « non renseigné » |
