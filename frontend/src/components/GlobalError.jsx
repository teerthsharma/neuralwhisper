import React from 'react'

export class GlobalError extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('Uncaught error:', error, errorInfo)
        this.setState({ errorInfo })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    color: '#ff4444',
                    backgroundColor: '#1a1a1a',
                    height: '100vh',
                    fontFamily: 'monospace'
                }}>
                    <h1>⚠️ Runtime Error (Zen Mode Crashed)</h1>
                    <p>The application encountered a critical error.</p>
                    <pre style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        backgroundColor: '#000',
                        overflow: 'auto',
                        border: '1px solid #333'
                    }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '2rem',
                            padding: '0.8rem 1.5rem',
                            backgroundColor: '#333',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        Reload Application
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
