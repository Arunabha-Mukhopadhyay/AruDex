import { WagmiProvider, useAccount, useConnect, useDisconnect } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "./Config";
import Simulation from "./pages/Simulation";

const queryClient = new QueryClient();

function shortAddress(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletConnector() {
  const { isConnected, address } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet-connected">
        <span className="address-pill" title={address}>
          {shortAddress(address)}
        </span>
        <button type="button" className="btn-disconnect" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-bar">
      <div className="wallet-connectors">
        {connectors.map((connector) => (
          <button
            type="button"
            className="btn-connector"
            key={connector.uid}
            onClick={() => connect({ connector })}
          >
            {connector.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="AruDex home">
          <span className="brand-mark">A</span>
          <span>
            <span className="brand-text">AruDex</span>
            <span className="brand-tagline">Intent-style AMM simulation</span>
          </span>
        </a>
        <WalletConnector />
      </header>
      <main className="main-content">
        <Simulation />
      </main>
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
