import type { CSSProperties } from 'react';

export function InsightsArt() {
  return (
    <div className="ap-stage" aria-hidden="true">
      <div
        className="ap-c ap-fade2"
        style={{
          left: '58%',
          top: '2%',
          width: '38%',
          height: '84px',
          padding: '14px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <div className="ap-ring" data-l="62%" style={{ '--p': 62 } as CSSProperties}></div>
        <div>
          <div className="ap-xs ap-muted">Sprint 08</div>
          <div className="ap-sm">21 of 34 points</div>
        </div>
      </div>
      <div className="ap-c ap-fade" style={{ left: '2%', top: '12%', width: '46%', padding: '14px' }}>
        <div className="ap-xs ap-muted">Closed this week</div>
        <div className="ap-big" style={{ margin: '6px 0 10px' }}>
          38{' '}
          <span className="ap-xs ap-faint" style={{ fontWeight: '400' }}>
            issues
          </span>
        </div>
        <div className="ap-bars">
          <i style={{ height: '30%' }}></i>
          <i style={{ height: '45%' }}></i>
          <i className="ap-on" style={{ height: '70%' }}></i>
          <i style={{ height: '38%' }}></i>
          <i className="ap-on" style={{ height: '100%' }}></i>
        </div>
      </div>
      <div className="ap-c" style={{ left: '52%', top: '26%', width: '46%', padding: '14px' }}>
        <div className="ap-xs ap-muted" style={{ marginBottom: '10px' }}>
          Open by status
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div
            className="ap-ring"
            data-l="24"
            style={{ '--p': 58, width: '76px', height: '76px' } as CSSProperties}
          ></div>
          <div style={{ flex: '1', display: 'grid', gap: '7px' }} className="ap-xs">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="ap-dot"></span>
              <span className="ap-muted" style={{ flex: '1' }}>
                Open
              </span>
              <span className="ap-m">9</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="ap-dot ap-a"></span>
              <span className="ap-muted" style={{ flex: '1' }}>
                In Progress
              </span>
              <span className="ap-m">11</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="ap-dot ap-g"></span>
              <span className="ap-muted" style={{ flex: '1' }}>
                Fixed
              </span>
              <span className="ap-m">4</span>
            </div>
          </div>
        </div>
      </div>
      <div className="ap-c" style={{ left: '4%', top: '46%', width: '48%', padding: '14px' }}>
        <div className="ap-xs ap-muted">Time logged</div>
        <div className="ap-big" style={{ margin: '6px 0 4px' }}>
          14h 20m
        </div>
        <div className="ap-xs ap-faint" style={{ marginBottom: '10px' }}>
          of 20h planned · Sprint 08
        </div>
        <div className="ap-track">
          <i style={{ width: '72%' }}></i>
        </div>
      </div>
      <div className="ap-c ap-fade" style={{ left: '50%', top: '70%', width: '48%', padding: '14px' }}>
        <div className="ap-xs ap-muted" style={{ marginBottom: '8px' }}>
          Task completion
        </div>
        <div className="ap-big">92%</div>
        <div className="ap-track" style={{ marginTop: '10px' }}>
          <i style={{ width: '92%' }}></i>
        </div>
      </div>
      <div className="ap-c ap-fade2" style={{ left: '2%', top: '78%', width: '42%', padding: '14px' }}>
        <div className="ap-xs ap-muted">Burndown</div>
        <div className="ap-track" style={{ marginTop: '12px' }}>
          <i style={{ width: '40%' }}></i>
        </div>
      </div>
    </div>
  );
}

export function AgentArt() {
  return (
    <div className="ap-stage" aria-hidden="true">
      <div className="ap-c" style={{ left: '0', right: '12%', top: '6%' }}>
        <div className="ap-hd">
          <b className="ap-k" style={{ color: 'var(--panel-ink-muted)' }}>
            ACME
          </b>
          <span className="ap-faint">/</span>
          <b>Issues</b>
          <span style={{ flex: '1' }}></span>
          <span className="ap-av">AL</span>
        </div>
        <div className="ap-row">
          <span className="ap-k">ACME-12</span>
          <span className="ap-t">Invite link blank after it expires</span>
          <span className="ap-tag ap-a">M</span>
          <span className="ap-av">AL</span>
          <span className="ap-dot ap-a"></span>
        </div>
        <div className="ap-row ap-faint">
          <span className="ap-k">ACME-11</span>
          <span className="ap-t">Swimlane header overlaps count</span>
          <span className="ap-tag ap-n">N</span>
          <span className="ap-av">CK</span>
          <span className="ap-dot"></span>
        </div>
        <div className="ap-row">
          <span className="ap-k">ACME-9</span>
          <span className="ap-t">Upload stalls at 100% on slow links</span>
          <span className="ap-tag ap-a">M</span>
          <span className="ap-av">RG</span>
          <span className="ap-dot"></span>
        </div>
        <div className="ap-row">
          <span className="ap-k">ACME-7</span>
          <span className="ap-t">Burndown ignores late additions</span>
          <span className="ap-tag ap-r">C</span>
          <span className="ap-av">JD</span>
          <span className="ap-dot"></span>
        </div>
      </div>
      <div className="ap-c ap-accent-edge" style={{ left: '22%', right: '0', top: '40%' }}>
        <div className="ap-hd">
          <b>Your agent</b>
          <span style={{ flex: '1' }}></span>
          <span className="ap-m">@alex</span>
        </div>
        <div className="ap-step">
          <i className="ap-ok">✓</i>
          <div>
            Found 3 unassigned bugs<small>Major or Critical</small>
          </div>
        </div>
        <div className="ap-step">
          <i className="ap-ok">✓</i>
          <div>
            Assigned ACME-12 to you<small>Status set to In Progress</small>
          </div>
        </div>
        <div className="ap-step">
          <i className="ap-ok">✓</i>
          <div>
            Logged 20m of Development<small>on ACME-12</small>
          </div>
        </div>
        <div style={{ padding: '0 12px 12px' }}>
          <div className="ap-tool">
            <b>issues.update</b> ACME-12 status=&quot;In Progress&quot;
          </div>
        </div>
      </div>
    </div>
  );
}

export function IssueArt() {
  return (
    <div className="ap-stage" aria-hidden="true">
      <div className="ap-c" style={{ left: '0', right: '10%', top: '4%' }}>
        <div className="ap-hd">
          <span className="ap-k">ACME</span>
          <span className="ap-faint">/</span>
          <span>Issues</span>
          <span className="ap-faint">/</span>
          <b className="ap-m" style={{ color: 'var(--panel-ink)' }}>
            ACME-12
          </b>
        </div>
        <div style={{ padding: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }} className="ap-sm ap-muted">
            <span>
              <span className="ap-tag ap-r">B</span> Bug
            </span>
            <span>
              <span className="ap-tag ap-a">M</span> Major
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: '600', letterSpacing: '-.01em', marginBottom: '12px' }}>
            Invite link blank after it expires
          </div>
          <div
            style={{ border: '1px solid var(--panel-line)', borderRadius: '8px', padding: '10px 12px' }}
            className="ap-sm ap-muted"
          >
            <span className="ap-av">AL</span> <b style={{ fontWeight: '500', color: 'var(--panel-ink)' }}>Alex Lee</b> ·
            8 Oct 2026
            <div style={{ marginTop: '6px' }}>
              Expired links now land on an explanation with a <i>Request a new link</i> button.
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <div className="ap-field">
              <span>Assignee</span>
              <span className="ap-av">AL</span>Alex Lee
            </div>
            <div className="ap-field">
              <span>Status</span>
              <span className="ap-dot ap-g"></span>Fixed
            </div>
            <div className="ap-field">
              <span>Spent</span>
              <span className="ap-m">1h 45m</span>
              <span className="ap-faint">of 2h</span>
            </div>
          </div>
        </div>
      </div>
      <div
        className="ap-c"
        style={{ right: '0', top: '50%', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'center' }}
      >
        <div
          className="ap-ring"
          data-l="88%"
          style={{ '--p': 88, width: '44px', height: '44px' } as CSSProperties}
        ></div>
        <div>
          <div className="ap-xs ap-muted">Logged today</div>
          <div className="ap-sm">
            <span className="ap-m" style={{ color: 'var(--panel-ink)' }}>
              1h 25m
            </span>{' '}
            Development
          </div>
        </div>
      </div>
      <div
        className="ap-c ap-fade"
        style={{ left: '4%', top: '78%', width: '60%', padding: '10px 14px', fontSize: '12px' }}
      >
        <div className="ap-muted" style={{ display: 'grid', gap: '6px' }}>
          <div>
            <span className="ap-dot"></span> Alex Lee changed Status: In Progress to Fixed
          </div>
          <div>
            <span className="ap-dot"></span> Alex Lee logged 1h 25m, Development
          </div>
        </div>
      </div>
    </div>
  );
}
