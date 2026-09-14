import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";

/**
 * GovContractScout MCP server.
 *
 * Exposes the GovContractScout public API (/v1) as MCP tools so AI agents
 * can search live government contracts, look up NAICS codes, list states,
 * and score contract fit — without ever calling raw HTTP.
 *
 * Auth: set GCS_API_KEY (a gcs_live_... key from the dashboard) or
 * GOVCONTRACTSCOUT_API_BASE if self-hosting the base URL.
 */

const API_KEY = process.env.GCS_API_KEY || "";
const API_BASE =
  process.env.GOVCONTRACTSCOUT_API_BASE || "https://scout.govbidportals.com";

if (!API_KEY) {
  console.error(
    "Missing GCS_API_KEY. Set it to your GovContractScout API key (gcs_live_...).",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "govcontractscout",
  version: "1.0.0",
});

/**
 * Helper: call the GCS /v1 API and return the JSON body (or throw with the
 * error message + status, which surfaces to the agent as the tool result).
 */
async function gcs(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${API_BASE}/v1${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });

  const body = await res.json().catch(() => ({ error: "Invalid JSON response" }));

  if (!res.ok) {
    const msg =
      (body as any)?.error?.message ||
      (body as any)?.error ||
      `API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Tool 1: search_contracts
// ---------------------------------------------------------------------------
server.registerTool(
  "search_contracts",
  {
    description:
      "Search live US state & local government contracts. Supports filters: states, NAICS codes (2-6 digits), keyword, agency, min/max value (USD), due date range. Returns contracts with title, agency, state, due date, set-asides, and value.",
    inputSchema: z.object({
      states: z
        .array(z.string())
        .describe("Two-letter state codes, e.g. ['TX', 'CA']")
        .optional(),
      naics_codes: z
        .array(z.string())
        .describe("NAICS codes (2-6 digits), e.g. ['541511']")
        .optional(),
      keyword: z.string().describe("Free-text keyword in title/description").optional(),
      agency: z.string().describe("Agency name substring").optional(),
      min_value: z.number().describe("Minimum estimated value in USD").optional(),
      max_value: z.number().describe("Maximum estimated value in USD").optional(),
      due_after: z.string().describe("ISO date YYYY-MM-DD — contracts due on/after").optional(),
      due_before: z.string().describe("ISO date YYYY-MM-DD — contracts due on/before").optional(),
      page: z.number().describe("Page number (1-based, max 20)").optional(),
      per_page: z.number().describe("Results per page (max 50)").optional(),
      sort: z
        .enum(["due_date", "posted_date", "value", "title"])
        .describe("Sort field")
        .optional(),
      order: z.enum(["asc", "desc"]).optional(),
    }),
  },
  async (args) => {
    const data = await gcs("/contracts", {
      states: args.states?.join(",") || "",
      naics_codes: args.naics_codes?.join(",") || "",
      keyword: args.keyword || "",
      agency: args.agency || "",
      min_value: args.min_value != null ? String(args.min_value) : "",
      max_value: args.max_value != null ? String(args.max_value) : "",
      due_after: args.due_after || "",
      due_before: args.due_before || "",
      page: args.page != null ? String(args.page) : "",
      per_page: args.per_page != null ? String(args.per_page) : "",
      sort: args.sort || "",
      order: args.order || "",
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2).slice(0, 24000),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 2: get_contract
// ---------------------------------------------------------------------------
server.registerTool(
  "get_contract",
  {
    description:
      "Get full details for a single government contract by ID (including agency, set-asides, NAICS codes, dates, and attachments).",
    inputSchema: z.object({
      contract_id: z.string().describe("UUID of the contract"),
    }),
  },
  async ({ contract_id }) => {
    const data = await gcs(`/contracts/${contract_id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 3: search_naics
// ---------------------------------------------------------------------------
server.registerTool(
  "search_naics",
  {
    description:
      "Look up NAICS codes by keyword or code prefix. NAICS codes classify a business's industry — used to match contracts. Pass a keyword like 'janitorial' or 'IT services', or a code like '5415'.",
    inputSchema: z.object({
      keyword: z.string().describe("Industry keyword or NAICS code prefix").optional(),
      q: z.string().describe("Alias for keyword").optional(),
      limit: z.number().describe("Max results").optional(),
    }),
  },
  async (args) => {
    const keyword = args.keyword || args.q || "";
    const data = await gcs("/naics", {
      keyword,
      limit: args.limit != null ? String(args.limit) : "",
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 4: get_states
// ---------------------------------------------------------------------------
server.registerTool(
  "get_states",
  {
    description:
      "List the US states with live contract coverage in the GovContractScout dataset (metadata only).",
    inputSchema: z.object({}),
  },
  async () => {
    const data = await gcs("/states");
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 5: score_contract
// ---------------------------------------------------------------------------
server.registerTool(
  "score_contract",
  {
    description:
      "Score a single contract's fit against a contractor profile using GCS's 5-factor AI matching (NAICS, budget, location, keywords/skills, timeline). Returns a 0-100 score.",
    inputSchema: z.object({
      contract_id: z.string().describe("UUID of the contract"),
      profile: z
        .object({
          company_name: z.string().optional(),
          naics_codes: z.array(z.string()).optional(),
          service_areas: z.array(z.string()).describe("State codes, e.g. ['TX']").optional(),
          budget_range_min: z.number().optional(),
          budget_range_max: z.number().optional(),
          skills: z.array(z.string()).optional(),
          certifications: z.array(z.string()).optional(),
        })
        .describe("Contractor profile for matching"),
    }),
  },
  async ({ contract_id, profile }) => {
    const res = await fetch(`${API_BASE}/v1/match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // Deterministic idempotency key: same contract + profile = same result,
        // and retries don't re-burn quota.
        "Idempotency-Key": `mcp-match-${contract_id}`,
      },
      body: JSON.stringify({ contract_id, profile }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as any)?.error?.message || `Match API error (HTTP ${res.status})`);
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tool 6: win_likelihood
// ---------------------------------------------------------------------------
server.registerTool(
  "win_likelihood",
  {
    description:
      "Estimate the likelihood (0-100) that a contractor profile wins a specific contract, based on the historical award archetype that wins in the contract's category. Returns a score, grade, reasons, and the matched archetype.",
    inputSchema: z.object({
      contract_id: z.string().describe("UUID of the contract"),
      profile: z
        .object({
          company_name: z.string().optional(),
          naics_codes: z.array(z.string()).optional(),
          service_areas: z.array(z.string()).describe("State codes, e.g. ['TX']").optional(),
          budget_range_min: z.number().optional(),
          budget_range_max: z.number().optional(),
          skills: z.array(z.string()).optional(),
          certifications: z.array(z.string()).optional(),
          target_agencies: z.array(z.string()).optional(),
          past_agencies: z.array(z.string()).optional(),
          years_in_business: z.number().optional(),
          past_awards_count: z.number().optional(),
        })
        .describe("Contractor profile for win-likelihood scoring"),
    }),
  },
  async ({ contract_id, profile }) => {
    const res = await fetch(`${API_BASE}/v1/win-likelihood`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": `mcp-win-${contract_id}`,
      },
      body: JSON.stringify({ contract_id, profile }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (body as any)?.error?.message || `Win-likelihood API error (HTTP ${res.status})`,
      );
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 7: archetypes
// ---------------------------------------------------------------------------
server.registerTool(
  "archetypes",
  {
    description:
      "List the winning-business archetypes derived from historical government contract awards (e.g. IT & Software Services, regional construction prime). Each includes NAICS, typical award range, agency types, states, and sample winners.",
    inputSchema: z.object({
      category: z.string().optional().describe("Filter archetypes by award category (e.g. 'IT & Software Services')"),
    }),
  },
  async ({ category }) => {
    const data = await gcs("/archetypes", category ? { category } : {});
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});