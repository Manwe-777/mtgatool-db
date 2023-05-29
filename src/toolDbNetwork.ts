import WebSocket from "ws";

import {
  ToolDb,
  sha1,
  textRandom,
  ToolDbNetworkAdapter,
  ToolDbMessage,
  signData,
  ServerPeerData,
} from ".";
import arrayBufferToHex from "./utils/arrayBufferToHex";
import waitFor from "./utils/waitFor";

type SocketMessageFn = (socket: WebSocket, e: { data: any }) => void;

interface ConnectionAwaiting {
  socket: WebSocket;
  tries: number;
  defer: null | number;
  server: ServerPeerData;
}

interface MessageQueue {
  message: ToolDbMessage;
  to: string[];
}

const announceSecs = 30;

const defaultTrackerUrls = [
  // "wss://tooldb-tracker.herokuapp.com/",
  "wss://tracker.fastcast.nz",
  "wss://tracker.openwebtorrent.com:443/announce",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.webtorrent.io",
  "wss://tracker.files.fm:7073/announce",
  // "wss://spacetradersapi-chatbox.herokuapp.com:443/announce",
];

export default class ToolDbNetwork extends ToolDbNetworkAdapter {
  private _window =
    typeof window === "undefined" ? undefined : (window as any | undefined);

  private isNode = typeof jest !== "undefined" || typeof window === "undefined";

  private wss =
    !this.isNode && this._window
      ? this._window.WebSocket ||
        this._window.webkitWebSocket ||
        this._window.mozWebSocket
      : WebSocket;

  private sockets: Record<string, WebSocket | null> = {};

  private socketListeners: Record<string, SocketMessageFn> = {};

  private connectedServers: Record<string, WebSocket> = {};

  public serverPeerData: Record<string, ServerPeerData> = {};

  private serversFinding: string[] = [];

  public announceInterval: any;

  private trackerUrls = defaultTrackerUrls; // .slice(0, 2);

  private handledOffers: Record<string, boolean> = {};

  private _awaitingConnections: Record<string, ConnectionAwaiting> = {};

  // We need to create a queue to handle a situation when we need
  // to contact a server, but we havent connected to it yet.
  private _messageQueue: MessageQueue[] = [];

  get messageQueue() {
    return this._messageQueue;
  }

  public pushToMessageQueue(msg: ToolDbMessage, to: string[]) {
    this._messageQueue.push({
      message: msg,
      to,
    });
  }

  private removeFromAwaiting = (pubkey: string) => {
    if (this._awaitingConnections[pubkey]) {
      delete this._awaitingConnections[pubkey];
    }
  };

  /**
   * Makes a websocket connection to a tracker
   */
  private makeSocket = (url: string) => {
    return new Promise<WebSocket | null>((resolve) => {
      if (!this.sockets[url]) {
        // this.tooldb.logger("begin tracker connection " + url);

        this.socketListeners[url] = this.onSocketMessage;

        try {
          const socket = new this.wss(url);
          // eslint-disable-next-line func-names
          const socks = this.sockets;
          socket.onopen = function () {
            socks[url] = this;
            resolve(this);
          };
          socket.onmessage = (e: any) => this.socketListeners[url](socket, e);

          // eslint-disable-next-line func-names
          socket.onerror = () => {
            // removing trackers just because the error event seems like a mistake
            // trackers can get disconnected and be absolutely healthy.
            // const index = this.trackerUrls.indexOf(url);
            // this.trackerUrls.splice(index, 1);
            resolve(null);
          };
        } catch (e) {
          this.tooldb.logger("makeSocket error url " + url, e);
          resolve(null);
        }
      } else {
        resolve(this.sockets[url]);
      }
    });
  };

  /*
   * Make a serverPeerData object from our keys
   */
  public getServerPeerData = () => {
    return new Promise<ServerPeerData | null>((resolve, reject) => {
      if (this.tooldb.options.defaultKeys?.privateKey) {
        signData(
          this.tooldb.options.host,
          this.tooldb.options.defaultKeys?.privateKey
        ).then((signature) => {
          const data = {
            host: this.tooldb.options.host,
            port: this.tooldb.options.port,
            ssl: this.tooldb.options.ssl,
            name: this.tooldb.options.serverName,
            pubKey: this.tooldb.getPubKey(),
            signature: arrayBufferToHex(signature),
          } as ServerPeerData;
          resolve(data);
        });
      } else {
        reject();
      }
    });
  };

  /**
   * Announce ourselves to a tracker (send "announce")
   */
  private announce = async (socket: WebSocket, infoHash: string) => {
    const pubKey = this.getClientAddress();
    // this.tooldb.logger("announce", infoHash, pubKey);
    if (pubKey) {
      if (this.tooldb.options.server) {
        this.getServerPeerData().then((offer) => {
          const offers = [0, 1, 2].map((n) => {
            return {
              offer: { sdp: JSON.stringify(offer), type: "offer" },
              offer_id: textRandom(20),
            };
          });

          // this.tooldb.logger("announce offer", offer);

          const message = {
            action: "announce",
            info_hash: infoHash,
            peer_id: pubKey.slice(-20),
            numwant: 1,
            offers,
          };
          socket.send(JSON.stringify(message));
        });
      } else {
        const message = {
          action: "announce",
          info_hash: infoHash,
          peer_id: pubKey.slice(-20),
          numwant: 1,
        };
        socket.send(JSON.stringify(message));
        // this.tooldb.logger("announce message", message);
      }
    }
  };

  /**
   * Announce ourselves to all trackers
   */
  private announceAll = async () => {
    const infoHash = this.codeToHash(this.tooldb.getPubKey());

    this.tooldb.logger(`announce all start`);

    this.trackerUrls.forEach(async (url: string, index) => {
      // this.tooldb.logger(
      //   `announce: "${this.tooldb.options.serverName}" (${infoHash})`
      // );
      const socket = await this.makeSocket(url);
      //this.tooldb.logger(" ok tracker " + url);
      // this.tooldb.logger("socket", url, index);
      if (socket && socket.readyState === 1) {
        //this.tooldb.logger("announce to " + url);
        this.announce(socket, infoHash);
      }
    });
  };

  public codeToHash(code: string) {
    return sha1(code).slice(-20);
  }

  /**
   * Announce on trackers for a server
   * Connects to it if found
   */
  public findServer = async (serverKey: string) => {
    if (!this.serversFinding.includes(serverKey)) {
      this.serversFinding.push(serverKey);
      const infoHash = this.codeToHash(serverKey);
      this.tooldb.logger(`findServer: "${serverKey}" (${infoHash})`);

      this.trackerUrls.forEach(async (url: string) => {
        const socket = await this.makeSocket(url);
        if (socket && socket.readyState === 1) {
          this.announce(socket, infoHash);
        }
      });
    }
  };

  /**
   * Handle the tracker messages
   */
  private onSocketMessage: SocketMessageFn = async (
    socket: WebSocket,
    e: any
  ) => {
    let val: {
      info_hash: string;
      peer_id: string;
      "failure reason"?: string;
      interval?: number;
      offer?: {
        sdp: string;
        type: string;
      };
      offer_id: string;
      answer?: string;
    };

    try {
      val = JSON.parse(e.data);
      this.tooldb.logger("onSocketMessage", socket.url, val);
    } catch (_e: any) {
      this.tooldb.logger(`Received malformed JSON`, e.data);
      return;
    }

    const failure = val["failure reason"];

    if (failure) {
      this.tooldb.logger(`${e.origin}: torrent tracker failure (${failure})`);
      return;
    }

    if (val.peer_id && val.peer_id === this.getClientAddress()?.slice(-20)) {
      // this.tooldb.logger("Peer ids mismatch", val.peer_id, selfId);
      return;
    }

    if (val.offer && val.offer_id) {
      if (this.handledOffers[val.offer_id]) {
        return;
      }

      this.handledOffers[val.offer_id] = true;

      const serverData = JSON.parse(val.offer.sdp);

      if (this.connectedServers[serverData.pubKey] === undefined) {
        this.tooldb.logger("Now we connect to ", serverData);
        this.connectTo(serverData);
      } else {
        // we already connected, unplug all trackers/unsubscribe
      }

      return;
    }
  };

  constructor(db: ToolDb) {
    super(db);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const _this = this;
    if (_this.tooldb.options.server) {
      waitFor(() => _this.tooldb.getPubKey() !== undefined).then(() => {
        setTimeout(function () {
          _this.announceInterval = setInterval(
            _this.announceAll,
            announceSecs * 1000
          );
          _this.announceAll();
        }, 500);
      });
    }

    // Basically the same as the WS network adapter
    // Only for Node!
    if (this.tooldb.options.server && this.isNode) {
      const server = new WebSocket.Server({
        port: this.tooldb.options.port,
        server: this.tooldb.options.httpServer,
      });

      server.on("connection", (socket: WebSocket) => {
        let clientId: string | null = null;

        socket.on("close", () => {
          if (clientId) {
            this.onClientDisconnect(clientId);
          }
        });

        socket.on("error", () => {
          if (clientId) {
            this.onClientDisconnect(clientId);
          }
        });

        socket.on("message", (message: string) => {
          this.onClientMessage(message, clientId || "", (id) => {
            clientId = id;
            this.isClientConnected[id] = () => {
              return socket.readyState === socket.OPEN;
            };
            this.clientToSend[id] = (_msg: string) => {
              socket.send(_msg);
            };
          });
        });
      });
    }
  }

  /**
   * Open a connection to a server
   * @param url URL of the server (including port)
   * @returns websocket
   */
  public connectTo = (serverPeer: ServerPeerData): WebSocket | undefined => {
    this.tooldb.logger("connectTo:", serverPeer);
    try {
      const wsUrl = serverPeer.ssl
        ? "wss://" + serverPeer.host
        : "ws://" + serverPeer.host + ":" + serverPeer.port;

      const wss = new this.wss(wsUrl);
      let clientId = serverPeer.pubKey;

      // Unlike other network adapters, we can just use the public key
      // to identify connections.
      // Therefore, we dont have to wait for a pong message to
      // initialize these internal functions
      this.isClientConnected[serverPeer.pubKey] = () => {
        return wss.readyState === wss.OPEN;
      };

      this.clientToSend[serverPeer.pubKey] = (_msg: string) => {
        wss.send(_msg);
      };

      const previousConnection = this._awaitingConnections[serverPeer.pubKey];
      if (previousConnection) {
        // this.tooldb.logger("previousConnection");
        this._awaitingConnections[serverPeer.pubKey].socket = wss;
      } else {
        // this.tooldb.logger("new connection");
        this._awaitingConnections[serverPeer.pubKey] = {
          socket: wss,
          tries: 0,
          defer: null,
          server: { ...serverPeer },
        };
      }

      wss.onclose = (_error: any) => {
        this.tooldb.logger("wss.onclose");
        this.reconnect(serverPeer.pubKey);
      };

      wss.onerror = (_error: any) => {
        this.tooldb.logger("wss.onerror");
        if (_error?.error?.code !== "ETIMEDOUT") {
          this.reconnect(serverPeer.pubKey);
        }
      };

      wss.onopen = () => {
        this.removeFromAwaiting(serverPeer.pubKey);
        this.tooldb.logger(
          `Connected to ${serverPeer.host}:${serverPeer.port} sucessfully.`
        );

        // hi peer
        this.craftPingMessage().then((msg) => {
          wss.send(msg);
        });

        this.serverPeerData[serverPeer.pubKey] = serverPeer;
        this.connectedServers[serverPeer.pubKey] = wss;
      };

      wss.onmessage = (msg: WebSocket.MessageEvent) => {
        if (!msg) {
          return;
        }

        this.onClientMessage(msg.data as string, clientId, (id) => {
          clientId = id;
        });
      };

      return wss;
    } catch (e) {
      this.tooldb.logger("onconnect err", e);
    }
    return undefined;
  };

  private reconnect = (pubkey: string) => {
    const connection = this._awaitingConnections[pubkey];
    if (connection) {
      if (connection.defer) {
        clearTimeout(connection.defer);
      }

      this.tooldb.logger(`tries: ${connection.tries}`);
      if (connection.tries < this.tooldb.options.maxRetries) {
        const defer = () => {
          this._awaitingConnections[pubkey].tries += 1;
          this.tooldb.logger(
            `connection to ${connection.server.host}:${connection.server.port} retry.`
          );
          this.connectTo(connection.server);
        };

        connection.defer = setTimeout(defer, this.tooldb.options.wait) as any;
      } else {
        this.tooldb.logger(
          `connection attempts to ${connection.server.host}:${connection.server.port} exceeded,`
        );
        this.removeFromAwaiting(pubkey);
      }
    }
    // else , attempting to reconnect to a missing peer?
  };

  public sendToAll(msg: ToolDbMessage, crossServerOnly = false) {
    if (crossServerOnly) {
      this.sendToAllServers(msg);
    } else {
      this.pushToMessageQueue(msg, []);
      this.tryExecuteMessageQueue();
    }
  }

  public sendToClientId(clientId: string, msg: ToolDbMessage): void {
    this.pushToMessageQueue(msg, [clientId]);
    this.tryExecuteMessageQueue();
  }

  public sendToAllServers(msg: ToolDbMessage): void {
    this.pushToMessageQueue(msg, Object.keys(this.connectedServers));
    this.tryExecuteMessageQueue();
  }

  private tryExecuteMessageQueue() {
    const sentMessageIDs: string[] = [];
    this._messageQueue.forEach((q) => {
      const message = q.message;
      const pubKey = this.getClientAddress();

      if (pubKey && !message.to.includes(pubKey)) {
        message.to.push(pubKey);
      }

      const finalMessageString = JSON.stringify(message);

      if (q.to.length > 0) {
        // Send only to select clients
        // try to connect if not found
        q.to.forEach((toClient) => {
          if (
            this.isClientConnected[toClient] &&
            this.isClientConnected[toClient]()
          ) {
            this.clientToSend[toClient](finalMessageString);
            sentMessageIDs.push(message.id);
          }

          if (this.connectedServers[toClient] === undefined) {
            this.findServer(toClient);
          }
        });
      } else {
        // send to all currently connected clients
        Object.keys(this.clientToSend).forEach((toClient) => {
          if (
            this.isClientConnected[toClient] &&
            this.isClientConnected[toClient]()
          ) {
            this.clientToSend[toClient](finalMessageString);
            sentMessageIDs.push(message.id);
          }
        });
      }
    });

    sentMessageIDs.forEach((id) => {
      const index = this._messageQueue.findIndex(
        (msg) => msg.message.id === id
      );
      this._messageQueue.splice(index, 1);
    });

    if (this._messageQueue.length > 0) {
      setTimeout(() => {
        this.tryExecuteMessageQueue();
      }, 250);
    }
  }
}
