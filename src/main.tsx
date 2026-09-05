import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-wallets";
import { RPC_URL, WSS_URL } from "./chain";
import App from "./App";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

function Root() {
  // Nightly is the wallet Cookie Chain documents as fully supported, so it is
  // listed explicitly. Any other wallet implementing the Solana Wallet Standard
  // is still discovered automatically by the adapter.
  const wallets = useMemo(() => [new NightlyWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed", wsEndpoint: WSS_URL }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
