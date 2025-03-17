import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT } from "../config";
import { rsaDecrypt, symDecrypt, importPrvKey, base64ToArrayBuffer, arrayBufferToBase64 } from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  onionRouter.post("/message", async (req, res) => {
    const { message } = req.body;
    lastReceivedEncryptedMessage = message;

    const encryptedMessage = base64ToArrayBuffer(message);

    const privateKeyResponse = await fetch(`http://localhost:8080/getPrivateKey/${nodeId}`);
    const { result: privateKeyBase64 } = await privateKeyResponse.json() as { result: string };
    const privateKey = await importPrvKey(privateKeyBase64);

    const encryptedMessageBase64 = arrayBufferToBase64(encryptedMessage);

    const decryptedMessage = await rsaDecrypt(encryptedMessageBase64, privateKey);
    lastReceivedDecryptedMessage = decryptedMessage;

    const nextDestination = parseInt(decryptedMessage.slice(0, 10), 10);
    lastMessageDestination = nextDestination;

    const nextMessage = decryptedMessage.slice(10);
    await fetch(`http://localhost:${nextDestination}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: nextMessage }),
    });

    res.send("success");
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}