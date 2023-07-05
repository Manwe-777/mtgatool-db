import { AllowedFunctionArguments, FunctionCodes, textRandom } from ".";
import ToolDb from "./tooldb";

interface FunctionReturnData {
  return: AllowedFunctionArguments;
  code: FunctionCodes;
}

/**
 * Triggers a FUNCTION request to other peers. If the function executes sucessfully it will return code "OK"
 * @param function function name
 * @param args arguments for the function
 * @param timeout Max time to wait for remote.
 * @returns Promise<Data>
 */
export default function toolDbGet(
  this: ToolDb,
  fName: string,
  args: AllowedFunctionArguments[],
  timeoutMs = 10000
): Promise<FunctionReturnData> {
  return new Promise((resolve, reject) => {
    this.logger("FUNCTION > " + fName);

    const msgId = textRandom(10);

    const cancelTimeout = setTimeout(() => {
      resolve({ return: "Timed out", code: "ERR" });
    }, timeoutMs);

    this.addIdListener(msgId, (msg) => {
      this.logger("FUNCTION RECV  > " + fName, msg);

      clearTimeout(cancelTimeout);
      if (msg.type === "functionReturn") {
        resolve({ return: msg.return, code: msg.code });
      }
    });

    // Do get
    this.network.sendToAll({
      type: "function",
      to: [],
      function: fName,
      args: args,
      id: msgId,
    });
  });
}
