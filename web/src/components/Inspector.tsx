import { useState } from "react";
import type { Capture } from "../lib/api";

export interface CaptureEntry {
  label: string;
  capture: Capture;
}

export function Inspector({ entries }: { entries: CaptureEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="inspector">
        <h2>Inspector</h2>
        <p className="muted">No XCover calls made yet.</p>
      </section>
    );
  }

  return (
    <section className="inspector">
      <h2>Inspector</h2>
      <p className="muted">Every call this session made to XCover, in order.</p>
      {entries
        .slice()
        .reverse()
        .map((entry, i) => (
          <InspectorEntry key={`${entry.label}-${i}`} entry={entry} defaultOpen={i === 0} />
        ))}
    </section>
  );
}

function InspectorEntry({ entry, defaultOpen }: { entry: CaptureEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { capture } = entry;

  return (
    <div className="inspector-entry">
      <button className="inspector-entry-header" onClick={() => setOpen((o) => !o)}>
        <span className={`status-badge ${capture.status < 400 ? "ok" : "error"}`}>
          {capture.status}
        </span>
        <span className="inspector-entry-label">{entry.label}</span>
        <span className="muted">
          {capture.method} · {capture.latencyMs}ms · {capture.mock ? "MOCK_MODE" : "live"}
        </span>
      </button>
      {open && (
        <div className="inspector-entry-body">
          <div>
            <strong>URL</strong>
            <pre>{capture.url}</pre>
          </div>
          <div>
            <strong>Request headers</strong>
            <pre>{JSON.stringify(capture.requestHeaders, null, 2)}</pre>
          </div>
          <div>
            <strong>Request body</strong>
            <pre>{JSON.stringify(capture.requestBody, null, 2)}</pre>
          </div>
          <div>
            <strong>Response body</strong>
            <pre>{JSON.stringify(capture.responseBody, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
