import fs from "fs";
import saveKeysComb from "./utils/crypto/saveKeysComb";
import generateKeysComb from "./utils/crypto/generateKeysComb";

generateKeysComb().then(({ signKeys, encryptionKeys }) => {
  saveKeysComb(signKeys, encryptionKeys).then((keys) => {
    fs.writeFile("keys.json", JSON.stringify(keys), console.log);
  });
});
