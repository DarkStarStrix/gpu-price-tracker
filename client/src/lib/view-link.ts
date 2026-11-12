export const historyPeriods = [
  [1, "1 hour"],
  [24, "24 hours"],
  [168, "7 days"],
] as const;
export type HistoryHours = (typeof historyPeriods)[number][0];
export type HistoryBounds = { start: number; end: number };

export const emptyOfferFilters = {
  billing: "",
  cloud: "",
  gpuModel: "",
  provider: "",
  availability: "",
  region: "",
  search: "",
  maxPrice: "",
};
export type OfferFilters = typeof emptyOfferFilters;

export type SharedView =
  | {
      view: "offers";
      ids: string[];
      filters: OfferFilters;
      hours: HistoryHours;
      through?: number;
    }
  | {
      view: "trends";
      id: string;
      gpu: string;
      billing: string;
      movers: boolean;
      hours: HistoryHours;
      through?: number;
      bounds?: HistoryBounds;
    };

const filterKeys = Object.keys(emptyOfferFilters) as (keyof OfferFilters)[];

export function readViewLink(search: string): SharedView | undefined {
  const params = new URLSearchParams(search);
  const ids = [
    ...new Set(params.getAll("offer").filter(id => id && id.length <= 300)),
  ].slice(0, 3);
  const value = Number(params.get("hours"));
  const hours = value === 1 || value === 24 ? value : 168;
  const timestamp = (key: string) => {
    const value = Number(params.get(key));
    return Number.isSafeInteger(value) && value > 0 && value <= 8.64e15
      ? value
      : undefined;
  };
  const through = timestamp("through");
  const anchored = through ? { through } : {};
  if (params.get("view") === "offers") {
    const filters = { ...emptyOfferFilters };
    for (const key of filterKeys) {
      const value = params.get(key)?.slice(0, 160) ?? "";
      filters[key] =
        key === "maxPrice" &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
          ? ""
          : value;
    }
    return { view: "offers", ids, filters, hours, ...anchored };
  }
  if (params.get("view") === "trends") {
    const start = timestamp("from");
    const end = timestamp("to");
    return {
      view: "trends",
      id: ids[0] ?? "",
      gpu: params.get("gpuModel")?.slice(0, 160) ?? "",
      billing: params.get("billing") === "spot" ? "spot" : "on-demand",
      movers: params.get("movers") === "1",
      hours,
      ...anchored,
      ...(start && end && start < end ? { bounds: { start, end } } : {}),
    };
  }
}

export function viewLink(state: SharedView, href: string) {
  const url = new URL(href);
  const params = new URLSearchParams({
    view: state.view,
    hours: String(state.hours),
  });
  if (state.through) params.set("through", String(state.through));
  if (state.view === "offers") {
    for (const id of state.ids) params.append("offer", id);
    for (const key of filterKeys) {
      if (state.filters[key]) params.set(key, state.filters[key]);
    }
  } else {
    if (state.id) params.set("offer", state.id);
    if (state.gpu) params.set("gpuModel", state.gpu);
    params.set("billing", state.billing);
    if (state.movers) params.set("movers", "1");
    if (state.bounds) {
      params.set("from", String(state.bounds.start));
      params.set("to", String(state.bounds.end));
    }
  }
  url.search = params.toString();
  url.hash = "";
  return url.href;
}
