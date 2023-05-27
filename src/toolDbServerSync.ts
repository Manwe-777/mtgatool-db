import _ from "lodash";
import ToolDb from "./tooldb";
import textRandom from "./utils/textRandom";

/**
 * Queries the given server peer for all documents that arent present
 * if our local database.
 * Returns the number of documents that were synced.
 * @param pubKey server public key
 * @returns Promise<number>
 */
export default function toolDbServerSync(
  this: ToolDb,
  pubKey: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    let localKeys: string[] = [];

    this.store.query("").then((keys) => {
      localKeys = keys;

      queryAllKeys(this, pubKey).then((remoteKeys) => {
        if (remoteKeys) {
          const missingKeys = _.difference(remoteKeys, localKeys);

          if (missingKeys.length > 0) {
            this.logger("MISSING KEYS > ", missingKeys.length);

            const msgId = textRandom(10);
            let synced = 0;

            this.addIdListener(msgId, (msg) => {
              this.logger("SERVER SYNC RECV  > ", msg);

              if (msg.type === "put") {
                synced++;
              }

              if (synced === missingKeys.length) {
                resolve(synced);
              }
            });

            // Do get
            this.network.sendToClientId(pubKey, {
              type: "get",
              to: [],
              key: missingKeys[0],
              id: msgId,
            });
          }
        }
      });
    });
  });
}

function queryAllKeys(
  tooldb: ToolDb,
  serverPubKey: string,
  timeoutMs = 1000
): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    if (tooldb.user?.pubKey === undefined) {
      reject(new Error("You are not authorized yet!"));
      return;
    }

    tooldb.logger("QUERY ALL > " + serverPubKey);

    const msgId = textRandom(10);
    let foundKeys: string[] = [];
    let timeout: NodeJS.Timeout | undefined;

    const finishListening = () => {
      resolve(_.uniq(foundKeys));
    };

    tooldb.addIdListener(msgId, (msg) => {
      tooldb.logger("QUERY ALL RECV  > ", msg);

      if (msg.type === "queryAck") {
        foundKeys = [...foundKeys, ...msg.keys];

        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(finishListening, timeoutMs);
      }
    });

    // Do get
    tooldb.network.sendToClientId(serverPubKey, {
      type: "query",
      to: [],
      key: "",
      id: msgId,
    });
  });
}
