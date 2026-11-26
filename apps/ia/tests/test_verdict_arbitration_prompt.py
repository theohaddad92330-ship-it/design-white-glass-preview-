"""#1924 — QUATRE GABARITS « VERDICT » DANS LE MÊME PROMPT, AUCUN ARBITRAGE.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT, MESURÉ EN PRODUCTION LE 14/09/2026
─────────────────────────────────────────────────────────────────────────────
Question posée telle quelle dans `/chat` : « Est-ce que je peux placer un expert
cybersécurité chez THALES ? Réponds par un verdict net. »

Deux symptômes, une cause :
  1. la réponse sort en TEXTE sectionné — aucune carte `verdict` dans le DOM,
     alors que la chaîne d'émission est intacte (la consigne est dans le prompt,
     pydantic accepte le bloc, l'écran sait le rendre) ;
  2. le verdict est écrit DEUX FOIS dans la même réponse — « Verdict : oui, mais
     pas en placement immédiat… » puis, plus bas, « Verdict / Oui, un expert
     cybersécurité peut être pertinent… / Pourquoi / … ». C'est la loi 4 du
     dépôt : rien n'apparaît deux fois sous la même forme avec le même contenu.

La cause n'est pas un maillon cassé, c'est un arbitrage ABSENT : quatre gabarits
ouverts par « Verdict » coexistaient dans le prompt sans qu'aucune règle ne dise
lequel gagne — `_BLOCK_MARKET_ANSWER` (cinq temps, VERDICT en 1), `_BLOCK_
PRIORITISATION` (cinq temps par compte, VERDICT en 1), `_BLOCK_FORMAT` (CONSEIL :
verdict en une phrase ; preuves ; limites ; prochaine action) et la carte
`verdict` de `reply_formats.py`. Un modèle qui reçoit quatre façons de dire la
même chose en applique deux.

─────────────────────────────────────────────────────────────────────────────
CE QUE CETTE GARDE TIENT — ET CE QU'ELLE NE TIENT PAS
─────────────────────────────────────────────────────────────────────────────
Elle tient la RÈGLE, pas la formulation : **tout bloc du prompt assemblé qui
parle d'un verdict renvoie à l'arbitrage, et l'arbitrage est écrit à UN seul
endroit** (loi « un réglage vit à un seul endroit »). Un cinquième gabarit
« Verdict » ajouté demain sans ce renvoi la fait rougir.

Elle ne dit rien de ce que le modèle ÉMET : c'est
`tests/test_copilote_verdict_card_eval.py` qui tient cette moitié-là, sur des
réponses.

⚠️ Elle LIT le prompt ASSEMBLÉ (`build_system_prompt`), jamais une constante :
`test_reply_formats_prompt.py` a déjà montré qu'une chaîne peut être juste dans
son module et absente du texte envoyé au modèle.
"""

from __future__ import annotations

import re

from app.prompts.bellum_advisor import build_system_prompt
from app.services.claude_service import CACHE_SEGMENT_BREAK

# Le NOM de la règle — ce que les autres gabarits citent au lieu de la redire.
ARBITRATION_RULE_NAME = "UN SEUL FORMAT PAR RÉPONSE"

# Ce qui DÉFINIT la règle (par opposition à un simple renvoi). Le bloc qui porte
# cette phrase est le seul autorisé à écrire l'arbitrage.
ARBITRATION_DEFINITION = "la règle qui départage tous les gabarits"

_VERDICT = re.compile(r"\bverdicts?\b", re.IGNORECASE)


def assembled_prompt() -> str:
    """Le segment INVARIANT du prompt réellement envoyé (celui qui porte les
    gabarits ; la queue volatile ne porte que du contexte)."""
    return build_system_prompt({}, {}, "", "").split(CACHE_SEGMENT_BREAK)[0]


def prompt_blocks(prompt: str) -> list[str]:
    """Un bloc = un morceau séparé par une ligne vide — c'est exactement la
    couture de `build_system_prompt` (26 blocs mesurés le 14/09/2026)."""
    return [block for block in prompt.split("\n\n") if block.strip()]


def audit_verdict_arbitration(prompt: str) -> list[str]:
    """Les gabarits « verdict » qui ne sont pas arbitrés, et l'arbitrage écrit
    plusieurs fois. Liste vide = le prompt tranche."""
    blocks = prompt_blocks(prompt)
    defining = [block for block in blocks if ARBITRATION_DEFINITION in block]
    findings: list[str] = []

    if len(defining) != 1:
        findings.append(
            f"la règle d'arbitrage est définie {len(defining)} fois — elle doit vivre à UN seul endroit"
        )

    for block in blocks:
        if not _VERDICT.search(block) or block in defining:
            continue
        if ARBITRATION_RULE_NAME not in block:
            head = block.splitlines()[0][:70]
            findings.append(f"gabarit « verdict » sans arbitrage : {head}")
    return findings


# ── Ce que la garde LIT ───────────────────────────────────────────────────────


def test_le_corpus_est_le_prompt_assemble_et_il_n_est_pas_vide() -> None:
    """Une garde qui ne lit rien reste verte pour toujours."""
    blocks = prompt_blocks(assembled_prompt())
    assert len(blocks) >= 20, f"prompt assemblé anormalement court : {len(blocks)} blocs"
    carrying = [block for block in blocks if _VERDICT.search(block)]
    assert len(carrying) >= 4, (
        "moins de quatre blocs parlent d'un verdict : le corpus a changé de forme, "
        f"la garde ne lit plus ce qu'elle croit ({len(carrying)})"
    )


# ── La règle ──────────────────────────────────────────────────────────────────


def test_chaque_gabarit_verdict_renvoie_a_la_regle_unique() -> None:
    assert audit_verdict_arbitration(assembled_prompt()) == []


def test_la_regle_dit_laquelle_des_deux_formes_gagne_et_interdit_le_cumul() -> None:
    rule = next(b for b in prompt_blocks(assembled_prompt()) if ARBITRATION_DEFINITION in b)
    # Symptôme 1 : la carte l'emporte sur le gabarit texte, et elle est NOMMÉE.
    assert "carte verdict" in rule
    assert "remplace" in rule
    # Symptôme 2 : le cumul est interdit explicitement.
    assert "JAMAIS DEUX FOIS LE MÊME CONTENU" in rule


# ── Ce qui la fait rougir (elle sait dire NON) ────────────────────────────────


def test_elle_rougit_quand_un_cinquieme_gabarit_verdict_arrive_sans_arbitrage() -> None:
    intrus = "RÉPONDRE À UNE OBJECTION :\n1. VERDICT — une phrase.\n2. La réponse à tenir."
    findings = audit_verdict_arbitration(assembled_prompt() + "\n\n" + intrus)
    assert findings, "un gabarit « verdict » de plus, non arbitré, doit rougir"
    assert any("OBJECTION" in finding for finding in findings), findings


def test_elle_rougit_quand_un_gabarit_existant_cesse_de_renvoyer_a_la_regle() -> None:
    prompt = assembled_prompt()
    market = next(b for b in prompt_blocks(prompt) if b.startswith("RÉPONSE À UNE QUESTION MARCHÉ"))
    broken = prompt.replace(market, market.replace(ARBITRATION_RULE_NAME, "ton bon sens"))
    findings = audit_verdict_arbitration(broken)
    assert findings, "un renvoi retiré doit rougir"
    assert any("QUESTION MARCHÉ" in finding for finding in findings), findings


def test_elle_rougit_quand_la_regle_est_ecrite_deux_fois() -> None:
    prompt = assembled_prompt()
    rule = next(b for b in prompt_blocks(prompt) if ARBITRATION_DEFINITION in b)
    findings = audit_verdict_arbitration(prompt + "\n\n" + rule)
    assert any("UN seul endroit" in finding for finding in findings), findings


# ── Le témoin : ce qu'elle ne vise PAS ────────────────────────────────────────


def test_un_bloc_qui_ne_prescrit_aucun_verdict_n_a_rien_a_renvoyer() -> None:
    """Un gabarit légitime sans verdict (celui de la découverte produit, par
    exemple) ne doit pas se voir réclamer un renvoi qui n'a aucun sens pour lui."""
    temoin = "RÉPONDRE À UN REMERCIEMENT : une phrase, et tu enchaînes sur le geste suivant."
    assert audit_verdict_arbitration(assembled_prompt() + "\n\n" + temoin) == []
