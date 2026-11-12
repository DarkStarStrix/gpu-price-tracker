import { useEffect } from "react";
import {
  catalog,
  fullCatalog,
  historyLoadError,
  loadCatalog,
  loadHistory,
} from "@/lib/catalog";

import { PriceTrends } from "./PriceTrends";
import type { SharedView } from "@/lib/view-link";

export function TrendsPanel({
  initialOfferId,
  shared,
}: {
  initialOfferId: string;
  shared?: Extract<SharedView, { view: "trends" }>;
}) {
  const generatedAt = catalog.generatedAt;

  useEffect(() => {
    void loadHistory().catch(() => {});
  }, [generatedAt]);

  const loading = (
    <p role="status" className="p-5 text-sm text-muted-foreground">
      Loading price history…
    </p>
  );
  return (
    <div className="min-h-[420px]">
      {historyLoadError && (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Price history could not be updated.{" "}
          <button
            className="underline"
            onClick={() =>
              void loadCatalog()
                .catch(() => {})
                .then(loadHistory)
                .catch(() => {})
            }
          >
            Try again
          </button>
        </p>
      )}
      {fullCatalog && fullCatalog.generatedAt !== generatedAt && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing history from{" "}
          {new Date(fullCatalog.generatedAt).toLocaleString()}.
        </p>
      )}
      {fullCatalog ? (
        <PriceTrends
          snapshot={fullCatalog}
          initialOfferId={initialOfferId}
          shared={shared}
        />
      ) : historyLoadError ? null : (
        loading
      )}
    </div>
  );
}
