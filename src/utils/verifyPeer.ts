import { base64ToArrayBuffer, importKey, sha256, verifyData } from "..";
import { KEY_PREFIX } from "../tooldb";
import { Peer } from "../types/tooldb";
import hexToArrayBuffer from "./hexToArrayBuffer";

export default function verifyPeer(peer: Peer) {
  // Import the public key string
  return importKey(
    hexToArrayBuffer(KEY_PREFIX + peer.pubkey),
    "spki",
    "ECDSA",
    ["verify"]
  ).then((pubKey) =>
    verifyData(
      sha256(`${peer.topic}-${peer.timestamp}-${peer.host}:${peer.port}`),
      base64ToArrayBuffer(peer.sig),
      pubKey,
      "SHA-1"
    )
  );
}
