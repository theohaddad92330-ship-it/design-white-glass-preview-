"""#1956.21 — garde de SORTIE : PII non autorisée, sur la famille d'outils dont
le CORPUS est PARTAGÉ entre tous les espaces (GA-16) et qui promet déjà,
STRUCTURELLEMENT, de n'exposer AUCUNE identité de personne (voir
`search_market_memory` — #1961.23, « aucune PII » ; sa forme rendue ne porte
que `company_name`, jamais un nom de personne).

CE QUE CE MODULE N'EST PAS : un filtre PII général sur toute réponse du chat.
`get_account_contacts`, `get_account_briefing` et le reste des outils qui
lisent le PORTEFEUILLE de l'appelant ont pour RAISON D'ÊTRE de rendre de vrais
e-mails et téléphones de contacts — les masquer casserait le produit. La
garde ne touche donc QUE les outils listés dans `_SHARED_CORPUS_TOOLS`, où la
présence d'un e-mail, d'un téléphone ou d'une URL de profil PERSONNEL serait
déjà, par construction, un BUG (une fuite d'identité dans un corpus qui n'en
porte structurellement pas — #2287.29).

Avant ce lot : rien ne vérifiait cette promesse à la VALEUR — seule la forme
du schéma (quels CHAMPS existent) en tenait lieu. Un champ mal projeté par un
connecteur futur aurait pu y glisser un e-mail sans qu'aucun test ne le voie.
Défense en profondeur, pas un remplacement des tests de forme existants
(`test_search_market_memory_tool.py::test_no_personal_identity_leaks...`).

Les motifs réutilisent ceux déjà vérifiés pour le masquage télémétrie
Langfuse (`langfuse_client.py`, `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md:28-30`)
plutôt que d'en écrire une troisième version qui diverge avec le temps.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.langfuse_client import _EMAIL_RE, _PHONE_RE

_EMAIL_MASK = "[email masqué]"
_PHONE_MASK = "[téléphone masqué]"
_URL_MASK = "[URL personnelle masquée]"

#: #2287.29 — la seule forme d'URL PERSONNELLE que ce corpus pourrait un jour
#: porter : un profil LinkedIn (`/in/…`). Volontairement ÉTROIT, même doctrine
#: que `_PHONE_RE` dans `langfuse_client.py` : une page ENTREPRISE
#: (`linkedin.com/company/…`) reste un fait sur le marché, jamais une identité
#: — elle ne doit jamais être masquée, sous peine d'effacer un fait légitime.
_PERSONAL_PROFILE_URL_RE = re.compile(
    r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?",
    re.IGNORECASE,
)

#: Les outils dont le corpus est PARTAGÉ entre espaces et qui ne portent,
#: par construction, aucune identité de personne — jamais un outil qui lit
#: le portefeuille de l'appelant (`get_account_contacts`…).
SHARED_CORPUS_TOOLS = frozenset(
    {
        "search_market_memory",
        "search_partners",
        "get_territory_overview",
        "get_esn_on_account",
    }
)


def _redact_detecting_leak(value: Any) -> tuple[Any, bool]:
    """Comme `_redact`, mais rend AUSSI si quelque chose a été substitué —
    c'est-à-dire si une identité de personne a réellement fuité (#2879,
    #2442.15, lot V36 28/09/2026)."""
    if isinstance(value, dict):
        leaked = False
        out: dict[Any, Any] = {}
        for key, val in value.items():
            new_val, sub_leaked = _redact_detecting_leak(val)
            out[key] = new_val
            leaked = leaked or sub_leaked
        return out, leaked
    if isinstance(value, list):
        leaked = False
        out_list: list[Any] = []
        for item in value:
            new_item, sub_leaked = _redact_detecting_leak(item)
            out_list.append(new_item)
            leaked = leaked or sub_leaked
        return out_list, leaked
    if isinstance(value, str):
        redacted, n_email = _EMAIL_RE.subn(_EMAIL_MASK, value)
        redacted, n_phone = _PHONE_RE.subn(_PHONE_MASK, redacted)
        redacted, n_url = _PERSONAL_PROFILE_URL_RE.subn(_URL_MASK, redacted)
        return redacted, (n_email + n_phone + n_url) > 0
    return value, False


def _redact(value: Any) -> Any:
    return _redact_detecting_leak(value)[0]


def guard_shared_corpus_pii(tool_name: str, result: Any) -> Any:
    """Redige tout e-mail, téléphone ou URL de profil personnel trouvé dans le
    résultat d'un outil de `SHARED_CORPUS_TOOLS` — jamais pour les autres, où
    ces valeurs sont légitimes (contacts du portefeuille)."""
    if tool_name not in SHARED_CORPUS_TOOLS:
        return result
    return _redact(result)


def guard_shared_corpus_pii_reporting_leak(tool_name: str, result: Any) -> tuple[Any, bool]:
    """Comme `guard_shared_corpus_pii`, mais rend AUSSI si une fuite a été
    détectée et corrigée — #2879 (#2442.15, lot V36 28/09/2026), la onzième
    condition d'alerte encore sans détecteur : une identité de personne dans
    un corpus qui promet structurellement de n'en porter aucune n'est jamais
    un cas normal, donc jamais un simple correctif silencieux.

    Seul appelant réel : `chat_tools.execute_chat_tool`, qui écrit
    `security_events.kind = 'leak_detected'` (via `record_leak_detected`)
    quand ce second élément est vrai."""
    if tool_name not in SHARED_CORPUS_TOOLS:
        return result, False
    return _redact_detecting_leak(result)
