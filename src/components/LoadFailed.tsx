import { Component, type ReactNode } from "react";

type Props = { fallback: ReactNode; children: ReactNode };

/**
 * Shows `fallback` in place of its children once drawing them throws, as a lazily loaded part does when its chunk can't be
 * fetched (offline, say, or after a deploy that replaced it), so the rest of the page stands.
 */
export class LoadFailed extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
