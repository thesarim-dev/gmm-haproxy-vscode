/** Server-side settings mirroring the contributes.configuration entries. */
export interface ServerSettings {
  version: string;
  validationEnabled: boolean;
  completionEnabled: boolean;
}

export const DEFAULT_SETTINGS: ServerSettings = {
  version: '3.1',
  validationEnabled: true,
  completionEnabled: true,
};
