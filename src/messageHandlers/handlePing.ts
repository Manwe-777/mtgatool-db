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
      // Add this peer to our list of peers
      this.peers[message.peer.pubkey] = message.peer;

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
