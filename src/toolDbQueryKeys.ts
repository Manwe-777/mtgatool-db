import _ from "lodash";
import { textRandom } from ".";
import ToolDb from "./tooldb";

/**
 * Triggers a QUERY request to other peers.
 * @param key start of the key
 * @param userNamespaced If this key bolongs to a user or its public.
 * @param timeout Max time to wait for remote.
 * @param remoteOnly Only query remote peers, do not query local store.
 * @returns Promise<Data>
 */
export default function toolDbQueryKeys(
  this: ToolDb,
  key: string,
  userNamespaced = false,
  timeoutMs = 1000,
  remoteOnly = false
): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    if (userNamespaced && this.user?.pubKey === undefined) {
      reject(new Error("You are not authorized yet!"));
      return;
    }

    if (!userNamespaced && key.length < 3) {
      reject(new Error("Query key is too short"));
      return;
    }

    // if (!userNamespaced && key.startsWith(":")) {
    //   reject(
    //     new Error(
    //       "User namespace queries should use the userNamespaced argument"
    //     )
    //   );
    //   return;
    // }

    const finalKey = userNamespaced ? `:${this.user?.pubKey}.${key}` : key;
    this.logger("QUERY > " + finalKey);

    const msgId = textRandom(10);
    let foundKeys: string[] = [];
    let timeout: NodeJS.Timeout | undefined;

    let gotLocalKeys = remoteOnly;

    if (remoteOnly === false) {
      this.store.query(finalKey).then((localKeys) => {
        gotLocalKeys = true;
        foundKeys = [...foundKeys, ...localKeys];
        timeout = setTimeout(finishListening, timeoutMs);
      });
    }

    const finishListening = () => {
      resolve(_.uniq(foundKeys));
    };

    this.addIdListener(msgId, (msg) => {
      this.logger("QUERY RECV  > " + finalKey, msg);

      if (msg.type === "queryAck") {
        foundKeys = [...foundKeys, ...msg.keys];

        if (timeout) {
          clearTimeout(timeout);
        }
        if (gotLocalKeys === true) {
          timeout = setTimeout(finishListening, timeoutMs);
        }
      }
    });

    // Do get
    this.network.sendToAll({
      type: "query",
      to: [],
      key: finalKey,
      id: msgId,
    });
  });
}
