# Lot 89 — Signaux · P1 (#4716) : le miroir TypeScript lit les mois en toutes lettres

Périmètre : packages/contracts/src/schemas/account.ts, apps/ia/app/services/signal_freshness.py

## Antériorité

- #4647 (fermé 27/10) a corrigé la moitié Python (`read_signal_date`, b7fc35a2). Ce lot corrige l'autre : `signalDateMs`
  (account.ts), lu par `isSignalArchived`, les digests quotidien/hebdo, `recent-signals-reader`, `accountProvenance`.
- Garde #4647 (règle d'ancrage : « 2024 (comptes déposés 2025-11) » → 2024), garde 0e4d70595c (jour borné au mois réel),
  #3206 / #3240 (fraîcheur temporelle) : on les tient.

## Diagnostic

Même regex qu'avant #4647 : mois/jour lus seulement collés à l'année. « 23 octobre 2026 » → 2026-01-01. Jumeau dans la
même fonction : « 2023-2024 » lu mois 20 → août 2024 (la regex prend `20` pour un mois) ; mois 13 / jour 31 d'un mois
court débordaient sur le mois suivant (Python borne).

## Ce que fait le lot

- `signalDateMs` lit les douze mois français (complets/abrégés, accents, casse, point), jour optionnel, ancrés sur la
  PREMIÈRE année ; plage d'années → année de fin ; mois borné 1-12, jour borné au dernier jour réel.
- Commentaire croisé dans les deux fichiers (TS ↔ `signal_freshness.py`).
- Tests : douze mois, deux formats numériques, ancrage, plage, undated.

## Ce que le lot NE fait PAS

- Ne change pas la convention TS « début de période » (année seule → 1er janvier, mois seul → 1er du mois) : le Python
  prend la FIN (31/12). Écart documenté, pas aligné ici : il déplacerait les fenêtres du digest sur tout le parc →
  question à Louis si on veut l'aligner.
- Ne lit pas les mois anglais (Python non plus, « à mesurer », #4647). Ne touche pas `parseSignalDate` (affichage).

## Décisions touchées (nommées)

- garde #4537, garde #4544 : seule la ligne d'import de `account.signals.test.ts` change (on y ajoute `signalDateMs`) ; l'intégration II n'est pas défaite.
