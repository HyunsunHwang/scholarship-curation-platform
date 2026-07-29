# Segment-reference generalization v3.4.1 closeout

Two real unseen notices were available with complete, attributable source text: a CAU external-scholarship recommendation notice (`SIMPLE`) and a Yonsei UIC scholarship application notice (`COMPLEX`). The UIC source was acquired through one read-only GET of a detail URL already present in persisted provenance. Four eligible notices could not be assembled without exceeding the permitted acquisition scope.

Three first-pass provider calls were made: one SIMPLE call and two COMPLEX calls. No retry, fallback, DB access, crawler run, or production access occurred. All calls returned HTTP 200, but the persisted results failed structural validation: the SIMPLE result prefixed segment IDs, while COMPLEX output contained a noncanonical organization role and raw values on unsupported fields. No fixture was called again.

The runtime now applies only generic output cleanup before validation: it strips a unique segment-ID prefix, canonicalizes known organization role aliases, and discards raw values from fields that cannot carry them. The v3.4.1 benchmark remains **HOLD** because only two eligible fixtures were available and no valid claim set was produced during the non-retry run; semantic audit is consequently `NOT_EVALUATED / no_valid_claims`.
