# Candidate Screener Webhook

Small Zapier-facing webhook for compliant candidate search triage.

It returns routing statuses for first-interview scheduling:

- `clear_to_schedule`
- `review_required`
- `insufficient_identity`
- `not_allowed_at_stage`

It never returns `fail` and should not be used to reject a candidate automatically. Search-only results are unverified leads for HR/legal review.

## Run Locally

```bash
cp .env.example .env
npm test
PORT=3000 node src/server.js
```

The server loads `.env` automatically at startup. Restart the server after changing any key.

Health check:

```bash
curl http://localhost:3000/health
```

Browser test page:

```text
http://localhost:3000/
```

Webhook:

```bash
curl -X POST http://localhost:3000/api/candidate-screen \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "hubspot-contact-or-deal-id",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "city": "Miami",
    "state": "FL",
    "roleTitle": "Sales Representative",
    "jobCity": "Miami",
    "jobState": "FL",
    "hubspotUrl": "https://app.hubspot.com/..."
  }'
```

First and last name alone are allowed. When no location or email is provided, any concerning matches are returned as low-confidence leads for human review because same-person matching is weaker.

## Environment

- `TAVILY_API_KEY`: Tavily API key for broad web search.
- `TAVILY_SEARCH_DEPTH`: Defaults to `basic`. Tavily also supports deeper modes, but `basic` keeps cost and latency lower.
- `TAVILY_MAX_RESULTS_PER_QUERY`: Defaults to `5`.
- `TAVILY_MIN_SCORE`: Defaults to `0.45`. Results below this Tavily relevance score are ignored.
- `TAVILY_EXACT_MATCH`: Defaults to `true` so exact quoted candidate names must appear in results.
- `TAVILY_INCLUDE_DOMAINS`: Optional comma-separated allow list for narrow audits.
- `TAVILY_EXCLUDE_DOMAINS`: Optional comma-separated block list. Defaults exclude common social/video domains to reduce protected-class and lifestyle noise.
- `OPENAI_API_KEY`: Enables AI review through the OpenAI Responses API. If omitted, the service uses conservative keyword triage.
- `OPENAI_MODEL`: Defaults to `gpt-5-mini`.
- `GAINESVILLE_FAIR_CHANCE_COVERED`: Defaults to `true`. Set `false` only after HR/legal confirms Gainesville fair-chance rules do not apply.
- `WEBHOOK_SHARED_SECRET`: Optional bearer token. If set, Zapier must send `Authorization: Bearer <secret>`.

## Zapier Setup

1. Add a Webhooks by Zapier step after HubSpot creates the careers contact/deal.
2. Use `POST` to `https://your-host/api/candidate-screen`.
3. Send JSON fields listed in the example above.
4. Branch on `zapierAction`:
   - `continue`: schedule/send Calendly link.
   - `hold_for_hr_review`: stop scheduling and notify HR.

## Vercel Deployment

This repo includes Vercel serverless functions:

- `GET /`
- `GET /api/health`
- `POST /api/candidate-screen`

It also exports a default handler from `src/server.js` for Vercel projects that were configured to use `src/server` as the entrypoint. The recommended setup is still the `api/` functions above.

Set these environment variables in Vercel Project Settings before testing the deployed URL:

- `TAVILY_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GAINESVILLE_FAIR_CHANCE_COVERED`
- `WEBHOOK_SHARED_SECRET` if you want Zapier bearer-token protection

Then redeploy. Vercel does not read your local `.env` file in production.

## Compliance Guardrails

- This is search-only triage, not an FCRA background check.
- Do not take adverse action from this webhook alone.
- Arrest-only results are not proof and are flagged only as unverified leads when serious and plausibly job-related.
- For Gainesville, FL candidate or job locations, screening is blocked by default before a conditional offer.
- Before adverse action, use verified records, individualized assessment, candidate response opportunity, and HR/legal approval. If a consumer report is used, follow FCRA disclosure, authorization, pre-adverse action, and adverse action requirements.

## Tavily Usage Notes

- The app uses Tavily Search, not Map or Crawl, because this workflow checks one candidate at a time rather than discovering or ingesting an entire website.
- Queries run concurrently and are split into focused searches instead of one long prompt.
- Exact-match search is enabled by default because this is due-diligence/legal-style lookup for a known person name.
- Police/arrest/charges queries use Tavily's `news` topic; other queries use `general` with a United States country boost.
- Raw page content and images are disabled by default to keep the AI review focused on titles, snippets, URLs, and relevance metadata.
