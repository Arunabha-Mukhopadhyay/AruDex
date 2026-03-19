import { WagmiProvider, useAccount, useConnect, useDisconnect } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "./Config";
import Simulation from "./pages/Simulation";

const queryClient = new QueryClient();

function WalletConnector() {
  const { isConnected, address } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div>
        <div>{address}</div>
        <button type="button" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      {connectors.map((connector) => (
        <button
          type="button"
          key={connector.uid}
          onClick={() => connect({ connector })}
        >
          {connector.name}
        </button>
      ))}
    </div>
  );
}

function App() {  

  return (
   <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
          <WalletConnector />
          <Simulation />
      </QueryClientProvider>
   </WagmiProvider>
  )
}

export default App
