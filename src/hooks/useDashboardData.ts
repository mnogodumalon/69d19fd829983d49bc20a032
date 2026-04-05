import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Kategorien, Orte } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [kategorien, setKategorien] = useState<Kategorien[]>([]);
  const [orte, setOrte] = useState<Orte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [kategorienData, orteData] = await Promise.all([
        LivingAppsService.getKategorien(),
        LivingAppsService.getOrte(),
      ]);
      setKategorien(kategorienData);
      setOrte(orteData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [kategorienData, orteData] = await Promise.all([
          LivingAppsService.getKategorien(),
          LivingAppsService.getOrte(),
        ]);
        setKategorien(kategorienData);
        setOrte(orteData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const kategorienMap = useMemo(() => {
    const m = new Map<string, Kategorien>();
    kategorien.forEach(r => m.set(r.record_id, r));
    return m;
  }, [kategorien]);

  return { kategorien, setKategorien, orte, setOrte, loading, error, fetchAll, kategorienMap };
}