# Offline provider replay v3.4.2

The replay consumes the three persisted v3.4.1 provider outputs and makes zero provider, DB, crawler, or production calls. It applies safe source-reference normalization only for the current source/article prefix, discards logged raw hints from unsupported fields, accepts relative deadlines without inventing dates, and validates each claim independently.

CAU recovered nine normalized claims after its prefixed segment references were normalized. Yonsei recovered non-empty Pass A and Pass B claim sets; its Korea Student Aid Foundation reference is retained only as a related mention because the cited text describes a national-scholarship overlap exception, not a role in the UIC program. The v3.4.1 generalization benchmark remains `HOLD / INSUFFICIENT_FIXTURES`; the offline replay decision is `CONDITIONAL_PASS` pending claim-by-claim semantic audit of the recovered set.
