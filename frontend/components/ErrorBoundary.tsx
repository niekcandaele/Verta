import React, { Component, ErrorInfo, ReactNode } from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-base-100">
          <div className="card w-96 bg-base-200 shadow-xl">
            <div className="card-body">
              <div className="flex items-center gap-3 text-error mb-4">
                <FiAlertTriangle size={24} />
                <h2 className="card-title">Something went wrong</h2>
              </div>
              
              <p className="text-base-content/70 mb-4">
                An unexpected error occurred. Please try refreshing the page.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="collapse collapse-arrow bg-base-300 mb-4">
                  <input type="checkbox" />
                  <div className="collapse-title text-sm font-medium">
                    Error Details
                  </div>
                  <div className="collapse-content">
                    <pre className="text-xs overflow-auto p-2 bg-base-100 rounded">
                      {this.state.error.toString()}
                      {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}

              <div className="card-actions justify-end">
                <button 
                  onClick={this.handleReset}
                  className="btn btn-primary btn-sm gap-2"
                >
                  <FiRefreshCw size={16} />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}