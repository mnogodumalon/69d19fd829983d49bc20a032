import { useState, useEffect, useCallback } from 'react';
import { IconRefresh, IconHistory, IconLoader, IconChevronDown, IconCheck, IconClock, IconArrowBackUp } from '@tabler/icons-react';

const APPGROUP_ID = '69d19fd829983d49bc20a032';
const UPDATE_ENDPOINT = '/claude/build/update';
const RELEASES_ENDPOINT = `/claude/build/releases/${APPGROUP_ID}`;
const ROLLBACK_ENDPOINT = '/claude/build/rollback';
const VERSION_ENDPOINT = '/claude/version';

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function formatTimestamp(ts: string): string {
  // "20260411_070729" → "11.04.2026, 07:07"
  if (ts.length < 15) return ts;
  const y = ts.slice(0, 4), m = ts.slice(4, 6), d = ts.slice(6, 8);
  const h = ts.slice(9, 11), min = ts.slice(11, 13);
  return `${d}.${m}.${y}, ${h}:${min}`;
}

function formatDeployedAt(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 16); }
}

interface Release {
  timestamp: string;
  version: string;
  commit: string;
  deployed_at: string;
}

type Status = 'idle' | 'loading' | 'updating' | 'rolling_back' | 'error';

export function VersionCheck() {
  const [status, setStatus] = useState<Status>('loading');
  const [deployedVersion, setDeployedVersion] = useState('');
  const [deployedCommit, setDeployedCommit] = useState('');
  const [deployedAt, setDeployedAt] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deployedRes, serviceRes] = await Promise.all([
          fetch('./version.json', { cache: 'no-store' }),
          fetch(VERSION_ENDPOINT, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (!deployedRes.ok || !serviceRes.ok) { setStatus('idle'); return; }
        const deployed = await deployedRes.json();
        const service = await serviceRes.json();
        setDeployedVersion(deployed.version || '');
        setDeployedCommit(deployed.commit || '');
        setDeployedAt(deployed.deployed_at || '');
        setLatestVersion(service.version || '');
        setUpdateAvailable(
          !!(deployed.version && service.version && compareSemver(service.version, deployed.version) > 0)
        );
        setStatus('idle');
      } catch { setStatus('idle'); }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadReleases = useCallback(async () => {
    if (releases.length > 0) return;
    setLoadingReleases(true);
    try {
      const res = await fetch(RELEASES_ENDPOINT, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
      }
    } catch { /* ignore */ }
    setLoadingReleases(false);
  }, [releases.length]);

  const handleUpdate = useCallback(async () => {
    if (!window.confirm('Anwendung auf neuste Version aktualisieren?')) return;
    setStatus('updating');
    setShowPanel(false);
    try {
      const resp = await fetch(UPDATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, fix_errors: true }),
      });
      if (!resp.ok || !resp.body) { setStatus('error'); return; }
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
          if (content.startsWith('[DONE]')) { window.location.reload(); return; }
          if (content.startsWith('[ERROR]')) { setStatus('error'); return; }
        }
      }
      window.location.reload();
    } catch { setStatus('error'); }
  }, []);

  const handleRollback = useCallback(async (timestamp: string) => {
    if (!window.confirm('Anwendung auf letzte Version zurücksetzen?')) return;
    setRollbackTarget(timestamp);
    setStatus('rolling_back');
    try {
      const resp = await fetch(ROLLBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, timestamp }),
      });
      if (!resp.ok) { setStatus('error'); setRollbackTarget(null); return; }
      window.location.reload();
    } catch { setStatus('error'); setRollbackTarget(null); }
  }, []);

  if (status === 'loading') return null;

  if (status === 'updating') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <IconRefresh size={14} className="shrink-0 animate-spin" />
        <span>Aktualisiert…</span>
      </div>
    );
  }

  if (status === 'rolling_back') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <IconHistory size={14} className="shrink-0 animate-spin" />
        <span>Wird zurückgesetzt…</span>
      </div>
    );
  }

  return (
    <div>
      {/* Version button — toggles panel */}
      <button
        onClick={() => {
          const next = !showPanel;
          setShowPanel(next);
          if (next) loadReleases();
        }}
        className="flex items-center justify-between gap-2 w-full px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-sidebar-accent/30"
      >
        <span className="flex items-center gap-1.5">
          <IconClock size={13} className="shrink-0" />
          {deployedVersion ? `v${deployedVersion}` : '—'}
          {deployedCommit && <span className="text-muted-foreground/50">({deployedCommit})</span>}
        </span>
        <IconChevronDown size={13} className={`shrink-0 transition-transform ${showPanel ? 'rotate-180' : ''}`} />
      </button>

      {/* Update banner */}
      {updateAvailable && !showPanel && (
        <button
          onClick={handleUpdate}
          className="flex items-center gap-2 mx-3 mt-1 px-3 py-1.5 w-[calc(100%-1.5rem)] rounded-lg text-xs font-medium text-[#2563eb] bg-secondary border border-[#bfdbfe] hover:bg-[#dbeafe] transition-colors"
        >
          <IconRefresh size={13} className="shrink-0" />
          <span>Update verfügbar: v{latestVersion}</span>
        </button>
      )}

      {/* Versions panel */}
      {showPanel && (
        <div className="mx-3 mt-1 mb-2 rounded-xl border border-sidebar-border bg-sidebar overflow-hidden">
          {/* Current version header */}
          <div className="px-3 py-2 border-b border-sidebar-border">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <IconCheck size={13} className="text-primary shrink-0" />
              Aktuelle Version
            </div>
            {deployedAt && (
              <div className="text-[10px] text-muted-foreground mt-0.5 pl-5">{formatDeployedAt(deployedAt)}</div>
            )}
          </div>

          {/* Update button inside panel */}
          {updateAvailable && (
            <button
              onClick={handleUpdate}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#2563eb] bg-secondary/50 hover:bg-secondary border-b border-sidebar-border transition-colors"
            >
              <IconRefresh size={13} className="shrink-0" />
              <span>Update verfügbar: v{latestVersion}</span>
            </button>
          )}

          {/* Releases list */}
          {loadingReleases ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <IconLoader size={13} className="animate-spin" />
              <span>Lade Versionen...</span>
            </div>
          ) : releases.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              Keine früheren Versionen
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {releases.map((rel) => (
                <button
                  key={rel.timestamp}
                  onClick={() => handleRollback(rel.timestamp)}
                  disabled={rollbackTarget === rel.timestamp}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-sidebar-accent/30 transition-colors disabled:opacity-50 border-b border-sidebar-border last:border-b-0"
                >
                  <IconArrowBackUp size={13} className="shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-medium">{formatTimestamp(rel.timestamp)}</span>
                      {rel.version && <span className="text-muted-foreground/60">v{rel.version}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="mx-3 mt-1 px-3 py-1.5 text-xs text-destructive bg-destructive/10 rounded-lg">
          Fehler aufgetreten
        </div>
      )}
    </div>
  );
}
