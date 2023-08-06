export default function getCrypto(this: any): typeof window.crypto {
  if (typeof window === "undefined") {
    if (self.document === undefined) {
      // inside a web worker
      return crypto;
    } else {
      // inside node
      return require("crypto").webcrypto;
    }
  }

  // browsers
  return window.crypto;
}
