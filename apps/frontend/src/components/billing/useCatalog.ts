"use client";

/**
 * The buyer's country/currency and the price catalog for it. Starts from the
 * choice remembered in this browser, else a guess from the time zone and
 * language; every change is remembered for next time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BillingCatalog } from "@intellia360/shared/types/api/billing";
import { fetchCatalog, guessCountry, loadRegion, saveRegion, type ApiResult, type Region } from "@/lib/billing";

export function useCatalog() {
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Only the latest request's answer is shown when choices change quickly.
  const request = useRef(0);

  const apply = useCallback((id: number, res: ApiResult<BillingCatalog>) => {
    if (id !== request.current) return;
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.message);
      return;
    }
    setError("");
    setCatalog(res.data);
    saveRegion({ country: res.data.country, currency: res.data.currency });
  }, []);

  const load = useCallback(
    (region: Region) => {
      const id = ++request.current;
      void fetchCatalog(region.country, region.currency).then((res) => apply(id, res));
    },
    [apply]
  );

  useEffect(() => {
    const region = loadRegion() ?? { country: guessCountry(), currency: null };
    const id = ++request.current;
    void fetchCatalog(region.country, region.currency).then((res) => apply(id, res));
  }, [apply]);

  const setCountry = useCallback(
    (country: string) => {
      setLoading(true);
      load({ country, currency: null });
    },
    [load]
  );
  const setCurrency = useCallback(
    (currency: string) => {
      if (!catalog) return;
      setLoading(true);
      load({ country: catalog.country, currency });
    },
    [catalog, load]
  );

  return { catalog, error, loading, setCountry, setCurrency };
}
