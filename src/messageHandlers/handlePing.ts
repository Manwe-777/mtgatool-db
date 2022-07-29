import { ToolDb, PingMessage, PongMessage } from "..";
import verifyPeer from "../utils/verifyPeer";

export default function handlePing(
  this: ToolDb,
  message: PingMessage,
  remotePeerId: string
) {
  if (!this.isConnected) {
    this.isConnected = true;
    this.onConnect();
  }

  verifyPeer(message.peer).then((verified) => {
    // Verify integrity and topic
    if (verified && message.peer.topic === this.options.topic) {
      this.peers[message.peer.pubkey.slice(-20)] = message.peer;
      // Add this peer to our list of peers
      const filteredPeers = this.serverPeers.filter(
        (p) => p.pubkey === message.peer.pubkey
      );
      if (filteredPeers.length === 0 && message.isServer) {
        // Add this peer to the list
        this.serverPeers.push(message.peer);
      }

      this.network.sendToClientId(remotePeerId, {
        type: "pong",
        isServer: this.options.server,
        clientId: this.network.getClientAddress(),
        to: [],
        servers: this.serverPeers,
        id: message.id,
      } as PongMessage);

      this.onPeerConnect(message.peer.pubkey);
    } else {
      this.logger("Blocked a remote peer from joining; ", message);
      // Drop connection here!
    }
  });
}
