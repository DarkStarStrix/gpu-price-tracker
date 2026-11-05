import { useState, useCallback, useRef } from "react";
import { z } from "zod";

const alertSchema = z.object({
  gpuModelId: z.string().min(1).max(200),
  targetPrice: z.number().finite().positive(),
  createdAt: z.number().finite().nonnegative(),
});
export type PriceAlert = z.infer<typeof alertSchema>;
const STORAGE_KEY = "gpu-price-alerts";
type Alerts = Record<string, PriceAlert>;
function loadAlerts(): Alerts {
  const alerts: Alerts = Object.create(null);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return alerts;
    for (const [key, value] of Object.entries(raw)) {
      const checked = alertSchema.safeParse(value);
      if (checked.success && checked.data.gpuModelId === key)
        alerts[key] = checked.data;
    }
  } catch {
    /* Malformed or inaccessible storage must not prevent browsing. */
  }
  return alerts;
}

export function usePriceAlerts() {
  const [alerts, setAlertsState] = useState<Alerts>(loadAlerts);
  const current = useRef(alerts);
  const [storageError, setStorageError] = useState(false);
  const persist = useCallback((next: Alerts) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      current.current = next;
      setAlertsState(next);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }, []);
  const setAlert = useCallback(
    (gpuModelId: string, targetPrice: number) => {
      const checked = alertSchema.safeParse({
        gpuModelId,
        targetPrice,
        createdAt: Date.now(),
      });
      if (!checked.success) return false;
      return persist(
        Object.assign(Object.create(null), current.current, {
          [gpuModelId]: checked.data,
        })
      );
    },
    [persist]
  );
  const clearAlert = useCallback(
    (gpuModelId: string) => {
      const next: Alerts = Object.assign(Object.create(null), current.current);
      delete next[gpuModelId];
      return persist(next);
    },
    [persist]
  );
  const getAlert = useCallback(
    (gpuModelId: string) => alerts[gpuModelId],
    [alerts]
  );
  const isAlertTriggered = useCallback(
    (gpuModelId: string, pricePerGpuHr: number) => {
      const alert = alerts[gpuModelId];
      return !!alert && pricePerGpuHr <= alert.targetPrice;
    },
    [alerts]
  );
  return {
    alerts,
    setAlert,
    clearAlert,
    getAlert,
    isAlertTriggered,
    storageError,
    alertCount: Object.keys(alerts).length,
  };
}
