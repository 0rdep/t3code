import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export const RelayDeploymentConfig = Config.all({
  relayPublicDomain: Config.string("T3_RELAY_DOMAIN"),
  managedEndpointZoneName: Config.string("T3_RELAY_ZONE_NAME"),
}).pipe(
  Config.map((config) => ({
    relayPublicDomain: config.relayPublicDomain,
    relayPublicOrigin: `https://${config.relayPublicDomain}`,
    managedEndpointZoneName: config.managedEndpointZoneName,
  })),
);

export const ManagedEndpointZone = RelayDeploymentConfig.pipe(
  Config.map(({ managedEndpointZoneName }) => managedEndpointZoneName),
  Effect.flatMap((name) => Cloudflare.Zone("ManagedEndpointZone", { name }).pipe(adopt(true))),
);
