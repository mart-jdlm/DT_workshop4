import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, importPubKey, symEncrypt, rsaEncrypt } from "../crypto";
import { Node } from "../registry/registry";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;
  let lastCircuit: number[] | null = null;

  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.get("/getLastCircuit", (req, res) => {
    res.json({ result: lastCircuit });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
    if (typeof message === "string") {
      lastReceivedMessage = message;
      res.status(200).send("success");
    } else {
      res.status(400).json({ error: "Invalid message format" });
    }
  });

  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body as SendMessageBody;

    if (typeof message !== "string" || typeof destinationUserId !== "number") {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    try {
      const registryResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registryData = (await registryResponse.json()) as { nodes: Node[] };
      const availableNodes = registryData.nodes;

      if (availableNodes.length < 3) {
        res.status(500).json({ error: "Not enough nodes in the network" });
        return;
      }

      const shuffledNodes = availableNodes.sort(() => 0.5 - Math.random()).slice(0, 3);
      const circuit = shuffledNodes.map(node => node.nodeId);
      lastCircuit = circuit;

      const symmetricKeys = await Promise.all(circuit.map(() => createRandomSymmetricKey()));

      let encryptedMessage = message;

      for (let i = 2; i >= 0; i--) {
        const nextDestination = i === 2
          ? (BASE_USER_PORT + destinationUserId).toString().padStart(10, "0")
          : (BASE_ONION_ROUTER_PORT + circuit[i + 1]).toString().padStart(10, "0");

        encryptedMessage = await symEncrypt(symmetricKeys[i], nextDestination + encryptedMessage);

        const encryptedSymKey = await rsaEncrypt(await exportSymKey(symmetricKeys[i]), shuffledNodes[i].pubKey);

        encryptedMessage = encryptedSymKey + encryptedMessage;
      }

      const entryNode = circuit[0];
      const entryNodeUrl = `http://localhost:${BASE_ONION_ROUTER_PORT + entryNode}/message`;

      const response = await fetch(entryNodeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: encryptedMessage }),
      });

      if (!response.ok) {
        throw new Error(`Error sending message to the first node: ${response.status}`);
      }

      lastSentMessage = message;
      res.json({ status: "Message sent successfully" });
    } catch (error) {
      console.error("Error while sending the message:", error);
      res.status(500).json({ error: "Internal error while sending the message" });
    }
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}