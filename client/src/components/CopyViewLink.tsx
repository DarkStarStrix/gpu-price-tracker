import { useState } from "react";
import { Link2 } from "lucide-react";

export function CopyViewLink({ url }: { url: string }) {
  const [copied, setCopied] = useState("");
  const [manual, setManual] = useState(false);
  return (
    <div className="min-w-0">
      <button
        type="button"
        className="offer-button inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(url);
            setManual(false);
          } catch {
            setManual(true);
          }
        }}
      >
        <Link2 size={15} aria-hidden="true" />
        {copied === url ? "Link copied" : "Copy share link"}
      </button>
      <span className="sr-only" role="status">
        {copied === url && "Share link copied"}
      </span>
      {manual && (
        <input
          aria-label="Share link"
          className="mt-2 block w-full rounded border border-border bg-background p-2 text-xs"
          readOnly
          value={url}
          onFocus={event => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
