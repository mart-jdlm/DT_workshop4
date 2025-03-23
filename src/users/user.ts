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
      res.status(400).json({ error: "Request data is invalid" });
      return;
    }
  
    try {
      const nodesListResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const nodesData = (await nodesListResponse.json()) as { nodes: Node[] };
      const allNodes = nodesData.nodes;
  
      if (allNodes.length < 3) {
        res.status(500).json({ error: "Insufficient nodes available" });
        return;
      }
  
      const randomNodes = allNodes.sort(() => Math.random() - 0.5).slice(0, 3);
      const nodePath = randomNodes.map(node => node.nodeId);
      lastCircuit = nodePath;
  
      const secretKeys = await Promise.all(nodePath.map(() => createRandomSymmetricKey()));
  
      let layeredMessage = message;
  
      for (let i = nodePath.length - 1; i >= 0; i--) {
        const nextStop = i === nodePath.length - 1
          ? (BASE_USER_PORT + destinationUserId).toString().padStart(10, "0")
          : (BASE_ONION_ROUTER_PORT + nodePath[i + 1]).toString().padStart(10, "0");
  
        layeredMessage = await symEncrypt(secretKeys[i], nextStop + layeredMessage);
  
        const wrappedKey = await rsaEncrypt(await exportSymKey(secretKeys[i]), randomNodes[i].pubKey);
  
        layeredMessage = wrappedKey + layeredMessage;
      }
  
      const firstNodeId = nodePath[0];
      const firstNodeAddress = `http://localhost:${BASE_ONION_ROUTER_PORT + firstNodeId}/message`;
  
      const sendResult = await fetch(firstNodeAddress, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: layeredMessage }),
      });
  
      if (!sendResult.ok) {
        throw new Error(`Failed to deliver message to initial node: ${sendResult.status}`);
      }
  
      lastSentMessage = message;
      res.json({ success: "Message delivered successfully" });
    } catch (err) {
      console.error("Failed to send message:", err);
      res.status(500).json({ error: "Message delivery failed due to an internal error" });
    }
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}