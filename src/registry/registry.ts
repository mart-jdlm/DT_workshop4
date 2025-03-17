import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, exportPrvKey } from "../crypto";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  let nodes: Node[] = [];
  let privateKeys: { [nodeId: number]: string } = {};

  _registry.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  _registry.post("/registerNode", (req: Request, res: Response) => {
    const { nodeId, pubKey } = req.body as RegisterNodeBody;
    nodes.push({ nodeId, pubKey });
    res.json({ result: "success" });
  });

  _registry.get("/getNodeRegistry", (req: Request, res: Response) => {
    res.json({ nodes });
  });

  _registry.get("/getPrivateKey/:nodeId", (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId, 10);
    const prvKey = privateKeys[nodeId];
    res.json({ result: prvKey });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}