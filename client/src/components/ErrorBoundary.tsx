import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "red", color: "white", padding: "8px", fontSize: "10px", zIndex: 99999, wordBreak: "break-all" }}>
          <b>ERROR:</b> {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
