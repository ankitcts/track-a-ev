// Natural-language → structured criteria, powered by Claude.
//
// The user speaks/types something like:
//   "I want a Model 3 or Y on lease, $0 down, under $300/mo for the 3 and
//    under $400 for the Y, brand new near 95134."
// We turn that into ParsedCriteria. If ANTHROPIC_API_KEY is missing or the
// call fails, we fall back to a deterministic heuristic parser so the product
// still works in a demo.

import Anthropic from "@anthropic-ai/sdk";
import type {
  Condition,
  Financing,
  ModelTarget,
  ParsedCriteria,
  TeslaModelCode,
} from "./types";

const MODEL = "claude-haiku-4-5";

const SYSTEM = `You convert a shopper's request into structured Tesla inventory search criteria.
Models map to codes: Model 3 -> "m3", Model Y -> "my", Model S -> "ms", Model X -> "mx".
Financing is one of: "lease", "loan", "cash". "$0 down" / "zero down" means maxDownPayment 0.
Per-model monthly caps go on that model's target as maxMonthly. Total-price caps go as maxPrice.
condition is "new", "used", or "any" (default "new"). Only include fields the user actually specified.
Always include a short, friendly "summary" the assistant can read back to confirm.`;

const TOOL: Anthropic.Tool = {
  name: "set_criteria",
  description: "Record the structured Tesla search criteria.",
  input_schema: {
    type: "object",
    properties: {
      models: {
        type: "array",
        items: {
          type: "object",
          properties: {
            model: { type: "string", enum: ["m3", "my", "ms", "mx"] },
            maxMonthly: { type: "number" },
            maxPrice: { type: "number" },
            trim: { type: "string" },
          },
          required: ["model"],
        },
      },
      financing: { type: "string", enum: ["lease", "loan", "cash"] },
      maxDownPayment: { type: "number" },
      condition: { type: "string", enum: ["new", "used", "any"] },
      zip: { type: "string" },
      radius: { type: "number" },
      summary: { type: "string" },
    },
    required: ["models", "financing", "condition", "summary"],
  },
};

export async function parseCriteria(text: string): Promise<ParsedCriteria> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return heuristicParse(text);

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "set_criteria" },
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return heuristicParse(text);
    return normalize(block.input as Partial<ParsedCriteria>, text);
  } catch {
    return heuristicParse(text);
  }
}

function normalize(
  input: Partial<ParsedCriteria>,
  text: string
): ParsedCriteria {
  const models = (input.models || []).filter((m) => m && m.model) as ModelTarget[];
  return {
    models: models.length ? models : heuristicParse(text).models,
    financing: (input.financing as Financing) || "lease",
    maxDownPayment: input.maxDownPayment,
    condition: (input.condition as Condition) || "new",
    zip: input.zip,
    radius: input.radius,
    summary: input.summary || buildSummary(models, input),
  };
}

// --- Deterministic fallback ---------------------------------------------

const MODEL_PATTERNS: [RegExp, TeslaModelCode][] = [
  [/model\s*3|m3\b|\bthree\b/i, "m3"],
  [/model\s*y|\bmodel-?y\b|\bmy\b|\bwhy\b|(?:\/|\bor\b|,|&|\band\b)\s*y\b/i, "my"],
  [/model\s*s|\bms\b/i, "ms"],
  [/model\s*x|\bmx\b/i, "mx"],
];

export function heuristicParse(text: string): ParsedCriteria {
  const lower = text.toLowerCase();

  const foundModels: TeslaModelCode[] = [];
  for (const [re, code] of MODEL_PATTERNS) {
    if (re.test(lower) && !foundModels.includes(code)) foundModels.push(code);
  }
  if (foundModels.length === 0) foundModels.push("m3");

  const financing: Financing = /lease/.test(lower)
    ? "lease"
    : /loan|financ|apr/.test(lower)
    ? "loan"
    : /cash|buy outright|purchase/.test(lower)
    ? "cash"
    : "lease";

  const maxDownPayment =
    /\b(0|zero)\s*(\$|dollar)?\s*down/.test(lower) ? 0 : undefined;

  const condition: Condition = /\bused|pre[-\s]?owned|second\s*hand/.test(lower)
    ? "used"
    : "new";

  const zipMatch = lower.match(/\b(\d{5})\b/);
  const zip = zipMatch ? zipMatch[1] : undefined;

  // Pull monthly caps. If two different "$ < N" amounts are present and two
  // models, pair them up in order (matches the user's example).
  const monthlyCaps = [...lower.matchAll(/(?:under|less than|below|<)\s*\$?\s*(\d{2,4})/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n < 5000);

  const models: ModelTarget[] = foundModels.map((model, i) => {
    const cap = monthlyCaps[i] ?? monthlyCaps[0];
    const target: ModelTarget = { model };
    if (cap != null) {
      if (financing === "cash") target.maxPrice = cap;
      else target.maxMonthly = cap;
    }
    return target;
  });

  const parsed = {
    models,
    financing,
    maxDownPayment,
    condition,
    zip,
  };
  return { ...parsed, summary: buildSummary(models, parsed) };
}

function buildSummary(
  models: ModelTarget[],
  c: Partial<ParsedCriteria>
): string {
  const names: Record<string, string> = { m3: "Model 3", my: "Model Y", ms: "Model S", mx: "Model X" };
  const parts = models.map((m) => {
    const bits = [names[m.model] || m.model];
    if (m.maxMonthly) bits.push(`under $${m.maxMonthly}/mo`);
    if (m.maxPrice) bits.push(`under $${m.maxPrice.toLocaleString()}`);
    return bits.join(" ");
  });
  const fin = c.financing ? `${c.financing}` : "lease";
  const down =
    c.maxDownPayment === 0 ? ", $0 down" : c.maxDownPayment ? `, ≤ $${c.maxDownPayment} down` : "";
  const cond = c.condition && c.condition !== "any" ? `, ${c.condition}` : "";
  const where = c.zip ? `, near ${c.zip}` : "";
  return `Tracking ${parts.join(" or ")} on ${fin}${down}${cond}${where}. I'll check every hour and alert you the moment one shows up.`;
}
