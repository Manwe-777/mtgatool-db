import { FreezeObject } from "automerge";
import EventEmitter from "events";

import {
  BaseMessage,
  CrdtMessage,
  exportKey,
  generateKeyPair,
  PutMessage,
  ServerFunction,
  ToolDbMessage,
  VerificationData,
  verifyMessage,
} from ".";

import logger from "./logger";

import toolDbGet from "./toolDbGet";
import toolDbPut from "./toolDbPut";
import toolDbSignIn from "./toolDbSignIn";
import toolDbSignUp from "./toolDbSignUp";
import toolDbNetwork from "./toolDbNetwork";
import toolDbCrdtGet from "./toolDbCrdtGet";
import toolDbCrdtPut from "./toolDbCrdtPut";
import toolDbGetPubKey from "./toolDbGetPubKey";
import toolDbAnonSignIn from "./toolDbAnonSignIn";
import toolDbServerSync from "./toolDbServerSync";
import toolDbClientOnMessage from "./toolDbClientOnMessage";
import toolDbVerificationWrapper from "./toolDbVerificationWrapper";

import leveldb from "./utils/leveldb";
import indexedb from "./utils/indexedb";

import toolDbSubscribe from "./toolDbSubscribe";

import toolDbQueryKeys from "./toolDbQueryKeys";
import loadCrdtDocument from "./loadCrdtDocument";
import toolDbKeysSignIn from "./toolDbKeysSignIn";

import handleGet from "./messageHandlers/handleGet";
import handlePut from "./messageHandlers/handlePut";
import handlePing from "./messageHandlers/handlePing";
import handlePong from "./messageHandlers/handlePong";
import handleCrdt from "./messageHandlers/handleCrdt";
import handleQuery from "./messageHandlers/handleQuery";
import handleCrdtGet from "./messageHandlers/handleCrdtGet";
import handleCrdtPut from "./messageHandlers/handleCrdtPut";
import handleSubscribe from "./messageHandlers/handleSubscribe";

import { Peer, ToolDbOptions } from "./types/tooldb";
import arrayBufferToHex from "./utils/arrayBufferToHex";
import handleFunction from "./messageHandlers/handleFunction";
import toolDbFunction from "./toolDbFunction";

export const KEY_PREFIX =
  "3059301306072a8648ce3d020106082a8648ce3d03010703420004";

export interface Listener {
  key: string;
  timeout: number | null;
  fn: (msg: PutMessage | CrdtMessage) => void;
}

interface Verificator<T> {
  key: string;
  fn: (msg: VerificationData<T> & BaseMessage) => Promise<boolean>;
}

export default class ToolDb extends EventEmitter {
  private _network;
  private _store;
  private _peers: Record<string, Peer> = {};

  public logger = logger;

  private _documents: Record<string, FreezeObject<any>> = {};

  public _pubKey: string | undefined = undefined;

  public clientOnMessage = toolDbClientOnMessage;

  public verifyMessage = verifyMessage;

  private _subscriptions: string[] = [];

  public isConnected = false;

  get subscriptions() {
    return this._subscriptions;
  }

  get pubKey() {
    return this._pubKey;
  }

  private _processedIds: Record<string, string[]> = {};

  get processedIds() {
    return this._processedIds;
  }

  private _processedOutHashes: Record<string, string[]> = {};

  get processedOutHashes() {
    return this._processedOutHashes;
  }

  get serverPeers() {
    return Object.values(this._peers).filter((peer) => peer.isServer);
  }

  public subscribeData = toolDbSubscribe;

  // Emitted when there are no more server peers connected to
  public onDisconnect = () => {
    //
  };

  // Emitted when a server peer responds with "pong"
  public onConnect = () => {
    //
  };

  public onPeerDisconnect = (peerId: string) => {
    //
  };

  public onPeerConnect = (peerId: string) => {
    //
  };

  public loadCrdtDocument = loadCrdtDocument;

  public getData = toolDbGet;

  public putData = toolDbPut;

  public putCrdt = toolDbCrdtPut;

  public getCrdt = toolDbCrdtGet;

  public queryKeys = toolDbQueryKeys;

  public doFunction = toolDbFunction;

  public getPubKey = toolDbGetPubKey;

  public serverSync = toolDbServerSync;

  public signIn = toolDbSignIn;

  public anonSignIn = toolDbAnonSignIn;

  public keysSignIn = toolDbKeysSignIn;

  public signUp = toolDbSignUp;

  public verify = toolDbVerificationWrapper;

  // All message handlers go here
  public handlePing = handlePing;
  public handlePong = handlePong;
  public handleCrdt = handleCrdt;
  public handleCrdtGet = handleCrdtGet;
  public handleCrdtPut = handleCrdtPut;
  public handleGet = handleGet;
  public handlePut = handlePut;
  public handleQuery = handleQuery;
  public handleSubscribe = handleSubscribe;
  public handleFunction = handleFunction;

  /**
   * id listeners listen for a specific message ID just once
   */
  public _idListeners: Record<string, (msg: ToolDbMessage) => void> = {};

  public addIdListener = (id: string, fn: (msg: ToolDbMessage) => void) => {
    this._idListeners[id] = fn;
  };

  public removeIdListener = (id: string) => {
    delete this._idListeners[id];
  };

  public getUserNamespacedKey(key: string) {
    return ":" + (this.user?.pubKey || "") + "." + key;
  }

  /**
   * Server functions allow the server to define functions to be executed by the clients
   * It is up to the function creator to specify proper security on these.
   * Server functions are meant to execute on data stored on the server, in a way the clients
   * dont have to overload the server, use with caution!
   * Custom functions are expected to be a Promise that resolves to a string, and arguments are
   * passed as an array of values. Type and sanity checking is up to the developer.
   */
  private _functions: Record<string, ServerFunction<any, any>> = {};

  get functions() {
    return this._functions;
  }
  public addServerFunction<A, R>(
    functionName: string,
    fn: ServerFunction<A, R>
  ) {
    this._functions[functionName] = fn;
  }

  /**
   * Key listeners listen for a specific key, as long as the listener remains active
   */
  public _keyListeners: (Listener | null)[] = [];

  public addKeyListener = <T>(
    key: string,
    fn: (msg: PutMessage<T> | CrdtMessage) => void
  ) => {
    const newListener: Listener = {
      key,
      timeout: null,
      fn,
    };
    this._keyListeners.push(newListener);

    return this._keyListeners.length;
  };

  public removeKeyListener = (id: number) => {
    if (this._keyListeners[id]?.timeout) {
      clearTimeout(this._keyListeners[id]?.timeout || undefined);
    }

    this._keyListeners[id] = null;
  };

  public triggerKeyListener = (
    key: string,
    message: PutMessage | CrdtMessage
  ) => {
    // console.warn(`triggerKeyListener ${key}`);
    this._keyListeners.forEach((listener) => {
      if (listener?.key === key) {
        // console.log(`TRIGGER OK`, message);
        if (listener.timeout) {
          clearTimeout(listener.timeout);
        }
        listener.timeout = setTimeout(
          () => listener.fn(message),
          this.options.triggerDebouce
        ) as any;
      }
    });
  };

  /**
   * Custom verificators can enhance default verification on any key field
   */
  public _customVerificator: (Verificator<any> | null)[] = [];

  public addCustomVerification = <T = any>(
    key: string,
    fn: (msg: VerificationData & BaseMessage) => Promise<boolean>
  ) => {
    const newListener: Verificator<T> = {
      key,
      fn,
    };

    this._customVerificator.push(newListener);
    return this._customVerificator.length;
  };

  public removeCustomVerification = (id: number) => {
    this._customVerificator[id] = null;
  };

  public user = undefined as
    | undefined
    | {
        keys: {
          signKeys: CryptoKeyPair;
          encryptionKeys: CryptoKeyPair;
        };
        name: string;
        pubKey: string;
      };

  private _options: ToolDbOptions = {
    db: "tooldb",
    maxRetries: 5,
    triggerDebouce: 100,
    wait: 2000,
    pow: 0,
    server: false,
    host: "127.0.0.1",
    port: 8080,
    debug: false,
    httpServer: undefined,
    networkAdapter: toolDbNetwork,
    storageName: "tooldb",
    storageAdapter: typeof window === "undefined" ? leveldb : indexedb,
    topic: "",
    defaultKeys: undefined,
    maxPeers: 4,
    ssl: false,
    serverName: "default-server",
  };

  get options() {
    return this._options;
  }

  get network() {
    return this._network;
  }

  get peers() {
    return this._peers;
  }

  get store() {
    return this._store;
  }

  get documents() {
    return this._documents;
  }

  constructor(options: Partial<ToolDbOptions> = {}) {
    super();

    this._options = { ...this.options, ...options };

    if (!this._options.defaultKeys) {
      generateKeyPair("ECDSA", false).then((key) => {
        if (key.publicKey && key.privateKey) {
          this._options.defaultKeys = key;

          exportKey("spki", key.publicKey).then((skpub) => {
            this._pubKey = arrayBufferToHex(skpub as ArrayBuffer);

            if (this._pubKey.startsWith(KEY_PREFIX)) {
              this._pubKey = this._pubKey.slice(KEY_PREFIX.length);
            }

            this.emit("init", this._pubKey);
          });
        }
      });
    } else {
      exportKey("spki", this._options.defaultKeys.publicKey as CryptoKey).then(
        (skpub) => {
          this._pubKey = arrayBufferToHex(skpub as ArrayBuffer);

          if (this._pubKey.startsWith(KEY_PREFIX)) {
            this._pubKey = this._pubKey.slice(KEY_PREFIX.length);
          }

          this.emit("init", this._pubKey);
        }
      );
    }

    // These could be made to be customizable by setting the variables as public
    this._network = new this.options.networkAdapter(this);
    this._store = this.options.storageAdapter(this.options.storageName);
  }
}
