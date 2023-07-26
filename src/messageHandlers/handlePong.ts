import { ToolDb, PongMessage } from "..";
import verifyPeer from "../utils/verifyPeer";

export default function handlePong(
  this: ToolDb,
  message: PongMessage,
  remotePeerId: string
) {
  if (!this.isConnected) {
    this.isConnected = true;
    this.onConnect();
  }

  if (message.servers) {
    message.servers.forEach((peer) => {
      verifyPeer(peer).then((verified) => {
        // Verify integrity and topic
        if (verified && peer.topic === this.options.topic) {
          // Add this peer to our list of peers
          this.peers[peer.pubkey] = peer;
        }
      });
    });
  }

  this.onPeerConnect(message.clientId);
}
