import type { EnrichedOrte } from '@/types/enriched';
import type { Kategorien, Orte } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface OrteMaps {
  kategorienMap: Map<string, Kategorien>;
}

export function enrichOrte(
  orte: Orte[],
  maps: OrteMaps
): EnrichedOrte[] {
  return orte.map(r => ({
    ...r,
    kategorieName: resolveDisplay(r.fields.kategorie, maps.kategorienMap, 'kategorie_name'),
  }));
}
