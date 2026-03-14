/*
  usePriceAlerts — localStorage-persisted price alert system.
  Stores target prices per GPU model ID.
  Exposes helpers to set/clear alerts and check if an offer is below threshold.
*/

import { useState, useCallback, useEffect } from "react";

export interface PriceAlert {
  gpuModelId: string;
  targetPrice: number;
  createdAt: number;
}

const STORAGE_KEY = "gpu-price-alerts";

function loadAlerts(): Record<string, PriceAlert> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAlerts(alerts: Record<string, PriceAlert>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export function usePriceAlerts() {
  const [alerts, setAlertsState] = useState<Record<string, PriceAlert>>(loadAlerts);

  // Sync to localStorage on change
  useEffect(() => {
    saveAlerts(alerts);
  }, [alerts]);

  const setAlert = useCallback((gpuModelId: string, targetPrice: number) => {
    setAlertsState(prev => ({
      ...prev,
      [gpuModelId]: { gpuModelId, targetPrice, createdAt: Date.now() },
    }));
  }, []);

  const clearAlert = useCallback((gpuModelId: string) => {
    setAlertsState(prev => {
      const next = { ...prev };
      delete next[gpuModelId];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setAlertsState({});
  }, []);

  const getAlert = useCallback((gpuModelId: string): PriceAlert | undefined => {
    return alerts[gpuModelId];
  }, [alerts]);

  /**
   * Returns true if this offer's pricePerGpuHr is at or below the alert threshold.
   * Used to apply coral glow highlight in the table.
   */
  const isAlertTriggered = useCallback((gpuModelId: string, pricePerGpuHr: number): boolean => {
    const alert = alerts[gpuModelId];
    if (!alert) return false;
    return pricePerGpuHr <= alert.targetPrice;
  }, [alerts]);

  return {
    alerts,
    setAlert,
    clearAlert,
    clearAll,
    getAlert,
    isAlertTriggered,
    alertCount: Object.keys(alerts).length,
  };
}
