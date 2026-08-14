import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundaries must be class components — React has no hook equivalent.
 * This catches render-time crashes in the checkout UI itself (e.g. an
 * unexpected response shape reaching a component that doesn't guard for it),
 * which is a different failure class from an XCover/network error: those are
 * handled in App.tsx and never throw this far. Without this, a render crash
 * would blank the whole page with no explanation.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RealCheap checkout UI crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <header>
            <h1>RealCheap</h1>
          </header>
          <main>
            <p className="error">
              The checkout UI hit an unexpected error — this is a bug in RealCheap's frontend,
              not an XCover response ({this.state.error.message}). Reload the page to start over.
            </p>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}
