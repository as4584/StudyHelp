import pytest

from app.services import solver
from app.services.solver import Unsafe, parse


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("What is the derivative of 3x^2 + 5x - 7?", "d/dx of 3x^2 + 5x - 7 = 6x + 5"),
        ("How do I differentiate sin(x^2)?", "= 2x*cos(x^2)"),
        ("Solve for x: 2x + 6 = 20. Show steps.", "gives x = 7"),
        ("solve x^2 - 4 = 0", "x = -2, x = 2"),
        ("What is 15% of 240?", "15% of 240 = 36"),
        ("What is the integral of 2x dx?", "integral of 2x dx = x^2 + C"),
        ("factor x^2 - 5x + 6", "(x - 3)*(x - 2)"),
        ("expand (x + 1)^2", "x^2 + 2x + 1"),
        ("what is 12*(3+4)/7?", "= 12"),
        ("Balance: H2 + O2 -> H2O", "balanced: 2H2 + O2 -> 2H2O"),
        ("balance C3H8 + O2 -> CO2 + H2O", "C3H8 + 5O2 -> 3CO2 + 4H2O"),
        ("balance Ca(OH)2 + HCl -> CaCl2 + H2O", "Ca(OH)2 + 2HCl -> CaCl2 + 2H2O"),
        ("d/dt of t^3", "d/dt of t^3 = 3t^2"),
        ("solve x^2 = -1", "x = -i, x = i"),
        ("solve x^2 + 2x + 5 = 0", "x = -1 - 2i, x = -1 + 2i"),
    ],
)
async def test_computes_exact_results(question: str, expected: str) -> None:
    facts = await solver.solve(question)
    assert facts, question
    assert expected in facts[0].text


@pytest.mark.parametrize(
    "question",
    [
        "Who wrote Pride and Prejudice?",
        "Can you explain photosynthesis?",
        "What does the derivative mean?",
        "what is 9^999999",
        'derivative of __import__("os").system("x")',
        "derivative of eval(x)",
        "integrate x.__class__",
        "solve open(x) = 1",
    ],
)
async def test_says_nothing_when_unsure_or_unsafe(question: str) -> None:
    assert await solver.solve(question) == []


@pytest.mark.parametrize(
    "src", ["__import__('os')", "x.real", "lambda: 1", "x" * 200, "2^1000", "exec(1)", "[1]"]
)
def test_parser_refuses_anything_off_the_whitelist(src: str) -> None:
    with pytest.raises(Unsafe):
        parse(src)


def test_no_closed_form_integral_gives_no_fact() -> None:
    assert solver._scan("integrate sin(x)/ln(x)") == []


async def test_slow_work_times_out_quietly(monkeypatch: pytest.MonkeyPatch) -> None:
    import time

    monkeypatch.setattr(solver, "TIME_LIMIT_S", 0.05)
    monkeypatch.setattr(solver, "_scan", lambda q: time.sleep(0.5) or [])
    assert await solver.solve("derivative of x") == []


def test_prompt_and_checked_lines() -> None:
    facts = [solver.Fact("percent", "15% of 240 = 36")]
    assert "15% of 240 = 36" in solver.prompt_block(facts)
    assert "do not recompute" in solver.prompt_block(facts)
    assert solver.checked_lines(facts) == "\nChecked: 15% of 240 = 36"
    assert solver.prompt_block([]) == "" and solver.checked_lines([]) == ""
