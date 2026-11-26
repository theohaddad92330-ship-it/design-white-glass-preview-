"""#1611.4 / #1611.5 — CE QUE LE PLAN ET LES MESSAGES ONT LE DROIT DE SAVOIR DE
LA MÉMOIRE MARCHÉ, ET RIEN DE PLUS.

LE DÉFAUT CORRIGÉ
------------------
``bellum_plan.py`` et ``bellum_messages.py`` ne lisaient nulle part la mémoire
marché — `ReinforcedAnglesCard.tsx` (#1611.1/.2/.3) l'affiche déjà sur l'écran,
mais c'est un composant STATIQUE : les deux vrais générateurs du dossier
n'avaient aucun accès à ce signal.

LE CHOIX QUI TIENT L'INTERDIT DU RETOUR (« la mémoire marché n'entre JAMAIS
dans le contenu d'un message »)
------------------------------------------------------------------------------
Le retour distingue « choisir l'angle » de « devenir le contenu ». La façon la
plus sûre de tenir cette distinction n'est pas une consigne de prompt — un
modèle peut l'oublier — c'est de ne JAMAIS transmettre au prompt un fait de
mémoire marché à proprement parler (un nom de société de services, un compte de
parcours, une famille de rôles). Ce module réduit la lecture de la mémoire
marché à UNE seule sortie : la liste des expertises DÉCLARÉES par l'ESN
elle-même (``profile['offers']`` / ``esn_profiles.expertise_areas``) qui
recoupent l'environnement technique OBSERVÉ du compte.

Un message qui ne reçoit que ["Data & Intelligence Artificielle"] ne PEUT pas
écrire « 39 freelances Java sont passés chez vous » : cette phrase n'existe nulle
part dans ce qui lui a été transmis. Retirer le MOYEN, pas seulement la
permission.

⚠️ CE FICHIER EST UN MIROIR
----------------------------
La source de vérité de l'appariement est
``packages/contracts/src/schemas/market-expertise-match.ts``
(``expertiseTokens`` / ``matchingExpertises``), déjà consommée telle quelle côté
web par ``ReinforcedAnglesCard.tsx``. ``packages/contracts`` n'est pas dans
l'image déployée du service IA (même raison que ``focus_weights.py``), d'où
cette copie. ``tests/test_market_memory_angle.py`` compare la liste des mots
vides ligne à ligne avec le fichier TypeScript : une divergence fait échouer la
CI et NOMME le mot fautif.
"""

from __future__ import annotations

import re
import unicodedata

#: MIROIR de `EMPTY_TOKENS` (`market-expertise-match.ts`). Une liste NOMMÉE,
#: jamais un filtre par longueur — un filtre par longueur jetterait `C#` et `Go`,
#: qui sont des technologies, pour attraper `et`/`de`, qui sont des mots.
EMPTY_TOKENS: frozenset[str] = frozenset(
    {
        "et",
        "de",
        "du",
        "la",
        "le",
        "les",
        "des",
        "aux",
        "ou",
        "en",
        "un",
        "une",
        "par",
        "pour",
        "avec",
        "dans",
        "sur",
        "and",
        "the",
        "for",
        "with",
        "it",
    }
)

#: MIROIR de `MIN_TOKEN_LENGTH`.
_MIN_TOKEN_LENGTH = 2

#: MIROIR de la classe de découpage de `expertiseTokens` (`[^a-z0-9+#]+`).
_TOKEN_SPLIT = re.compile(r"[^a-z0-9+#]+")


def label_of(value: object) -> str | None:
    """Le libellé d'une entrée de `profile['offers']`, ou `None`.

    ⚠️ **`profile_data` est un dictionnaire LIBRE, pas un contrat.** Le chemin
    `esnAnswersToProfileData` rend bien `offers: string[]`, mais ce n'est pas le
    seul producteur : un profil enregistré plus tôt peut porter des OBJETS. Une
    analyse de production est tombée exactement là — `normalize() argument 2
    must be str, not dict` en phase `plan`, un dossier perdu pour un signal
    d'enrichissement.

    Une entrée qui ne porte aucun libellé lisible est IGNORÉE, jamais devinée et
    jamais convertie en `str(...)` : un `{'id': 3}` rendu « {'id': 3} » entrerait
    dans l'appariement comme un mot, et cette expertise-là n'a pas été déclarée.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("label", "name", "title", "offer", "value"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
    return None


def expertise_tokens(label: object) -> frozenset[str]:
    """MIROIR de `expertiseTokens` — plie un libellé en jetons comparables.

    NFD + retrait des diacritiques, comme côté TS : « Sécurité » et « Securite »
    sont le même mot, et le corpus n'est pas normalisé de la même façon que la
    saisie.

    Accepte `object` et non `str` : voir `label_of`. Ce qui n'a pas de libellé
    rend `frozenset()` — « aucun jeton », donc aucun rapprochement, jamais une
    erreur.
    """
    text = label_of(label)
    if text is None:
        return frozenset()
    folded = unicodedata.normalize("NFD", text)
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn").lower()
    tokens = {token for token in _TOKEN_SPLIT.split(folded) if len(token) >= _MIN_TOKEN_LENGTH and token not in EMPTY_TOKENS}
    return frozenset(tokens)


def matching_expertises(observed: list[object], expertises: list[object]) -> list[str]:
    """MIROIR de `matchingExpertises` — les expertises DÉCLARÉES qui recoupent la
    pile OBSERVÉE, dans l'ordre où l'ESN les a déclarées.

    Sans pile observée ou sans expertise déclarée, la question ne se pose pas :
    rend `[]`, jamais « toutes » — un `[]` ici veut dire « rien à renforcer »,
    pas « aucune corroboration marché disponible ».
    """
    if not expertises or not observed:
        return []

    observed_tokens: set[str] = set()
    for label in observed:
        observed_tokens |= expertise_tokens(label)
    if not observed_tokens:
        return []

    # La sortie ne porte que des LIBELLÉS — jamais l'objet d'origine, qui
    # traverserait jusqu'au prompt sous une forme que personne n'a écrite.
    matched: list[str] = []
    for expertise in expertises:
        text = label_of(expertise)
        if text is None:
            continue
        if expertise_tokens(text) & observed_tokens:
            matched.append(text)
    return matched


def reinforced_expertises(observed_stack: list[object] | None, offers: list[object] | None) -> list[str]:
    """LA seule fonction que `bellum_plan.py` / `bellum_messages.py` appellent.

    ``observed_stack`` est `AccountMarketContext.observed_stack` (mémoire
    marché) ; ``offers`` est le profil ESN déjà transmis au pipeline
    (``profile['offers']`` — la même donnée que ``expertise_areas`` côté
    questionnaire, voir ``esnAnswersToProfileData``). La sortie ne porte QUE des
    libellés que l'ESN a elle-même écrits : aucun fait de mémoire marché ne la
    traverse.
    """
    return matching_expertises(list(observed_stack or []), list(offers or []))
