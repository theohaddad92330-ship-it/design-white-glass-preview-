"""#3218 — l'appel d'outil ne fuit jamais dans le texte de Laura."""

from app.services.tool_call_leak import StreamingToolCallFilter, strip_tool_call_text

LEAK = '{{functions.offer_reply_options({"question":"Quel canal ?","options":["E-mail","LinkedIn"]})}}'


def test_strip_removes_the_recopied_tool_call():
    assert strip_tool_call_text(f"Je prépare le message. {LEAK}") == "Je prépare le message."


def test_strip_leaves_ordinary_double_braces_and_plain_text_alone():
    assert strip_tool_call_text("Modèle {{prenom}} et {{ societe }}") == "Modèle {{prenom}} et {{ societe }}"
    assert strip_tool_call_text("Rien à retirer.") == "Rien à retirer."


def test_strip_drops_an_unclosed_call_at_the_end():
    assert strip_tool_call_text('Voilà. {{functions.offer_reply_options({"question":"Qu') == "Voilà."


def _stream(fragments: list[str]) -> str:
    f = StreamingToolCallFilter()
    return "".join(f.feed(x) for x in fragments) + f.flush()


def test_stream_cut_anywhere_never_shows_the_call():
    for cut in range(1, len(LEAK)):
        text = f"Avant. {LEAK} Après."
        pos = text.index("{{") + cut
        out = _stream([text[:pos], text[pos:]])
        assert "functions" not in out and "{{" not in out, (cut, out)
        assert out.startswith("Avant.") and out.endswith("Après.")


def test_stream_char_by_char_and_a_lone_brace_comes_back():
    assert "functions" not in _stream(list(f"Texte {LEAK}"))
    assert _stream(["Un { seul ", "accolade"]) == "Un { seul accolade"
    assert _stream(["Fin avec {", "{x}} ok"]) == "Fin avec {{x}} ok"


def test_stream_unclosed_call_is_dropped_at_flush():
    assert _stream(["Salut {{functions.offer_reply", '_options({"q'])== "Salut "
