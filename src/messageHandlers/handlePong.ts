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
          this.peers[peer.pubkey] = peer;
          // Add this peer to our list of peers
          const filteredPeers = this.serverPeers.filter(
            (p) => p.pubkey === peer.pubkey
          );
          if (filteredPeers.length === 0 && peer.host && peer.port) {
            // Add this peer to the list
            this.serverPeers.push(peer);
          }
        }
      });
    });
  }

  this.onPeerConnect(message.clientId);
}
