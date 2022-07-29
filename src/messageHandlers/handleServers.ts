import { ServersMessage, ToolDb } from "..";
import verifyPeer from "../utils/verifyPeer";

export default function handleServers(
  this: ToolDb,
  message: ServersMessage,
  remotePeerId: string
) {
  message.servers.forEach((peer) => {
    verifyPeer(peer).then((verified) => {
      // Add this peer to our list of peers
      if (verified) {
        this.peers[peer.pubkey.slice(-20)] = peer;
      }
    });
  });
}
