import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isRouteErrorResponse, useRouteError } from 'react-router'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught rendering error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-bg text-ink">
          <Card className="max-w-md w-full p-6 text-center space-y-4 border-danger/30">
            <div className="mx-auto size-12 rounded-full bg-danger/10 grid place-items-center text-danger">
              <AlertCircle className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display">Something went wrong</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <Button variant="primary" onClick={this.handleReload}>
                <RefreshCw className="size-4 mr-2" /> Reload Page
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export function RootErrorFallback() {
  const error = useRouteError()
  console.error('Route error caught:', error)

  let title = 'Something went wrong'
  let message = 'An unexpected navigation or page error occurred.'

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`
    message = error.data?.message || error.statusText
  } else if (error instanceof Error) {
    message = error.message
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg text-ink">
      <Card className="max-w-md w-full p-6 text-center space-y-4 border-danger/30">
        <div className="mx-auto size-12 rounded-full bg-danger/10 grid place-items-center text-danger">
          <AlertCircle className="size-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display">{title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{message}</p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <Button variant="primary" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" /> Reload Page
          </Button>
          <Button variant="secondary" onClick={() => (window.location.href = '/')}>
            Go to Home
          </Button>
        </div>
      </Card>
    </div>
  )
}
