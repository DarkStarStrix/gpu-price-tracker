import { useEffect, useRef, useState } from "react";
import {
  catalog,
  fullCatalog,
  historyLoadError,
  loadCatalog,
  loadHistory,
} from "@/lib/catalog";

import { PriceTrends } from "./PriceTrends";

export function TrendsPanel({
  initialOfferId,
  belowFold = false,
}: {
  initialOfferId: string;
  belowFold?: boolean;
}) {
  const section = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!belowFold);
  const generatedAt = catalog.generatedAt;

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(section.current!);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (visible) void loadHistory().catch(() => {});
  }, [visible, generatedAt]);

  const loading = (
    <p role="status" className="p-5 text-sm text-muted-foreground">
      Loading price history…
    </p>
  );
  return (
    <div ref={section} className="min-h-[420px]">
      {visible && (
        <>
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
            />
          ) : historyLoadError ? null : (
            loading
          )}
        </>
      )}
    </div>
  );
}
