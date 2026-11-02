/** Shared technical contracts between system components. */

export interface ApiStatus {
  status: string;
  service?: string;
  name?: string;
  version?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface ApiRootInfo {
  name: string;
  version: string;
  status: string;
  app_env: string;
}
