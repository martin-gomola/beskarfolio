# BeskarFolio MCP Server

A thin, **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server that lets local agents (Codex, Cursor, Claude Desktop, ...) call BeskarFolio's public price/calculation endpoints as native tools.

It wraps the same endpoints declared in the site's `.well-known/webmcp` manifest, so there's one source of truth for "what an agent can do here." Nothing here writes data or triggers paid price fetches.

## Tools

| Tool | Wraps | Description |
|------|-------|-------------|
| `get_latest_prices` | `GET /api/prices/latest` | Latest cached price per ticker |
| `get_price_status` | `GET /api/prices/status` | Cache freshness summary (`details` optional) |
| `get_exchange_rates` | `GET /api/exchange-rates` | Current EUR/USD rates |
| `get_ticker_profile` | `GET /api/tickers/{ticker}/profile` | Sector/region/ETF classification |

## Setup

```bash
cd mcp-server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Config

| Env var | Default | Notes |
|---------|---------|-------|
| `BESKARFOLIO_API_URL` | `http://localhost:8060` | Use `https://stonks.martingomola.com` for prod |
| `BESKARFOLIO_API_KEY` | _(none)_ | Only if the target deployment has API-key protection |

The backend must be running (`make dev`) for the localhost default to work.

## Wire it into an agent

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "beskarfolio": {
      "command": "mcp-server/.venv/bin/python",
      "args": ["mcp-server/server.py"],
      "type": "stdio",
      "env": { "BESKARFOLIO_API_URL": "http://localhost:8060" }
    }
  }
}
```

**Codex** — `~/.codex/config.toml`:

```toml
[mcp_servers.beskarfolio]
command = "/absolute/path/to/beskarfolio/mcp-server/.venv/bin/python"
args = ["/absolute/path/to/beskarfolio/mcp-server/server.py"]
env = { BESKARFOLIO_API_URL = "http://localhost:8060" }
```

**Claude Desktop** — `claude_desktop_config.json` uses the same `mcpServers` shape as Cursor (absolute paths).

After adding the config, restart the agent. Then try: *"What's the price-cache freshness in BeskarFolio?"* or *"Classify ticker VWCE.DE."*

## Quick manual test

```bash
# With the backend running on :8060
.venv/bin/python -c "import json, server; print(json.dumps(server.get_exchange_rates()))"
```
