/*
  Settings — GPU Price Tracker
  In-app API key management for Lambda, RunPod, and Vast.ai.
  Keys are saved to process.env at runtime; for persistence across restarts
  also set them in the Secrets panel in the Management UI.
*/

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Eye, EyeOff, Key, CheckCircle2, XCircle, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type KeyField = "lambda" | "runpod" | "vastai";

const PROVIDERS: { id: KeyField; name: string; docsUrl: string; hint: string }[] = [
  {
    id: "lambda",
    name: "Lambda Cloud",
    docsUrl: "https://cloud.lambdalabs.com/api-keys",
    hint: "cloud.lambdalabs.com → API Keys",
  },
  {
    id: "runpod",
    name: "RunPod",
    docsUrl: "https://www.runpod.io/console/user/settings",
    hint: "runpod.io → Settings → API Keys",
  },
  {
    id: "vastai",
    name: "Vast.ai",
    docsUrl: "https://vast.ai/console/account",
    hint: "vast.ai → Account → API Key",
  },
];

export default function Settings() {
  const { data: status, refetch } = trpc.settings.apiKeyStatus.useQuery();
  const saveMutation = trpc.settings.saveApiKeys.useMutation({
    onSuccess: () => {
      toast.success("API keys saved for this session.");
      refetch();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const [values, setValues] = useState<Record<KeyField, string>>({ lambda: "", runpod: "", vastai: "" });
  const [visible, setVisible] = useState<Record<KeyField, boolean>>({ lambda: false, runpod: false, vastai: false });

  function handleSave() {
    const payload: Record<string, string> = {};
    if (values.lambda.trim()) payload.lambda = values.lambda.trim();
    if (values.runpod.trim()) payload.runpod = values.runpod.trim();
    if (values.vastai.trim()) payload.vastai = values.vastai.trim();
    if (Object.keys(payload).length === 0) {
      toast.info("No keys entered — nothing to save.");
      return;
    }
    saveMutation.mutate(payload);
  }

  function handleClear(id: KeyField) {
    saveMutation.mutate({ [id]: "" });
    setValues(v => ({ ...v, [id]: "" }));
  }

  return (
    <div className="min-h-screen graph-paper grain">
      {/* Nav */}
      <header className="sticky top-0 z-50 glass-card border-b">
        <div className="container flex items-center gap-4 h-[60px]">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[oklch(0.62_0.19_218)]" />
            <span className="text-sm font-semibold text-foreground">API Key Settings</span>
          </div>
        </div>
      </header>

      <main className="container py-10 max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mono-label text-[oklch(0.62_0.19_218)] mb-2">Configuration</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Provider API Keys</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter your API keys to enable live data polling. Keys are applied immediately for this session.
            For persistence across server restarts, also add them in the{" "}
            <span className="font-medium text-foreground">Secrets</span> panel in the Management UI.
          </p>
        </div>

        {/* Key cards */}
        <div className="space-y-4 mb-8">
          {PROVIDERS.map(({ id, name, docsUrl, hint }) => {
            const isConfigured = status?.[id] ?? false;
            const isShown = visible[id];

            return (
              <div
                key={id}
                className={`rounded-xl border p-5 transition-all duration-200 ${
                  isConfigured
                    ? "border-[oklch(0.60_0.18_155_/_0.3)] bg-[oklch(0.60_0.18_155_/_0.04)]"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{name}</span>
                    {isConfigured ? (
                      <span className="flex items-center gap-1 text-[10px] font-data text-[oklch(0.50_0.16_155)] bg-[oklch(0.60_0.18_155_/_0.1)] px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-data text-muted-foreground bg-[oklch(0.92_0.006_85)] px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> Not set
                      </span>
                    )}
                  </div>
                  <a
                    href={docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[oklch(0.62_0.19_218)] hover:underline"
                  >
                    Get key →
                  </a>
                </div>

                <p className="text-xs text-muted-foreground mb-3">{hint}</p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={isShown ? "text" : "password"}
                      placeholder={isConfigured ? "••••••••••••••••  (key set)" : "Paste API key…"}
                      value={values[id]}
                      onChange={e => setValues(v => ({ ...v, [id]: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2 text-sm bg-[var(--paper)] border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[oklch(0.62_0.19_218_/_0.4)] focus:border-[oklch(0.62_0.19_218_/_0.4)] transition-all duration-200 font-mono placeholder:font-sans placeholder:text-muted-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(v => ({ ...v, [id]: !v[id] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {isConfigured && (
                    <button
                      onClick={() => handleClear(id)}
                      className="px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-[oklch(0.55_0.18_25)] hover:border-[oklch(0.65_0.18_25_/_0.3)] transition-all duration-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] rounded-lg hover:bg-[oklch(0.28_0.045_255)] disabled:opacity-50 transition-all duration-200 shadow-[0_2px_8px_oklch(0.22_0.045_255_/_0.25)]"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Saving…" : "Save Keys"}
        </button>

        {/* Note */}
        <p className="mt-6 text-xs text-muted-foreground leading-relaxed border-t border-border pt-4">
          <strong className="text-foreground font-medium">Note:</strong> Keys are stored in server memory only and applied to the next poll cycle (every 15 minutes).
          They are never logged or exposed in API responses. For permanent storage, use the Secrets panel in the Management UI.
        </p>
      </main>
    </div>
  );
}
