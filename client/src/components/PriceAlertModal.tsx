/*
  PriceAlertModal — set/edit/clear price alerts for a GPU model.
  Lightweight modal triggered from the OffersTable row action.
*/

import { Modal } from "./Modal";
import { useState, useEffect, useRef } from "react";
import { Bell, BellOff, X, Check } from "lucide-react";
import type { PriceAlert } from "../hooks/usePriceAlerts";

interface Props {
  gpuModelId: string;
  gpuModelName: string;
  currentPrice: number;
  existingAlert: PriceAlert | undefined;
  onSave: (gpuModelId: string, targetPrice: number) => void;
  onClear: (gpuModelId: string) => void;
  onClose: () => void;
}

export function PriceAlertModal({
  gpuModelId,
  gpuModelName,
  currentPrice,
  existingAlert,
  onSave,
  onClear,
  onClose,
}: Props) {
  const [value, setValue] = useState(
    existingAlert ? String(existingAlert.targetPrice) : String(Math.round(currentPrice * 0.9 * 100) / 100)
  );
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);



  const parsed = parseFloat(value);
  const isValid = !isNaN(parsed) && parsed > 0;

  function handleSave() {
    if (!isValid) return;
    onSave(gpuModelId, parsed);
    setSaved(true);
    setTimeout(onClose, 800);
  }

  function handleClear() {
    onClear(gpuModelId);
    onClose();
  }

  return (
    <Modal titleId="price-alert-title" onClose={onClose}>
      <div
        className="relative w-full max-w-sm bg-[var(--paper)] border border-border rounded-2xl shadow-[0_16px_60px_oklch(0.12_0.02_255_/_0.3)] animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.65_0.18_25_/_0.12)] flex items-center justify-center">
              <Bell className="w-4 h-4 text-[oklch(0.62_0.18_25)]" />
            </div>
            <div>
              <div id="price-alert-title" className="text-sm font-semibold text-foreground">Price Alert</div>
              <div className="font-data text-[10px] text-muted-foreground">{gpuModelName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="mono-label text-muted-foreground">Alert when price drops below</label>
              <span className="font-data text-[10px] text-muted-foreground">
                Current: <span className="text-foreground">${currentPrice.toFixed(2)}/hr</span>
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-muted-foreground">$</span>
              <input
                ref={inputRef}
                type="number"
                step="0.01"
                min="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                className={`w-full pl-7 pr-12 py-2.5 text-sm font-data border rounded-lg bg-card text-foreground outline-none transition-all duration-200 ${
                  isValid
                    ? "border-border focus:border-[oklch(0.62_0.19_218)] focus:ring-1 focus:ring-[oklch(0.62_0.19_218_/_0.2)]"
                    : "border-[oklch(0.62_0.18_25)] focus:border-[oklch(0.62_0.18_25)]"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-data text-[10px] text-muted-foreground">/hr</span>
            </div>
            {!isValid && value !== "" && (
              <p className="mt-1 text-[10px] text-[oklch(0.62_0.18_25)]">Enter a valid price greater than $0</p>
            )}
          </div>

          {existingAlert && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[oklch(0.65_0.18_25_/_0.08)] border border-[oklch(0.65_0.18_25_/_0.2)]">
              <Bell className="w-3 h-3 text-[oklch(0.62_0.18_25)]" />
              <span className="text-xs text-[oklch(0.45_0.12_25)]">
                Active alert at <span className="font-data font-semibold">${existingAlert.targetPrice.toFixed(2)}/hr</span>
              </span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Offers below this threshold will be highlighted with a coral glow in the table.
            Alerts are stored locally in your browser.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={!isValid || saved}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              saved
                ? "bg-[oklch(0.60_0.18_155)] text-white"
                : isValid
                ? "bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] hover:bg-[oklch(0.28_0.045_255)]"
                : "bg-[oklch(0.92_0.006_85)] text-muted-foreground cursor-not-allowed"
            }`}
          >
            {saved ? (
              <><Check className="w-3.5 h-3.5" /> Saved!</>
            ) : (
              <><Bell className="w-3.5 h-3.5" /> Set Alert</>
            )}
          </button>
          {existingAlert && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
            >
              <BellOff className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
