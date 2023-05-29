import Automerge from "automerge";

import { base64ToBinaryDocument, textRandom, ToolDb, ToolDbNetwork } from "..";
import leveldb from "../utils/leveldb";
import waitFor from "../utils/waitFor";
jest.setTimeout(50000);

let nodeA: ToolDb;
let nodeB: ToolDb;
let Alice: ToolDb;
let Bob: ToolDb;

beforeAll((done) => {
  // Node A - Server
  nodeA = new ToolDb({
    server: true,
    host: "127.0.0.1",
    ssl: false,
    port: 6666,
    storageName: "test-node-a",
    serverName: "test-node-a",
    topic: "jest",
    storageAdapter: leveldb,
  });
  nodeA.onConnect = () => checkIfOk("a");

  // Node B - Server
  nodeB = new ToolDb({
    server: true,
    // Node A is going to be our "bootstrap" node
    host: "127.0.0.1",
    ssl: false,
    port: 5555,
    storageName: "test-node-b",
    serverName: "test-node-b",
    topic: "jest",
    storageAdapter: leveldb,
  });
  nodeB.onConnect = () => checkIfOk("b");

  waitFor(() => nodeA.getPubKey() !== undefined).then(() => {
    (nodeA.network as ToolDbNetwork).getServerPeerData().then((data) => {
      if (data) {
        (nodeB.network as ToolDbNetwork).connectTo(data);
      }
    });
  });

  // Alice - Client
  Alice = new ToolDb({
    server: false,
    storageName: "test-alice",
    storageAdapter: leveldb,
    wait: 1000,
    topic: "jest",
  });
  Alice.onConnect = () => checkIfOk("c");

  waitFor(() => nodeA.getPubKey() !== undefined).then(() => {
    (nodeA.network as ToolDbNetwork).getServerPeerData().then((data) => {
      if (data) {
        (Alice.network as ToolDbNetwork).connectTo(data);
      }
    });
  });

  // Bob - Client
  Bob = new ToolDb({
    server: false,
    storageName: "test-bob",
    storageAdapter: leveldb,
    topic: "jest",
  });
  Bob.onConnect = () => checkIfOk("d");

  waitFor(() => nodeB.getPubKey() !== undefined).then(() => {
    (nodeB.network as ToolDbNetwork).getServerPeerData().then((data) => {
      if (data) {
        (Bob.network as ToolDbNetwork).connectTo(data);
      }
    });
  });

  const connected: string[] = [];
  const checkIfOk = (id: string) => {
    if (!connected.includes(id)) {
      connected.push(id);

      if (connected.length === 4) {
        setTimeout(() => done(), 2000);
      }
    }
  };
});

afterAll((done) => {
  const nodeANetwork = nodeA.network as ToolDbNetwork;
  nodeANetwork.stopAnnounce();
  const nodeBNetwork = nodeB.network as ToolDbNetwork;
  nodeBNetwork.stopAnnounce();
  const AliceNetwork = Alice.network as ToolDbNetwork;
  AliceNetwork.stopAnnounce();
  const BobNetwork = Bob.network as ToolDbNetwork;
  BobNetwork.stopAnnounce();

  if (nodeA.network.server) nodeA.network.server.close();
  if (nodeB.network.server) nodeB.network.server.close();
  if (nodeA?.store) nodeA.store.quit();
  if (nodeB?.store) nodeB.store.quit();
  if (Alice?.store) Alice.store.quit();
  if (Bob?.store) Bob.store.quit();
  setTimeout(() => done(), 1000);
});

it("A and B can communicate trough the swarm", () => {
  return new Promise<void>((resolve) => {
    const testKey = "test-key-" + textRandom(16);
    const testValue = "Awesome value";

    Alice.anonSignIn()
      .then(() => Bob.anonSignIn())
      .then(() => {
        Alice.putData(testKey, testValue).then((msg) => {
          expect(msg).toBeDefined();

          setTimeout(() => {
            Bob.getData(testKey).then((data) => {
              expect(data).toBe(testValue);
              resolve();
            });
          }, 1000);
        });
      });
  });
});

it("A can sign up and B can sign in", () => {
  return new Promise<void>((resolve) => {
    const testUsername = "test-username-" + textRandom(16);
    const testPassword = "im a password";

    Alice.signUp(testUsername, testPassword).then((result) => {
      setTimeout(() => {
        Bob.signIn(testUsername, testPassword).then((res) => {
          expect(Bob.user).toBeDefined();
          expect(Bob.user?.name).toBe(testUsername);

          // test for failed sign in
          Bob.signIn(testUsername, testPassword + " ").catch((e) => {
            expect(e).toBe("Invalid password");
            resolve();
          });
        });
      }, 2000);
    });
  });
});

it("Can cancel GET timeout", () => {
  return new Promise<void>((resolve) => {
    const testKey = "crdt-get-test-" + textRandom(16);
    const testValue = textRandom(24);

    Alice.putData(testKey, testValue).then(() => {
      Alice.getData(testKey, false, 1).then((res) => {
        expect(res).toBe(testValue);
        resolve();
      });
    });
  });
});

it("CRDTs", () => {
  return new Promise<void>((resolve) => {
    const crdtKey = "crdt-test-" + textRandom(16);
    const crdtValue = textRandom(24);

    const origDoc = Automerge.init();
    const oneDoc = Automerge.change(origDoc, (doc: any) => {
      doc.test = crdtValue;
      doc.arr = ["arr"];
    });

    const newDoc = Automerge.change(oneDoc, (doc: any) => {
      doc.arr.push("test");
    });

    const changes = Automerge.getChanges(origDoc, newDoc);
    Alice.putCrdt(crdtKey, changes).then((put) => {
      setTimeout(() => {
        Bob.getCrdt(crdtKey).then((data) => {
          expect(data).toBeDefined();
          const doc = Automerge.load(
            base64ToBinaryDocument(data as string)
          ) as any;
          expect(doc.test).toBe(crdtValue);
          expect(doc.arr).toStrictEqual(["arr", "test"]);
          resolve();
        });
      }, 1000);
    });
  });
});
