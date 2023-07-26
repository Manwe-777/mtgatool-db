import { Server as HTTPServer } from "http";
import { Server as HTTPSServer } from "https";
import { ToolDb, ToolDbMessage } from "..";
import ToolDbNetworkAdapter from "../networkAdapterBase";

export interface Peer {
  topic: string;
  timestamp: number;
  host: string;
  port: number;
  pubkey: string;
  sig: string;
  isServer: boolean;
}

export interface ServerPeerData {
  host: string;
  port: number;
  ssl: boolean;
  name: string;
  pubKey: string;
  signature: string;
}

export interface ToolDbStore {
  start: () => void;
  put: (
    key: string,
    data: string,
    callback: (err: any | null, data?: string) => void
  ) => void;
  get: (
    key: string,
    callback: (err: any | null, data?: string) => void
  ) => void;
  query: (key: string) => Promise<string[]>;
  quit: () => void;
}

export type ToolDbStorageAdapter = (dbName?: string) => ToolDbStore;

export type ToolDbMessageHandler = (
  this: ToolDb,
  message: ToolDbMessage,
  remotePeerId: string
) => void;

export interface ToolDbOptions {
  db: string;
  debug: boolean;
  maxRetries: number;
  triggerDebouce: number;
  wait: number;
  pow: number;
  ssl: boolean;
  server: boolean;
  serverName: string;
  httpServer: HTTPServer | HTTPSServer | undefined;
  host: string;
  port: number;
  storageName: string;
  networkAdapter: typeof ToolDbNetworkAdapter;
  storageAdapter: ToolDbStorageAdapter;
  topic: string;
  defaultKeys: CryptoKeyPair | undefined;
  maxPeers: number;
}

export interface ParsedKeys {
  skpub: string;
  skpriv: string;
  ekpub: string;
  ekpriv: string;
}

export interface Keys {
  pub: string;
  priv: string;
}

export type GenericObject = { [key: string]: any };

export interface UserRootData {
  keys: {
    skpub: string;
    skpriv: string;
    ekpub: string;
    ekpriv: string;
  };
  iv: string;
  pass: string;
}

export type AllowedFunctionArguments<A = GenericObject> = A;

export type AllowedFunctionReturn<R = unknown> = R;

export type FunctionCodes = "OK" | "ERR" | "NOT_FOUND";

export type ServerFunction<R, A = GenericObject> = (
  args: AllowedFunctionArguments<A>
) => Promise<AllowedFunctionReturn<R>>;

export interface FunctionReturnBase {
  code: FunctionCodes;
}
export interface FunctionReturnOk<R> extends FunctionReturnBase {
  return: AllowedFunctionReturn<R>;
  code: "OK";
}

export interface FunctionReturnErr extends FunctionReturnBase {
  return: string;
  code: "ERR";
}

export interface FunctionReturnNotFound extends FunctionReturnBase {
  return: string;
  code: "NOT_FOUND";
}

export type FunctionReturn<R> =
  | FunctionReturnOk<R>
  | FunctionReturnErr
  | FunctionReturnNotFound;
