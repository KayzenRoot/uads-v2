# Risk and gates

Risk is LOW | MEDIUM | HIGH | CRITICAL from structured signals plus **task-relevant** repository context. Ambient auth/contracts in the same repo must not raise an unrelated CSS change.

Gates are selected from the canonical registry, not dumped. Style-only frontend work does not require Web3 fuzzing, dependency-audit, or release-check. DeFi withdrawal requires web3-unit, fuzz, invariant, and security review. A selected gate is satisfied only by the contract for that gate: command gates need command evidence with exit 0 and an output digest; review gates need the mapped reviewer APPROVED record. Current-digest FAIL/BLOCKED stays sticky until a new digest.
