# Employee-count certainty correction

An injected provider response on main cf6bba0 could convert approximate, ranged,
negated or conflicting employee statements into an exact integer. The existing
whole-numeral check prevented numeric substrings but did not preserve uncertainty;
a provider could omit a qualifier from its evidence excerpt.

The extraction gate now examines full user clauses as well as the quoted numeral.
It requires a supported employment/count expression, rejects common uncertainty,
range and negation markers, and rejects inconsistent counts across user history.
Unsupported extraction follows the existing 502 ai_invalid_response path with no
applied changes and no automatic retry. An omitted/null count remains unknown.
Existing caller-supplied profile values retain their existing trust boundary.

This deliberately conservative gate is not a general natural-language proof:
unrecognized phrasing or explicit historical corrections involving different
counts can require clarification. Short exact evidence such as `30` still works
when the full statement says `30 employees`; unrelated device quantities do not
justify employee counts. Existing detailed warehouse fixtures still pass.

Validation: clean-main baseline 639 passed; correction 654 passed. Fifteen new
injected-provider HTTP regressions cover exact 0/30/300 counts, uncertainty,
ranges, conflicts, negation and unknown counts. The initial reproduction had eight
unsafe acceptances among nine rejection cases (one was already rejected by the
existing numeral/excerpt check). The strengthened ASCII-range test additionally
checks extraction of its upper endpoint. No live Meta inference was performed.

No solver, public schema, frontend or deployment setting changes.
