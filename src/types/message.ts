import {
  AllowedFunctionArguments,
  AllowedFunctionReturn,
  FunctionCodes,
  Peer,
} from "./tooldb";

export enum VerifyResult {
  CustomVerificationFailed = "CustomVerificationFailed",
  InvalidData = "InvalidData",
  InvalidVerification = "InvalidVerification",
  CantOverwrite = "CantOverwrite",
  InvalidTimestamp = "InvalidTimestamp",
  PubKeyMismatch = "PubKeyMismatch",
  NoProofOfWork = "NoProofOfWork",
  InvalidHashNonce = "InvalidHashNonce",
  InvalidSignature = "InvalidSignature",
  Verified = "Verified",
}

export interface VerificationData<T = any> {
  k: string; // Key/id
  p: string; // public key
  n: number; // nonce
  h: string; // hash of JSON.stringify(value) + nonce
  t: number; // Timestamp this was created
  s: string; // signature
  v: T; // value
}

export type MessageType =
  | "ping"
  | "pong"
  | "query"
  | "queryAck"
  | "function"
  | "functionReturn"
  | "subscribe"
  | "get"
  | "put"
  | "crdtPut"
  | "crdtGet"
  | "crdt";

export interface BaseMessage {
  type: MessageType;
  id: string; // unique random id for the message, to ack back
  to: string[]; // who was this message sent to already
}

export interface PingMessage extends BaseMessage {
  type: "ping";
  isServer: boolean;
  clientId: string;
  peer: Peer;
}

export interface PongMessage extends BaseMessage {
  type: "pong";
  isServer: boolean;
  clientId: string;
  servers: Peer[];
}

export interface QueryMessage extends BaseMessage {
  type: "query";
  key: string; // key we want to get
}

export interface QueryAckMessage extends BaseMessage {
  type: "queryAck";
  keys: string[];
}

export interface FunctionMessage extends BaseMessage {
  type: "function";
  function: string;
  args: AllowedFunctionArguments<any>;
}

export interface FunctionReturnMessage extends BaseMessage {
  type: "functionReturn";
  code: FunctionCodes;
  return: AllowedFunctionReturn<any>;
}

export interface SubscribeMessage extends BaseMessage {
  type: "subscribe";
  key: string;
}

export interface GetMessage extends BaseMessage {
  type: "get";
  key: string; // key we want to get
}

export interface PutMessage<T = any> extends BaseMessage, VerificationData<T> {
  type: "put";
}

export interface CrdtPutMessage extends BaseMessage, VerificationData<string> {
  type: "crdtPut";
}

export interface CrdtGetMessage extends BaseMessage {
  type: "crdtGet";
  key: string;
}

export interface CrdtMessage extends BaseMessage {
  type: "crdt";
  key: string;
  doc: string;
}

export type ToolDbMessage =
  | PingMessage
  | PongMessage
  | QueryMessage
  | QueryAckMessage
  | FunctionMessage
  | FunctionReturnMessage
  | SubscribeMessage
  | GetMessage
  | PutMessage
  | CrdtPutMessage
  | CrdtGetMessage
  | CrdtMessage;
