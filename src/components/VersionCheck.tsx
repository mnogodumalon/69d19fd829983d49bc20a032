import { useState, useEffect, useCallback } from 'react';
import { IconRefresh, IconHistory } from '@tabler/icons-react';

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

type Status = 'loading' | 'up_to_date' | 'update_available' | 'updating' | 'rolling_back' | 'error';

export function VersionCheck() {
  const [status, setStatus] = useState<Status>('loading');
  const [deployedVersion, setDeployedVersion] = useState('');
  const [deployedCommit, setDeployedCommit] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [showRollback, setShowRollback] = useState(false);
  const [previousVersion, setPreviousVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deployedRes, serviceRes] = await Promise.all([
          fetch('./version.json', { cache: 'no-store' }),
          fetch(VERSION_ENDPOINT, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (!deployedRes.ok || !serviceRes.ok) {
          setStatus('error');
          return;
        }
        const deployed = await deployedRes.json();
        const service = await serviceRes.json();
        const dv = deployed.version || '';
        const sv = service.version || '';
        setDeployedVersion(dv);
        setDeployedCommit(deployed.commit || '');
        setLatestVersion(sv);
        if (dv && sv && compareSemver(sv, dv) > 0) {
          setStatus('update_available');
        } else {
          setStatus('up_to_date');
        }
      } catch {
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!window.confirm('Anwendung auf neuste Version aktualisieren?')) return;
    setStatus('updating');
    try {
      const resp = await fetch(UPDATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, fix_errors: true }),
      });
      if (!resp.ok || !resp.body) {
        setStatus('error');
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
          if (content.startsWith('[DONE]')) {
            window.location.reload();
            return;
          }
          if (content.startsWith('[ERROR]')) {
            setStatus('error');
            return;
          }
        }
      }
      // Stream ended without [DONE]
      window.location.reload();
    } catch {
      setStatus('error');
    }
  }, []);

  const handleRollback = useCallback(async () => {
    if (!window.confirm('Anwendung auf letzte Version zurücksetzen?')) return;
    setStatus('rolling_back');
    try {
      const releasesRes = await fetch(RELEASES_ENDPOINT, { credentials: 'include' });
      if (!releasesRes.ok) { setStatus('error'); return; }
      const { releases } = await releasesRes.json();
      if (!releases || releases.length === 0) { setStatus('error'); return; }
      const latest = releases[0];
      const resp = await fetch(ROLLBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, timestamp: latest.timestamp }),
      });
      if (!resp.ok) { setStatus('error'); return; }
      window.location.reload();
    } catch {
      setStatus('error');
    }
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

  if (status === 'update_available') {
    return (
      <div>
        <button
          onClick={handleUpdate}
          className="flex items-center gap-2 px-4 py-2 w-full rounded-2xl text-sm font-medium text-left text-[#2563eb] bg-secondary border border-[#bfdbfe] hover:bg-[#dbeafe] transition-colors"
        >
          <IconRefresh size={14} className="shrink-0" />
          <span>Update verfügbar: v{latestVersion}</span>
        </button>
        <span className="block px-4 pt-1 text-xs text-muted-foreground">v{deployedVersion}{deployedCommit && <span className="text-muted-foreground/60"> ({deployedCommit})</span>}</span>
      </div>
    );
  }

  // up_to_date or error — show version string
  return (
    <div>
      <button
        onClick={async () => {
          const next = !showRollback;
          setShowRollback(next);
          if (next && !previousVersion) {
            try {
              const res = await fetch(RELEASES_ENDPOINT, { credentials: 'include' });
              if (res.ok) {
                const { releases } = await res.json();
                if (releases?.length > 0 && releases[0].version) {
                  setPreviousVersion(releases[0].version);
                }
              }
            } catch { /* ignore */ }
          }
        }}
        className="px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {deployedVersion ? `v${deployedVersion}` : '—'}
        {showRollback && deployedCommit && <span className="text-muted-foreground/60"> ({deployedCommit})</span>}
      </button>
      {showRollback && previousVersion && (
        <button
          onClick={handleRollback}
          className="flex items-center gap-2 px-4 py-1.5 w-full rounded-2xl text-left text-xs text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
        >
          <IconHistory size={14} className="shrink-0" />
          <span>Zurück auf v{previousVersion}</span>
        </button>
      )}
    </div>
  );
}
