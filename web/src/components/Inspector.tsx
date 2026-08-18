import { useState, type MouseEvent } from "react";
import type { Capture } from "../lib/api";

export interface CaptureEntry {
  label: string;
  capture: Capture;
}

export function Inspector({ entries }: { entries: CaptureEntry[] }) {
  return (
    <section className="inspector">
      <h2>Inspector</h2>
      <p className="muted small">Every call this session made to XCover, in order.</p>
      {entries.length === 0 ? (
        <p className="muted">No XCover calls made yet.</p>
      ) : (
        <div className="inspector-list">
          {entries
            .slice()
            .reverse()
            .map((entry, i) => (
              <InspectorEntry key={`${entry.label}-${i}`} entry={entry} defaultOpen={i === 0} />
            ))}
        </div>
      )}
    </section>
  );
}

function InspectorEntry({ entry, defaultOpen }: { entry: CaptureEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { capture } = entry;

  return (
    <div className="inspector-entry">
      <button className="inspector-entry-header" onClick={() => setOpen((o) => !o)}>
        <span className={`status-badge ${capture.networkError ? "unreachable" : capture.status < 400 ? "ok" : "error"}`}>
          {capture.networkError ? "UNREACHABLE" : capture.status}
        </span>
        <span className="inspector-entry-label">{entry.label}</span>
        <span className="muted small">{capture.method} · {capture.latencyMs}ms</span>
        <span className={`mode-badge ${capture.mock ? "mock" : "live"}`}>
          {capture.mock ? "MOCK" : "LIVE"}
        </span>
      </button>
      {open && (
        <div className="inspector-entry-body">
          <Block title="URL" content={capture.url} defaultOpen={false} />
          <Block
            title="Request headers"
            content={JSON.stringify(capture.requestHeaders, null, 2)}
            defaultOpen={false}
          />
          <Block
            title="Request body"
            content={JSON.stringify(capture.requestBody, null, 2)}
            defaultOpen={true}
          />
          {capture.mockNote && <Block title="MOCK_MODE note" content={capture.mockNote} defaultOpen={true} />}
          {capture.networkError ? (
            <Block
              title="Network error (XCover was never reached)"
              content={capture.networkError}
              defaultOpen={true}
            />
          ) : (
            <Block
              title="Response body"
              content={JSON.stringify(capture.responseBody, null, 2)}
              defaultOpen={false}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  content,
  defaultOpen,
}: {
  title: string;
  content: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  function handleCopy(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="inspector-block">
      <div className="inspector-block-header">
        <button className="inspector-block-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="inspector-block-caret">{open ? "▾" : "▸"}</span>
          <strong>{title}</strong>
        </button>
        <button className="inspector-block-copy" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {open && <pre>{content}</pre>}
    </div>
  );
}
