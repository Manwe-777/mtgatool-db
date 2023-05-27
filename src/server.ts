import ToolDb from "./tooldb";
import fs from "fs";
import loadKeysComb from "./utils/crypto/loadKeysComb";
import ToolDbNetwork from "./toolDbNetwork";

const keys = JSON.parse(fs.readFileSync("keys.json", "utf8"));

loadKeysComb(keys).then((keyPairs) => {
  console.log("Starting server..");
  const server = new ToolDb({
    port: 8080,
    ssl: false,
    server: true,
    topic: "mtgatool-db-swarm-v4",
    defaultKeys: keyPairs?.signKeys,
    debug: true,
  });

  server.on("init", (id) => {
    console.log("Server started");
    console.log("Public Key: ", id);

    const network = server.network as ToolDbNetwork;
    network.connectTo({
      host: "66.97.46.144",
      port: 443,
      ssl: true,
      name: "api.mtgatool.com",
      pubKey: "api.mtgatool.com",
      signature: "",
    });
  });
});
