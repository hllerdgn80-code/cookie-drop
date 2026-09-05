/**
 * Cookie Chain connection settings.
 *
 * Cookie Chain is an SVM network, so every Solana client library works against
 * it unchanged — the only thing that differs is which RPC you point at. Keeping
 * that single fact in one file is what makes the rest of the app ordinary
 * Solana code.
 */
import { Connection } from "@solana/web3.js";

export const RPC_URL = "https://rpc.cookiescan.io";
export const WSS_URL = "https://wss.cookiescan.io";
/** Metaplex DAS indexer for Cookie Chain — used to list a wallet's tokens. */
export const DAS_URL = "https://api.cookiescan.io";
export const EXPLORER = "https://cookiescan.io";

/** Native token of Cookie Chain. Same 9 decimals as SOL. */
export const NATIVE_SYMBOL = "COOK";
export const NATIVE_DECIMALS = 9;

export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: WSS_URL,
});

export const txUrl = (signature: string) => `${EXPLORER}/tx/${signature}`;
export const addrUrl = (address: string) => `${EXPLORER}/address/${address}`;

/** Shorten an address for display without losing its recognisable ends. */
export function short(address: string, size = 4): string {
  return address.length <= size * 2 + 1
    ? address
    : `${address.slice(0, size)}…${address.slice(-size)}`;
}
