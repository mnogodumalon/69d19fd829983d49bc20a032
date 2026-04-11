import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichOrte } from '@/lib/enrich';
import type { EnrichedOrte } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { OrteDialog } from '@/components/dialogs/OrteDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconMapPin, IconPlus, IconPencil, IconTrash, IconSearch,
  IconStar, IconCheckbox, IconClock, IconCategory, IconPhone,
  IconWorld, IconX, IconMap, IconLayoutGrid,
  IconCalendar, IconChevronLeft, IconChevronRight,
} from '@tabler/icons-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
  addWeeks, subWeeks, addDays, subDays, addYears, subYears,
} from 'date-fns';
import { de } from 'date-fns/locale';

const APPGROUP_ID = '69d19fd829983d49bc20a032';
const REPAIR_ENDPOINT = '/claude/build/repair';

const RATING_STARS: Record<string, number> = {
  rating_1: 1, rating_2: 2, rating_3: 3, rating_4: 4, rating_5: 5,
};

// Custom Leaflet-Marker (außerhalb Komponente für stabile Referenz)
const visitedIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -18],
});

const unvisitedIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;background:#f59e0b;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -18],
});

const selectedMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="width:38px;height:38px;background:#6366f1;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px rgba(99,102,241,0.25),0 4px 16px rgba(99,102,241,0.5)"></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -22],
});

function StarRating({ value }: { value: string | undefined }) {
  if (!value) return null;
  const count = RATING_STARS[value] ?? 0;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <IconStar
          key={i}
          size={12}
          className={i <= count ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}
        />
      ))}
    </div>
  );
}

export default function DashboardOverview() {
  const {
    kategorien, orte,
    kategorienMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedOrte = enrichOrte(orte, { kategorienMap });

  // Alle Hooks VOR early returns!
  const [view, setView] = useState<'cards' | 'map'>('map');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'visited' | 'unvisited'>('all');
  const [selectedKategorie, setSelectedKategorie] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedOrte | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedOrte | null>(null);
  const [detailOrt, setDetailOrt] = useState<EnrichedOrte | null>(null);
  const [highlightMapId, setHighlightMapId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = enrichedOrte;
    if (activeTab === 'visited') result = result.filter(o => o.fields.bereits_besucht);
    if (activeTab === 'unvisited') result = result.filter(o => !o.fields.bereits_besucht);
    if (selectedKategorie !== 'all') result = result.filter(o => o.kategorieName === selectedKategorie);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        (o.fields.ort_name ?? '').toLowerCase().includes(q) ||
        (o.fields.stadt ?? '').toLowerCase().includes(q) ||
        (o.fields.beschreibung ?? '').toLowerCase().includes(q) ||
        o.kategorieName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [enrichedOrte, activeTab, selectedKategorie, search]);

  const visitedCount = useMemo(() => orte.filter(o => o.fields.bereits_besucht).length, [orte]);
  const unvisitedCount = useMemo(() => orte.filter(o => !o.fields.bereits_besucht).length, [orte]);
  const kategorienNames = useMemo(() => {
    const names = new Set(enrichedOrte.map(o => o.kategorieName).filter(Boolean));
    return Array.from(names).sort();
  }, [enrichedOrte]);

  const mapPoints = useMemo(() =>
    filtered
      .filter(o => o.fields.standort)
      .map(o => [o.fields.standort!.lat, o.fields.standort!.long] as [number, number]),
    [filtered]
  );

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteOrteEntry(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  };

  const handleToggleVisited = async (ort: EnrichedOrte) => {
    await LivingAppsService.updateOrteEntry(ort.record_id, {
      ...ort.fields,
      bereits_besucht: !ort.fields.bereits_besucht,
    });
    fetchAll();
  };

  const handleShowOnMap = (ort: EnrichedOrte) => {
    setView('map');
    setHighlightMapId(ort.record_id);
  };

  const handleEdit = (ort: EnrichedOrte) => {
    setEditRecord(ort);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditRecord(null);
    setDialogOpen(true);
  };

  const defaultValuesForEdit = editRecord ? {
    ...editRecord.fields,
    kategorie: editRecord.fields.kategorie
      ? createRecordUrl(APP_IDS.KATEGORIEN, editRecord.fields.kategorie.replace(/.*\//, ''))
      : undefined,
  } : undefined;

  return (
    <div className="space-y-6">
      {/* KPI Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Gesamt"
          value={String(orte.length)}
          description="Lieblingsorte"
          icon={<IconMapPin size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Besucht"
          value={String(visitedCount)}
          description="bereits besucht"
          icon={<IconCheckbox size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Noch offen"
          value={String(unvisitedCount)}
          description="möchte ich besuchen"
          icon={<IconClock size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Kategorien"
          value={String(kategorien.length)}
          description="verschiedene"
          icon={<IconCategory size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Fortschrittsbalken */}
      {orte.length > 0 && (
        <div className="bg-card border border-border rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Besuchsfortschritt</span>
            <span className="text-sm text-muted-foreground">{visitedCount} von {orte.length} besucht</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${(visitedCount / orte.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {Math.round((visitedCount / orte.length) * 100)}% deiner Lieblingsorte bereits besucht
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'visited', 'unvisited'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab === 'all' ? 'Alle' : tab === 'visited' ? 'Besucht' : 'Noch offen'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Ansicht-Umschalter */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <button
              onClick={() => setView('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                view === 'cards'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <IconLayoutGrid size={15} className="shrink-0" />
              <span className="hidden sm:inline">Karten</span>
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                view === 'map'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <IconMap size={15} className="shrink-0" />
              <span className="hidden sm:inline">Karte</span>
            </button>
          </div>
          <Button onClick={handleCreate} size="sm">
            <IconPlus size={16} className="mr-1 shrink-0" />
            <span className="hidden sm:inline">Ort hinzufügen</span>
            <span className="sm:hidden">Neu</span>
          </Button>
        </div>
      </div>

      {/* Filter & Suche */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
          <Input
            placeholder="Orte durchsuchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedKategorie('all')}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              selectedKategorie === 'all'
                ? 'bg-secondary text-secondary-foreground font-medium'
                : 'border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            Alle Kategorien
          </button>
          {kategorienNames.map(name => (
            <button
              key={name}
              onClick={() => setSelectedKategorie(name)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedKategorie === name
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'border border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Hauptinhalt: Karten oder Karte */}
      {view === 'map' ? (
        <MapView
          orte={filtered}
          mapPoints={mapPoints}
          onEdit={handleEdit}
          onDelete={ort => setDeleteTarget(ort)}
          highlightId={highlightMapId ?? undefined}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <IconMapPin size={48} className="text-muted-foreground" stroke={1.5} />
          <div>
            <p className="font-medium text-foreground">Keine Orte gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? 'Versuche einen anderen Suchbegriff.' : 'Füge deinen ersten Lieblingsort hinzu!'}
            </p>
          </div>
          {!search && (
            <Button onClick={handleCreate} size="sm">
              <IconPlus size={16} className="mr-1 shrink-0" />
              Ort hinzufügen
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(ort => (
            <OrtCard
              key={ort.record_id}
              ort={ort}
              onEdit={() => handleEdit(ort)}
              onDelete={() => setDeleteTarget(ort)}
              onDetail={() => setDetailOrt(ort)}
              onToggleVisited={() => handleToggleVisited(ort)}
              onShowOnMap={ort.fields.standort ? () => handleShowOnMap(ort) : undefined}
            />
          ))}
        </div>
      )}

      {/* Detail-Panel */}
      {detailOrt && (
        <OrtDetailPanel
          ort={detailOrt}
          onClose={() => setDetailOrt(null)}
          onEdit={() => { handleEdit(detailOrt); setDetailOrt(null); }}
          onDelete={() => { setDeleteTarget(detailOrt); setDetailOrt(null); }}
        />
      )}

      {/* Besuchskalender */}
      <OrtCalendar
        orte={enrichedOrte}
        onDetail={setDetailOrt}
      />

      {/* Dialog */}
      <OrteDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={async (fields) => {
          if (editRecord) {
            await LivingAppsService.updateOrteEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createOrteEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={defaultValuesForEdit}
        kategorienList={kategorien}
        enablePhotoScan={AI_PHOTO_SCAN['Orte']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Orte']}
      />

      {/* Löschen bestätigen */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Ort löschen"
        description={`Möchtest du „${deleteTarget?.fields.ort_name ?? 'diesen Ort'}" wirklich löschen?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Karten-Ansicht ──────────────────────────────────────────────────────────

function MapView({
  orte,
  mapPoints,
  onEdit,
  onDelete,
  highlightId,
}: {
  orte: EnrichedOrte[];
  mapPoints: [number, number][];
  onEdit: (ort: EnrichedOrte) => void;
  onDelete: (ort: EnrichedOrte) => void;
  highlightId?: string;
}) {
  const [selected, setSelected] = useState<EnrichedOrte | null>(null);

  useEffect(() => {
    if (highlightId) {
      const ort = orte.find(o => o.record_id === highlightId);
      if (ort) setSelected(ort);
    }
  }, [highlightId, orte]);
  const orteWithCoords = orte.filter(o => o.fields.standort);
  const orteWithoutCoords = orte.length - orteWithCoords.length;
  const visitedOnMap = orteWithCoords.filter(o => o.fields.bereits_besucht).length;
  const unvisitedOnMap = orteWithCoords.filter(o => !o.fields.bereits_besucht).length;

  const defaultCenter: [number, number] = orteWithCoords.length > 0
    ? [orteWithCoords[0].fields.standort!.lat, orteWithCoords[0].fields.standort!.long]
    : [51.1657, 10.4515];

  const selectedAddress = selected
    ? [selected.fields.strasse, selected.fields.hausnummer, selected.fields.postleitzahl, selected.fields.stadt, selected.fields.land].filter(Boolean).join(', ')
    : '';

  return (
    <div className="space-y-3">
      {orteWithoutCoords > 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <IconMapPin size={13} className="shrink-0" />
          {orteWithoutCoords} {orteWithoutCoords === 1 ? 'Ort hat' : 'Orte haben'} keine Koordinaten und {orteWithoutCoords === 1 ? 'wird' : 'werden'} nicht auf der Karte angezeigt.
        </p>
      )}

      {orteWithCoords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center border border-dashed border-border rounded-2xl">
          <IconMap size={48} className="text-muted-foreground" stroke={1.5} />
          <div>
            <p className="font-medium text-foreground">Keine Standorte vorhanden</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Füge Koordinaten zu deinen Orten hinzu (GPS-Feld beim Bearbeiten), um sie auf der Karte zu sehen.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: Karte + Side-Panel nebeneinander */}
          <div
            className="flex rounded-2xl overflow-hidden border border-border shadow-sm"
            style={{ height: '72vh', minHeight: '500px' }}
          >
            {/* Karte */}
            <div className="relative flex-1 min-w-0">
              <MapContainer
                center={defaultCenter}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
                />
                <FitBounds points={mapPoints} />
                {orteWithCoords.map(ort => (
                  <Marker
                    key={ort.record_id}
                    position={[ort.fields.standort!.lat, ort.fields.standort!.long]}
                    icon={
                      selected?.record_id === ort.record_id
                        ? selectedMarkerIcon
                        : ort.fields.bereits_besucht ? visitedIcon : unvisitedIcon
                    }
                    eventHandlers={{ click: () => setSelected(ort) }}
                  />
                ))}
              </MapContainer>

              {/* Legende */}
              <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2.5 shadow-md text-xs space-y-1.5 pointer-events-none">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm shrink-0" />
                  <span className="text-gray-700 font-medium">Besucht ({visitedOnMap})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-white shadow-sm shrink-0" />
                  <span className="text-gray-700 font-medium">Geplant ({unvisitedOnMap})</span>
                </div>
                {!selected && (
                  <p className="text-gray-400 pt-1 border-t border-gray-100">Marker anklicken</p>
                )}
              </div>
            </div>

            {/* Side-Panel (Desktop) */}
            {selected && (
              <div className="hidden sm:flex w-80 shrink-0 flex-col bg-card border-l border-border overflow-hidden">
                {/* Hero-Foto */}
                {selected.fields.fotos ? (
                  <div className="h-48 shrink-0 overflow-hidden relative">
                    <img
                      src={selected.fields.fotos}
                      alt={selected.fields.ort_name ?? ''}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-10">
                      <h3 className="font-bold text-white text-base leading-tight truncate drop-shadow">
                        {selected.fields.ort_name ?? 'Unbenannter Ort'}
                      </h3>
                      {selected.kategorieName && (
                        <span className="text-white/80 text-xs">{selected.kategorieName}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="absolute top-2.5 right-2.5 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="h-24 shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-between px-4">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-foreground truncate">
                        {selected.fields.ort_name ?? 'Unbenannter Ort'}
                      </h3>
                      {selected.kategorieName && (
                        <span className="text-xs text-muted-foreground">{selected.kategorieName}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                )}

                {/* Detail-Inhalt */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Status + Bewertung */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      selected.fields.bereits_besucht
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {selected.fields.bereits_besucht ? '✓ Besucht' : '○ Noch offen'}
                    </span>
                    {selected.fields.bewertung?.key && <StarRating value={selected.fields.bewertung.key} />}
                    {selected.fields.bewertung?.label && (
                      <span className="text-xs text-muted-foreground">{selected.fields.bewertung.label}</span>
                    )}
                  </div>

                  {/* Beschreibung */}
                  {selected.fields.beschreibung && (
                    <p className="text-sm text-foreground leading-relaxed">{selected.fields.beschreibung}</p>
                  )}

                  {/* Infos */}
                  <div className="space-y-2.5">
                    {selectedAddress && (
                      <div className="flex items-start gap-2.5 min-w-0">
                        <IconMapPin size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground leading-snug">{selectedAddress}</span>
                      </div>
                    )}
                    {selected.fields.telefon && (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <IconPhone size={14} className="text-muted-foreground shrink-0" />
                        <a href={`tel:${selected.fields.telefon}`} className="text-sm text-primary hover:underline truncate">
                          {selected.fields.telefon}
                        </a>
                      </div>
                    )}
                    {selected.fields.website && (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <IconWorld size={14} className="text-muted-foreground shrink-0" />
                        <a href={selected.fields.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">
                          {selected.fields.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {selected.fields.oeffnungszeiten && (
                      <div className="flex items-start gap-2.5 min-w-0">
                        <IconClock size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{selected.fields.oeffnungszeiten}</span>
                      </div>
                    )}
                    {selected.fields.besuchsdatum && (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <IconCheckbox size={14} className="text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">Besucht am {formatDate(selected.fields.besuchsdatum)}</span>
                      </div>
                    )}
                    {selected.fields.standort && (
                      <a
                        href={`https://www.google.com/maps?q=${selected.fields.standort.lat},${selected.fields.standort.long}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-sm text-primary hover:underline"
                      >
                        <IconMap size={14} className="shrink-0" />
                        Auf Google Maps öffnen
                      </a>
                    )}
                  </div>

                  {/* Persönliche Notizen */}
                  {selected.fields.notizen_nach_besuch && (
                    <div className="bg-muted/60 rounded-xl p-3 border border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Notizen</p>
                      <p className="text-sm text-foreground leading-relaxed">{selected.fields.notizen_nach_besuch}</p>
                    </div>
                  )}

                  {/* Aktionen */}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => onEdit(selected)} className="flex-1" size="sm">
                      <IconPencil size={14} className="mr-1.5 shrink-0" />
                      Bearbeiten
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onDelete(selected); setSelected(null); }}
                      className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                    >
                      <IconTrash size={14} className="shrink-0" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Detail-Panel (unterhalb der Karte) */}
          {selected && (
            <div className="sm:hidden bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              {selected.fields.fotos && (
                <div className="h-40 overflow-hidden relative">
                  <img src={selected.fields.fotos} alt={selected.fields.ort_name ?? ''} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base leading-tight text-foreground truncate">
                      {selected.fields.ort_name ?? 'Unbenannter Ort'}
                    </h3>
                    {selected.kategorieName && (
                      <span className="text-xs text-muted-foreground">{selected.kategorieName}</span>
                    )}
                  </div>
                  <button onClick={() => setSelected(null)} className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <IconX size={15} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    selected.fields.bereits_besucht ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selected.fields.bereits_besucht ? '✓ Besucht' : '○ Noch offen'}
                  </span>
                  {selected.fields.bewertung?.key && <StarRating value={selected.fields.bewertung.key} />}
                </div>
                {selected.fields.beschreibung && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{selected.fields.beschreibung}</p>
                )}
                {selectedAddress && (
                  <div className="flex items-start gap-2 min-w-0">
                    <IconMapPin size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-xs text-muted-foreground">{selectedAddress}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button onClick={() => onEdit(selected)} className="flex-1" size="sm">
                    <IconPencil size={14} className="mr-1 shrink-0" />
                    Bearbeiten
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { onDelete(selected); setSelected(null); }}
                    className="text-destructive hover:text-destructive"
                  >
                    <IconTrash size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
  }, [map, points]);
  return null;
}

// ─── Ort-Karte ───────────────────────────────────────────────────────────────

function OrtCard({
  ort,
  onEdit,
  onDelete,
  onDetail,
  onToggleVisited,
  onShowOnMap,
}: {
  ort: EnrichedOrte;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onToggleVisited: () => void;
  onShowOnMap?: () => void;
}) {
  const address = [ort.fields.strasse, ort.fields.hausnummer, ort.fields.postleitzahl, ort.fields.stadt]
    .filter(Boolean).join(' ');
  const rating = ort.fields.bewertung?.key;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Foto */}
      {ort.fields.fotos ? (
        <div className="h-40 overflow-hidden bg-muted">
          <img
            src={ort.fields.fotos}
            alt={ort.fields.ort_name ?? ''}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <IconMapPin size={40} className="text-muted-foreground/30" stroke={1.5} />
        </div>
      )}

      {/* Inhalt */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <button
              onClick={onDetail}
              className="text-left font-semibold text-foreground hover:text-primary transition-colors leading-tight truncate block w-full"
            >
              {ort.fields.ort_name ?? 'Unbenannter Ort'}
            </button>
            {ort.kategorieName && (
              <span className="text-xs text-muted-foreground truncate block mt-0.5">
                {ort.kategorieName}
              </span>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggleVisited(); }}
            title={ort.fields.bereits_besucht ? 'Als nicht besucht markieren' : 'Als besucht markieren'}
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
              ort.fields.bereits_besucht
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            {ort.fields.bereits_besucht ? '✓ Besucht' : '○ Offen'}
          </button>
        </div>

        {rating && <StarRating value={rating} />}

        {address && (
          <div className="flex items-center gap-1.5 min-w-0">
            <IconMapPin size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{address}</span>
          </div>
        )}

        {ort.fields.besuchsdatum && (
          <div className="flex items-center gap-1.5 min-w-0">
            <IconCheckbox size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              Besucht am {formatDate(ort.fields.besuchsdatum)}
            </span>
          </div>
        )}

        {ort.fields.beschreibung && (
          <p className="text-xs text-muted-foreground line-clamp-2">{ort.fields.beschreibung}</p>
        )}

        <div className="flex gap-2 mt-auto pt-1">
          <Button variant="outline" size="sm" onClick={onEdit} className="flex-1">
            <IconPencil size={14} className="mr-1 shrink-0" />
            Bearbeiten
          </Button>
          {onShowOnMap && (
            <Button variant="outline" size="sm" onClick={onShowOnMap} title="Auf Karte anzeigen">
              <IconMap size={14} className="shrink-0" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <IconTrash size={14} className="shrink-0" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ort-Detailpanel ─────────────────────────────────────────────────────────

function OrtDetailPanel({
  ort,
  onClose,
  onEdit,
  onDelete,
}: {
  ort: EnrichedOrte;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const address = [ort.fields.strasse, ort.fields.hausnummer, ort.fields.postleitzahl, ort.fields.stadt, ort.fields.land]
    .filter(Boolean).join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {ort.fields.fotos && (
          <div className="h-52 overflow-hidden rounded-t-2xl">
            <img src={ort.fields.fotos} alt={ort.fields.ort_name ?? ''} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{ort.fields.ort_name ?? 'Unbenannter Ort'}</h2>
              {ort.kategorieName && (
                <span className="text-sm text-muted-foreground">{ort.kategorieName}</span>
              )}
            </div>
            <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors">
              <IconX size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              ort.fields.bereits_besucht
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {ort.fields.bereits_besucht ? 'Bereits besucht' : 'Noch nicht besucht'}
            </span>
            {ort.fields.bewertung?.key && <StarRating value={ort.fields.bewertung.key} />}
            {ort.fields.bewertung?.label && (
              <span className="text-xs text-muted-foreground truncate">{ort.fields.bewertung.label}</span>
            )}
          </div>

          {ort.fields.beschreibung && (
            <p className="text-sm text-foreground leading-relaxed">{ort.fields.beschreibung}</p>
          )}

          <div className="space-y-2">
            {address && (
              <div className="flex items-start gap-2 min-w-0">
                <IconMapPin size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{address}</span>
              </div>
            )}
            {ort.fields.telefon && (
              <div className="flex items-center gap-2 min-w-0">
                <IconPhone size={15} className="text-muted-foreground shrink-0" />
                <a href={`tel:${ort.fields.telefon}`} className="text-sm text-primary hover:underline truncate">
                  {ort.fields.telefon}
                </a>
              </div>
            )}
            {ort.fields.website && (
              <div className="flex items-center gap-2 min-w-0">
                <IconWorld size={15} className="text-muted-foreground shrink-0" />
                <a href={ort.fields.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">
                  {ort.fields.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {ort.fields.oeffnungszeiten && (
              <div className="flex items-start gap-2 min-w-0">
                <IconClock size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{ort.fields.oeffnungszeiten}</span>
              </div>
            )}
            {ort.fields.besuchsdatum && (
              <div className="flex items-center gap-2 min-w-0">
                <IconCheckbox size={15} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground">Besucht am {formatDate(ort.fields.besuchsdatum)}</span>
              </div>
            )}
          </div>

          {ort.fields.notizen_nach_besuch && (
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Persönliche Notizen</p>
              <p className="text-sm text-foreground">{ort.fields.notizen_nach_besuch}</p>
            </div>
          )}

          {ort.fields.standort && (
            <a
              href={`https://www.google.com/maps?q=${ort.fields.standort.lat},${ort.fields.standort.long}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <IconMapPin size={15} className="shrink-0" />
              Auf Google Maps öffnen
            </a>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={onEdit} className="flex-1">
              <IconPencil size={15} className="mr-1.5 shrink-0" />
              Bearbeiten
            </Button>
            <Button variant="outline" onClick={onDelete} className="text-destructive hover:text-destructive">
              <IconTrash size={15} className="mr-1.5 shrink-0" />
              Löschen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Besuchskalender ─────────────────────────────────────────────────────────

type CalView = 'year' | 'month' | 'week' | 'day';

function OrtCalendar({
  orte,
  onDetail,
}: {
  orte: EnrichedOrte[];
  onDetail: (ort: EnrichedOrte) => void;
}) {
  const today = new Date();
  const [calView, setCalView] = useState<CalView>('month');
  const [currentDate, setCurrentDate] = useState(today);

  // Orte nach besuchsdatum gruppieren
  const orteByDate = useMemo(() => {
    const map = new Map<string, EnrichedOrte[]>();
    for (const ort of orte) {
      if (ort.fields.besuchsdatum) {
        const key = ort.fields.besuchsdatum.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ort);
      }
    }
    return map;
  }, [orte]);

  const navigate = (dir: 1 | -1) => {
    setCurrentDate(prev => {
      if (calView === 'year') return dir === 1 ? addYears(prev, 1) : subYears(prev, 1);
      if (calView === 'month') return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      if (calView === 'week') return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      return dir === 1 ? addDays(prev, 1) : subDays(prev, 1);
    });
  };

  const headerLabel = useMemo(() => {
    if (calView === 'year') return format(currentDate, 'yyyy');
    if (calView === 'month') return format(currentDate, 'MMMM yyyy', { locale: de });
    if (calView === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, 'd. MMM', { locale: de })} – ${format(we, 'd. MMM yyyy', { locale: de })}`;
    }
    return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
  }, [calView, currentDate]);

  const totalWithDate = orte.filter(o => o.fields.besuchsdatum).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <IconCalendar size={16} className="text-muted-foreground shrink-0" />
          <h3 className="font-semibold text-sm text-foreground">Besuchskalender</h3>
          {totalWithDate > 0 && (
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{totalWithDate} Besuche</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <IconChevronLeft size={15} className="shrink-0" />
            </button>
            <span className="text-sm font-medium min-w-[170px] text-center capitalize">{headerLabel}</span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <IconChevronRight size={15} className="shrink-0" />
            </button>
            <button
              onClick={() => setCurrentDate(today)}
              className="ml-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground font-medium"
            >
              Heute
            </button>
          </div>
          {/* View-Switcher */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            {(['year', 'month', 'week', 'day'] as CalView[]).map(v => (
              <button
                key={v}
                onClick={() => setCalView(v)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  calView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'year' ? 'Jahr' : v === 'month' ? 'Monat' : v === 'week' ? 'Woche' : 'Tag'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inhalt */}
      <div className="p-4">
        {calView === 'month' && (
          <CalMonthView
            currentDate={currentDate}
            orteByDate={orteByDate}
            onSelect={onDetail}
            onDayClick={d => { setCurrentDate(d); setCalView('day'); }}
          />
        )}
        {calView === 'week' && (
          <CalWeekView currentDate={currentDate} orteByDate={orteByDate} onSelect={onDetail} />
        )}
        {calView === 'day' && (
          <CalDayView currentDate={currentDate} orteByDate={orteByDate} onSelect={onDetail} />
        )}
        {calView === 'year' && (
          <CalYearView
            currentDate={currentDate}
            orteByDate={orteByDate}
            onMonthClick={d => { setCurrentDate(d); setCalView('month'); }}
          />
        )}
      </div>
    </div>
  );
}

// Monat-Ansicht
function CalMonthView({ currentDate, orteByDate, onSelect, onDayClick }: {
  currentDate: Date;
  orteByDate: Map<string, EnrichedOrte[]>;
  onSelect: (ort: EnrichedOrte) => void;
  onDayClick: (date: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayOrte = orteByDate.get(key) ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const todayDay = isToday(day);
          return (
            <div key={key} className={`bg-card min-h-[90px] p-1.5 flex flex-col gap-0.5 ${!inMonth ? 'opacity-40' : ''}`}>
              <button
                onClick={() => onDayClick(day)}
                className={`self-start text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                  todayDay ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                }`}
              >
                {format(day, 'd')}
              </button>
              {dayOrte.slice(0, 2).map(ort => (
                <button
                  key={ort.record_id}
                  onClick={() => onSelect(ort)}
                  title={ort.fields.ort_name ?? ''}
                  className="flex items-center gap-1 w-full text-left rounded overflow-hidden hover:bg-muted/60 transition-colors px-0.5 py-0.5 min-w-0"
                >
                  {ort.fields.fotos ? (
                    <img src={ort.fields.fotos} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-green-100 flex items-center justify-center shrink-0">
                      <IconMapPin size={8} className="text-green-600" />
                    </div>
                  )}
                  <span className="text-[10px] text-foreground truncate leading-none">{ort.fields.ort_name ?? '—'}</span>
                </button>
              ))}
              {dayOrte.length > 2 && (
                <span className="text-[9px] text-muted-foreground px-1">+{dayOrte.length - 2}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Wochen-Ansicht
function CalWeekView({ currentDate, orteByDate, onSelect }: {
  currentDate: Date;
  orteByDate: Map<string, EnrichedOrte[]>;
  onSelect: (ort: EnrichedOrte) => void;
}) {
  const wStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(wStart, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(day => {
        const key = format(day, 'yyyy-MM-dd');
        const dayOrte = orteByDate.get(key) ?? [];
        const todayDay = isToday(day);
        return (
          <div key={key} className="flex flex-col gap-1.5 min-w-0">
            <div className={`text-center rounded-xl py-2 ${todayDay ? 'bg-primary text-primary-foreground' : 'bg-muted/50'}`}>
              <div className="text-[10px] font-medium capitalize">{format(day, 'EEE', { locale: de })}</div>
              <div className={`text-base font-bold leading-tight ${todayDay ? '' : 'text-foreground'}`}>{format(day, 'd')}</div>
            </div>
            <div className="flex flex-col gap-1">
              {dayOrte.map(ort => (
                <button
                  key={ort.record_id}
                  onClick={() => onSelect(ort)}
                  className="w-full text-left rounded-lg overflow-hidden border border-border hover:border-primary/40 hover:shadow-sm transition-all bg-card"
                >
                  {ort.fields.fotos && (
                    <div className="h-14 overflow-hidden">
                      <img src={ort.fields.fotos} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="text-[10px] font-medium text-foreground leading-tight truncate">{ort.fields.ort_name ?? '—'}</p>
                    {ort.kategorieName && (
                      <p className="text-[9px] text-muted-foreground truncate">{ort.kategorieName}</p>
                    )}
                  </div>
                </button>
              ))}
              {dayOrte.length === 0 && (
                <div className="h-12 rounded-lg border border-dashed border-border/40" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tages-Ansicht
function CalDayView({ currentDate, orteByDate, onSelect }: {
  currentDate: Date;
  orteByDate: Map<string, EnrichedOrte[]>;
  onSelect: (ort: EnrichedOrte) => void;
}) {
  const key = format(currentDate, 'yyyy-MM-dd');
  const dayOrte = orteByDate.get(key) ?? [];
  if (dayOrte.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <IconCalendar size={40} className="text-muted-foreground" stroke={1.5} />
        <div>
          <p className="font-medium text-foreground">Kein Besuch an diesem Tag</p>
          <p className="text-sm text-muted-foreground mt-1">Wähle ein anderes Datum oder wechsle zur Monatsansicht.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {dayOrte.map(ort => (
        <button
          key={ort.record_id}
          onClick={() => onSelect(ort)}
          className="text-left rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow bg-card"
        >
          {ort.fields.fotos ? (
            <div className="h-40 overflow-hidden">
              <img src={ort.fields.fotos} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-40 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <IconMapPin size={36} className="text-muted-foreground/30" stroke={1.5} />
            </div>
          )}
          <div className="p-4 space-y-1.5">
            <p className="font-semibold text-foreground truncate">{ort.fields.ort_name ?? 'Unbenannter Ort'}</p>
            {ort.kategorieName && <p className="text-xs text-muted-foreground">{ort.kategorieName}</p>}
            {ort.fields.beschreibung && (
              <p className="text-xs text-muted-foreground line-clamp-2">{ort.fields.beschreibung}</p>
            )}
            <div className="flex items-center gap-1.5 pt-0.5">
              <StarRating value={ort.fields.bewertung?.key} />
              {ort.fields.stadt && (
                <span className="text-[10px] text-muted-foreground truncate">{ort.fields.stadt}</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// Jahres-Ansicht
function CalYearView({ currentDate, orteByDate, onMonthClick }: {
  currentDate: Date;
  orteByDate: Map<string, EnrichedOrte[]>;
  onMonthClick: (date: Date) => void;
}) {
  const year = currentDate.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {months.map(month => {
        const mStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const mEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        const mDays = eachDayOfInterval({ start: mStart, end: mEnd });
        const monthKey = format(month, 'yyyy-MM');
        const monthCount = Array.from(orteByDate.entries())
          .filter(([k]) => k.startsWith(monthKey))
          .reduce((s, [, v]) => s + v.length, 0);
        return (
          <button
            key={monthKey}
            onClick={() => onMonthClick(month)}
            className="text-left rounded-xl border border-border p-3 hover:border-primary/40 hover:shadow-sm transition-all bg-card"
          >
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground capitalize flex-1 truncate">
                {format(month, 'MMMM', { locale: de })}
              </p>
              {monthCount > 0 && (
                <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium shrink-0">{monthCount}</span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {['M','D','M','D','F','S','S'].map((d, i) => (
                <div key={i} className="text-center text-[8px] text-muted-foreground/40">{d}</div>
              ))}
              {mDays.map(day => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const hasOrte = orteByDate.has(dayKey);
                const inMonth = isSameMonth(day, month);
                const todayDay = isToday(day);
                return (
                  <div
                    key={dayKey}
                    className={`text-center text-[8px] py-0.5 rounded-sm leading-none ${
                      !inMonth ? 'text-muted-foreground/15' :
                      todayDay ? 'bg-primary text-primary-foreground font-bold' :
                      hasOrte ? 'bg-green-100 text-green-700 font-semibold' :
                      'text-muted-foreground'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Skeleton & Fehler ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktiere den Support.</p>}
    </div>
  );
}
