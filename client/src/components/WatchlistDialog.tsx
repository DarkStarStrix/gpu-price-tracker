import { useEffect, useState } from "react";
import { catalog } from "@/lib/catalog";
import { X } from "lucide-react";
import {
  computeListings,
  listingKind,
  listingUnit,
  type Listing,
} from "@shared/catalog";
import { watchSchema, type Watch } from "@shared/watchlist";
import { Modal } from "./Modal";

const API = import.meta.env.VITE_WATCH_API;
const TOKEN_KEY = "gpu-price-watch-device";
const EMPTY = { revision: null, watches: [] } as const;

interface Watchlist {
  revision: string | null;
  watches: readonly Watch[];
}

class WatchlistChanged extends Error {}

async function apiRequest<T>(
  path: string,
  token?: string,
  data?: unknown
): Promise<T> {
  const response = await fetch(new URL(path, API), {
    method: data ? "PUT" : "GET",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (response.status === 409) throw new WatchlistChanged();
  if (!response.ok)
    throw new Error("Watchlist service is temporarily unavailable.");
  return response.json();
}

function deviceToken() {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value =>
    value.toString(16).padStart(2, "0")
  ).join("");
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

async function subscription(publicKey: string) {
  const registration = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}watch-worker.js`,
    { scope: import.meta.env.BASE_URL }
  );
  const active = registration.active
    ? registration
    : await navigator.serviceWorker.ready;
  const current = await active.pushManager.getSubscription();
  if (current) return current.toJSON();
  const key = atob(publicKey.replaceAll("-", "+").replaceAll("_", "/"));
  const applicationServerKey = Uint8Array.from(key, char => char.charCodeAt(0));
  return (
    await active.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  ).toJSON();
}

export function WatchlistDialog({
  offer,
  onClose,
}: {
  offer: Listing | null;
  onClose: () => void;
}) {
  const [watchlist, setWatchlist] = useState<Watchlist>(EMPTY);
  const [publicKey, setPublicKey] = useState("");
  const [target, setTarget] = useState("");
  const [restock, setRestock] = useState(false);
  const [editing, setEditing] = useState<Watch | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const supported =
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    if (!API || !supported) return;
    let active = true;
    const load = async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const [config, saved] = await Promise.all([
          apiRequest<{ publicKey: string }>("/config"),
          token
            ? apiRequest<Watchlist>("/watchlist", token)
            : Promise.resolve(EMPTY),
        ]);
        if (!active) return;
        setPublicKey(config.publicKey);
        setWatchlist(saved);
        const existing = saved.watches.find(
          watch => watch.offerId === offer?.offerId
        );
        if (existing) {
          setEditing(existing);
          setTarget(existing.price?.toString() ?? "");
          setRestock(existing.restock);
        }
      } catch {
        if (active)
          setError(
            "Could not load background notifications. Reopen the watchlist to try again."
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [offer?.offerId, supported]);

  async function change(
    update: (current: readonly Watch[]) => Watch[],
    enable: boolean
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (enable && (await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Allow notifications in your browser to save this watch."
        );
      const token = deviceToken();
      const push = enable ? await subscription(publicKey) : undefined;
      const save = (current: Watchlist) => {
        const watches = update(current.watches);
        if (watches.length > 20)
          throw new Error(
            "Remove a watch before adding another. This browser can save 20."
          );
        return apiRequest<Watchlist>("/watchlist", token, {
          revision: current.revision,
          subscription: push,
          watches,
        });
      };
      let updated: Watchlist;
      try {
        updated = await save(watchlist);
      } catch (error) {
        if (!(error instanceof WatchlistChanged)) throw error;
        updated = await save(await apiRequest<Watchlist>("/watchlist", token));
      }
      setWatchlist(updated);
      setStatus(
        enable
          ? "Watch saved. Alerts use future provider observations."
          : "Watch removed."
      );
      if (!enable) {
        setEditing(null);
        setTarget("");
        setRestock(false);
      }
    } catch (error) {
      setError(
        error instanceof WatchlistChanged
          ? "The watchlist changed in another tab. Reopen it and try again."
          : error instanceof Error
            ? error.message
            : "Could not update the watchlist."
      );
    } finally {
      setBusy(false);
    }
  }

  const listing =
    editing ??
    (offer
      ? {
          offerId: offer.offerId,
          label:
            `${offer.providerName} · ${offer.gpuModelName} · ${offer.region}`.slice(
              0,
              180
            ),
        }
      : null);

  const kind = listingKind(listing?.offerId ?? "");
  const currentListing =
    kind === "gpu"
      ? undefined
      : offer?.offerId === listing?.offerId
        ? offer
        : computeListings(catalog, kind).find(
            item => item.offerId === listing?.offerId
          );
  const canWatchStock =
    kind === "gpu" ||
    (currentListing?.dataSource === "api" &&
      currentListing.availability !== "unknown") ||
    (!currentListing && !!editing?.restock);

  return (
    <Modal titleId="watchlist-title" onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="watchlist-title" className="text-lg font-semibold">
            Price & stock watchlist
          </h2>
          <button
            type="button"
            aria-label="Close watchlist"
            className="rounded p-2 hover:bg-muted"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {!API ? (
          <p className="text-sm text-muted-foreground">
            Background notifications are currently unavailable.
          </p>
        ) : !supported ? (
          <p className="text-sm text-muted-foreground">
            This browser does not support background notifications.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Watch exact listings on this browser. Alerts arrive after a new
              observation crosses your price or reports available stock.
            </p>
            {listing && (
              <form
                className="space-y-3 rounded-lg border border-border p-3"
                onSubmit={event => {
                  event.preventDefault();
                  const result = watchSchema.safeParse({
                    ...listing,
                    price: target.trim() ? Number(target) : null,
                    restock: canWatchStock && restock,
                  });
                  if (!result.success) {
                    setError(
                      "Enter a positive price target or select available stock."
                    );
                    return;
                  }
                  void change(
                    current => [
                      ...current.filter(w => w.offerId !== listing.offerId),
                      result.data,
                    ],
                    true
                  );
                }}
              >
                <p className="text-xs font-medium">{listing.label}</p>
                <label className="offer-field">
                  Target USD / {listingUnit(kind)}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={target}
                    placeholder="Optional"
                    onChange={event => setTarget(event.target.value)}
                  />
                </label>
                {canWatchStock ? (
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-teal"
                      checked={restock}
                      onChange={event => setRestock(event.target.checked)}
                    />
                    Alert when the provider reports available stock
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This source does not report stock.
                  </p>
                )}
                <button
                  type="submit"
                  className="offer-button offer-button--primary"
                  disabled={!publicKey || busy}
                >
                  Save watch
                </button>
              </form>
            )}
            {watchlist.watches.length ? (
              <ul className="divide-y divide-border">
                {watchlist.watches.map(watch => (
                  <li
                    key={watch.offerId}
                    className="flex items-center justify-between gap-2 py-2 text-xs"
                  >
                    <button
                      type="button"
                      className="min-w-0 text-left underline"
                      disabled={busy}
                      onClick={() => {
                        setEditing(watch);
                        setTarget(watch.price?.toString() ?? "");
                        setRestock(watch.restock);
                      }}
                    >
                      {watch.label}
                    </button>
                    <button
                      type="button"
                      className="offer-text-button shrink-0"
                      disabled={!publicKey || busy}
                      aria-label={`Remove watch for ${watch.label}`}
                      onClick={() =>
                        void change(
                          current =>
                            current.filter(w => w.offerId !== watch.offerId),
                          false
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              !listing && (
                <p className="text-sm text-muted-foreground">
                  {publicKey
                    ? "Choose a listing in Offers to add a watch."
                    : "Checking notification service…"}
                </p>
              )
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="text-xs text-teal">
            {status}
          </p>
        )}
      </div>
    </Modal>
  );
}
