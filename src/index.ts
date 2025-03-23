import { launchOnionRouters } from "./onionRouters/launchOnionRouters";
import { launchRegistry } from "./registry/registry";
import { launchUsers } from "./users/launchUsers";

export async function launchNetwork(nbNodes: number, nbUsers: number) {
  // Lancer le registre
  const registry = await launchRegistry();

  // Lancer les nœuds
  const onionServers = await launchOnionRouters(nbNodes);

  // Lancer les utilisateurs
  const userServers = await launchUsers(nbUsers);

  return [registry, ...onionServers, ...userServers];
}