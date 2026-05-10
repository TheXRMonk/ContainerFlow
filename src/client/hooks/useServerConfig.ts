import { useEffect, useState, useCallback } from "react";
import type { Service, ServerConfig } from "../../shared/types";

const DEFAULT_CONFIG: ServerConfig = {
  allowedPaths: [],
  allowNonCompose: true,
  restrictedMode: false,
};

export function useServerConfig(token: string) {
  const [config, setConfig] = useState<ServerConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/config", { headers })
      .then((r) => (r.ok ? r.json() : DEFAULT_CONFIG))
      .then((data: ServerConfig) => setConfig({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => {});
  }, [token]);

  /** Returns true if the service can be acted upon (start/stop/restart/rebuild/remove/exec).
   *  When restrictedMode is off, always returns true. */
  const canInteract = useCallback(
    (service: Pick<Service, "compose_file">): boolean => {
      if (!config.restrictedMode) return true;
      const cf = service.compose_file;
      if (!cf) return config.allowNonCompose;
      return config.allowedPaths.some(
        (prefix) => cf === prefix || cf.startsWith(prefix.replace(/\/+$/, "") + "/")
      );
    },
    [config]
  );

  return { config, canInteract };
}
