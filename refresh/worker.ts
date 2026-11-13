import type { ExportedHandler } from "@cloudflare/workers-types";

const workflow =
  "https://api.github.com/repos/DarkStarStrix/gpu-price-tracker/actions/workflows/pages.yml";
const graceMs = 4 * 60_000;
const expiryWarningMs = 7 * 24 * 60 * 60_000;

interface Env {
  GITHUB_ACTIONS_TOKEN?: string;
}

interface WorkflowRun {
  status: string;
  conclusion: string | null;
  created_at: string;
}

function githubFailure(operation: string, response: Response) {
  const { status, headers } = response;
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (headers.get("x-ratelimit-remaining") === "0" ||
        headers.has("retry-after")));
  const hint = rateLimited
    ? ": GitHub rate limit"
    : status === 401
      ? ": credential rejected; check expiry or revocation"
      : status === 403 && operation === "dispatch"
        ? ": check Actions write access and repository scope"
        : "";
  return new Error(
    `GitHub workflow ${operation} failed (HTTP ${status})${hint}`
  );
}

export async function checkRefresh(
  scheduledTime: number,
  token: string,
  request = fetch
) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "gpu-price-tracker-refresh",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const options = {
    headers,
    // Workers supports manual redirects. The response checks reject every 3xx.
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  } as const;
  const response = await request(
    `${workflow}/runs?branch=main&per_page=10`,
    options
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw githubFailure("status request", response);
  }
  const expiration = response.headers.get(
    "github-authentication-token-expiration"
  );
  const expiresAt = expiration ? Date.parse(expiration) : NaN;
  if (
    expiresAt > scheduledTime &&
    expiresAt - scheduledTime <= expiryWarningMs
  ) {
    console.warn(
      JSON.stringify({
        event: "collector_backup_token_expiring",
        expiresAt: new Date(expiresAt).toISOString(),
      })
    );
  }

  const { workflow_runs: runs } = (await response.json()) as {
    workflow_runs: WorkflowRun[];
  };
  if (!Array.isArray(runs)) throw new Error("GitHub workflow list is missing");
  if (runs.some(run => run.status !== "completed")) return "already-running";
  if (
    runs.some(
      run =>
        run.conclusion === "success" &&
        Date.parse(run.created_at) >= scheduledTime - graceMs
    )
  )
    return "already-refreshed";

  const dispatched = await request(`${workflow}/dispatches`, {
    ...options,
    signal: AbortSignal.timeout(15_000),
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  await dispatched.body?.cancel();
  if (!dispatched.ok) throw githubFailure("dispatch", dispatched);
  return "dispatched";
}

export default {
  async scheduled(controller, env) {
    if (!env.GITHUB_ACTIONS_TOKEN)
      throw new Error("GITHUB_ACTIONS_TOKEN is missing");
    const result = await checkRefresh(
      controller.scheduledTime,
      env.GITHUB_ACTIONS_TOKEN
    );
    console.log(JSON.stringify({ event: "collector_backup", result }));
  },
} satisfies ExportedHandler<Env>;
