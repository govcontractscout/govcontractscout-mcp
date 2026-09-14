# GovContractScout MCP Server

Model Context Protocol (MCP) server exposing the [GovContractScout](https://scout.govbidportals.com) US state & local government contracts API to AI agents. Search live contracts, pull details, look up NAICS codes, list states, and score contract fit — without raw HTTP.

```text
AI agent (Claude, Cursor, etc.)  ⇄  MCP  ⇄  GovContractScout /v1 API  ⇄  50-state procurement data
```

## Tools

| Tool | Description |
|---|---|
| `search_contracts` | Search active government contracts by state, NAICS, keyword (returns title, agency, due date, match signals) |
| `get_contract` | Fetch one contract's full record by ID |
| `search_naics` | Look up NAICS codes by keyword |
| `get_states` | List the states we index + live contract counts |
| `score_contract` | Score a contract's fit for a business profile (uses `/v1/match`) |

All tools hit the same `/v1` API as the public REST endpoint — same data, same auth, same rate limits. Live data from state procurement portals, updated daily.

## Requirements

- Node.js 18+
- A GovContractScout API key (`gcs_live_...`) — free tier works (100 calls/month); paid tiers for production. Get one at [scout.govbidportals.com/api-keys](https://scout.govbidportals.com/api-keys) — instant, no card.

## Quickstart

### Claude Code

```bash
claude mcp add govcontractscout \
  --env GCS_API_KEY=gcs_live_YOUR_KEY \
  -- npx -y govcontractscout-mcp
```

### Any MCP client (mcp.json / mcp.settings)

```json
{
  "mcpServers": {
    "govcontractscout": {
      "command": "npx",
      "args": ["-y", "govcontractscout-mcp"],
      "env": {
        "GCS_API_KEY": "gcs_live_YOUR_KEY"
      }
    }
  }
}
```

### Manual (from source)

```bash
npm install && npm run build
GCS_API_KEY=gcs_live_YOUR_KEY node dist/index.js
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `GCS_API_KEY` | ✅ | — | Your API key from the dashboard |
| `GOVCONTRACTSCOUT_API_BASE` | ❌ | `https://scout.govbidportals.com` | API base URL override (self-hosting) |

## Example

Ask your agent:

> "Find open IT services contracts in California due this month, then score the top one for a 10-person consulting firm with T&M experience."

The agent calls `search_contracts` (state=CA, naics=IT services), then `score_contract` — no HTTP knowledge required from the agent.

## Design notes

- **Idempotent scoring** — `score_contract` sends a deterministic `Idempotency-Key`, so retries never double-burn quota.
- **Same moat as the API** — source URLs and raw source_portal fields are deliberately excluded; the data is our aggregation, and the MCP exposes exactly what the API exposes.
- **Honest coverage** — contracts carry a `data_quality` field (level + which fields are populated). Some states have richer data than others; the API tells you exactly what you're getting.

## API / pricing

- Free: 100 calls/month, no card
- Starter $99/mo · Growth $199/mo · annual = 17% off
- Full API docs: [scout.govbidportals.com/docs/api](https://scout.govbidportals.com/docs/api)

## Development

```bash
npm run dev    # tsx watch
npm run build  # tsc -> dist/
npm start      # run built server
```

The server is a thin wrapper over the public REST API (`/v1/contracts`, `/v1/contracts/:id`, `/v1/naics`, `/v1/states`, `/v1/match`) — see the [API docs](https://scout.govbidportals.com/docs/api) for schemas.

## License

MIT
