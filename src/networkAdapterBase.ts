import { ToolDb, PingMessage, ToolDbMessage, Peer, textRandom, uniq } from ".";
import getPeerSignature from "./utils/getPeerSignature";

export default class ToolDbNetworkAdapter {
  private _clientToSend: Record<string, (message: string) => void> = {};

  private _isClientConnected: Record<string, () => boolean> = {};

  private _clientIsServer: Record<string, boolean> = {};

  private _tooldb: ToolDb;

  constructor(db: ToolDb) {
    this._tooldb = db;

    db.on("init", () => {
      if (this.tooldb.options.server) {
        this.getMeAsPeer().then((meAsPeer) => {
          this.tooldb.serverPeers.push(meAsPeer);
        });
      }
    });
  }

  get clientToSend() {
    return this._clientToSend;
  }

  get isClientConnected() {
    return this._isClientConnected;
  }

  get tooldb() {
    return this._tooldb;
  }

  public getMeAsPeer() {
    const timestamp = new Date().getTime();
    if (this.tooldb.options.defaultKeys === undefined) return Promise.reject();
    else
      return getPeerSignature(
        this.tooldb.options.defaultKeys.privateKey as CryptoKey,
        this.tooldb.options.topic,
        timestamp,
        this.tooldb.options.host,
        this.tooldb.options.port
      ).then((signature) => {
        return {
          topic: this.tooldb.options.topic,
          timestamp: timestamp,
          host: this.tooldb.options.host,
          port: this.tooldb.options.port,
          pubkey: this.tooldb.getPubKey(),
          sig: signature,
        } as Peer;
      });
  }

  /**
   * Check if the specified client is connected or not
   * @param clientId Client ID
   * @returns boolean
   */
  public isConnected(clientId: string) {
    return this._isClientConnected[clientId]
      ? this._isClientConnected[clientId]()
      : false;
  }

  /**
   * Check if the specified client is a server/relay
   * @param clientId Client ID
   * @returns boolean
   */
  public isServer(clientId: string) {
    return this._clientIsServer[clientId] || false;
  }

  public craftPingMessage() {
    return this.getMeAsPeer().then((meAsPeer) => {
      return JSON.stringify({
        type: "ping",
        clientId: this.getClientAddress(),
        to: [this.getClientAddress()],
        isServer: this.tooldb.options.server,
        id: textRandom(10),
        peer: meAsPeer,
      } as PingMessage);
    });
  }

  /**
   * Execute the function to send a message to the specified client ID
   * @param clientId Client ID
   * @param message Message
   */
  private executeSendToClient(clientId: string, message: string) {
    if (this._clientToSend[clientId]) {
      this._clientToSend[clientId](message);
    }
  }

  public getClientAddress() {
    // This is not a good idea to use on all adapters, so it should be replaced
    // if its causing issues. The only reason we use the last 20 chars is to
    // muse the same peer address as the webrtc adapter.
    return this.tooldb.pubKey;
  }

  public onClientDisconnect(clientId: string) {
    delete this._clientToSend[clientId];
    delete this._clientIsServer[clientId];
    delete this._isClientConnected[clientId];
  }

  /**
   * Should be called as a message payload handler
   * This function will take care of processing the messages and also making sure
   * we use the correct response methods troughout the adapter.
   * @param message message payload
   * @param clientId Client ID (can be null for ping/pong)
   * @param setClientId Callback to set the client id on the parent class
   */
  public onClientMessage(
    message: string,
    clientId: string | null,
    setClientId: (clientId: string) => void
  ) {
    // this.tooldb.logger("onClientMessage", clientId);

    if (clientId && !this.tooldb.processedOutHashes[clientId]) {
      this.tooldb.processedOutHashes[clientId] = [];
    }

    try {
      const parsedMessage = JSON.parse(message) as ToolDbMessage;
      // We assume the first messages to arrive will always be ping or pong.
      // Only after that we can get the client id for this socket.
      if (parsedMessage.type === "ping" || parsedMessage.type === "pong") {
        const cid = parsedMessage.clientId;
        setClientId(cid);

        this._clientIsServer[cid] = parsedMessage.isServer;
        this.tooldb.processedOutHashes[cid] = [];
        this.tooldb.clientOnMessage(parsedMessage, cid);
      } else if (clientId) {
        this.tooldb.clientOnMessage(parsedMessage, clientId);
      }
    } catch (e) {
      this.tooldb.logger("Got message ERR", message);
      this.tooldb.logger(e);
    }
  }

  /**
   * Sends a message to all peers connected to us
   * This function takes care of the message deduplication, making sure we dont send
   * the same message twice to the same peer.
   * @param msg message data
   * @param crossServerOnly If this message should be send to server peers only
   * @param isRelay if we should relay this message
   */
  public sendToAll(msg: ToolDbMessage, crossServerOnly = false) {
    const pubkey = this.getClientAddress();
    const to = pubkey ? uniq([...msg.to, pubkey]) : msg.to;

    const finalMessage = JSON.stringify({ ...msg, to });

    const filteredConns = Object.keys(this.clientToSend)
      .filter((id) => !to.includes(id))
      .filter((clientId) => this.isConnected(clientId));

    filteredConns.forEach((clientId) => {
      if ((crossServerOnly && this.isServer(clientId)) || !crossServerOnly) {
        this.tooldb.logger(
          to.map((k) => k.slice(-20)),
          "Sent out to (all):",
          clientId.slice(-20)
        );

        if (msg.type === "put" || msg.type === "crdtPut") {
          if (!this.tooldb.processedOutHashes[clientId].includes(msg.h)) {
            this.executeSendToClient(clientId, finalMessage);
            this.tooldb.processedOutHashes[clientId].push(msg.h);
          }
        } else {
          this.executeSendToClient(clientId, finalMessage);
        }
      }
      // } else {
      //   this.tooldb.logger("Fitlered out;", clientId);
      // }
    });
  }

  /**
   * Sends a message to a single peer.
   * This function also takes care of the message deduplication.
   * @param clientId Peer/Client id we want to send to.
   * @param msg message data
   */
  public sendToClientId(clientId: string, msg: ToolDbMessage) {
    const pubkey = this.getClientAddress();
    const to = pubkey ? uniq([...msg.to, pubkey]) : msg.to;
    const finalMessage = JSON.stringify({ ...msg, to });

    this.tooldb.logger(
      to.map((k) => k.slice(-20)),
      "Sent out to (single):",
      clientId.slice(-20)
    );

    if (msg.type === "put" || msg.type === "crdtPut") {
      if (
        clientId &&
        !this.tooldb.processedOutHashes[clientId].includes(msg.h)
      ) {
        this.executeSendToClient(clientId, finalMessage);
        this.tooldb.processedOutHashes[clientId].push(msg.h);
      }
    } else {
      this.executeSendToClient(clientId, finalMessage);
    }
  }
}
