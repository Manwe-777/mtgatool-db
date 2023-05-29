import { error } from "console";
import ToolDb from "./tooldb";

export default function toolDbGetPubKey(this: ToolDb) {
  if (this.pubKey === "" || this.pubKey === undefined) {
    throw new Error("You are not authorized yet.");
  }

  return this.pubKey;
}
