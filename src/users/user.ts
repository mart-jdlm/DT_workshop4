import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, symEncrypt, rsaEncrypt } from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export type GetNodeRegistryBody = {
  nodes: { nodeId: number; pubKey: string }[];
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;

  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
    lastReceivedMessage = message;
    res.send("success");
  });

  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body as SendMessageBody;
    lastSentMessage = message;

    // Récupérer la liste des nœuds enregistrés
    const registryResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
    const { nodes } = (await registryResponse.json()) as GetNodeRegistryBody;

    // Créer un circuit de 3 nœuds distincts
    const circuit = nodes.slice(0, 3);

    // Chiffrer le message pour chaque nœud du circuit
    let encryptedMessage = message;
    for (const node of circuit.reverse()) {
      const symKey = await createRandomSymmetricKey();
      const encryptedSymKey = await rsaEncrypt(await exportSymKey(symKey), node.pubKey);
      encryptedMessage = await symEncrypt(symKey, encryptedMessage);
      encryptedMessage = encryptedSymKey + encryptedMessage;
    }

    // Envoyer le message chiffré au premier nœud du circuit
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + circuit[0].nodeId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: encryptedMessage }),
    });

    res.send("success");
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}