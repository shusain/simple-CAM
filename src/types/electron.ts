import type { CamProjectFile, OctoprintSettings } from './index';

export interface OpenProjectResult {
  canceled: boolean;
  error?: string;
  filePath?: string;
  project?: CamProjectFile;
}

export interface SaveProjectPayload {
  suggestedName: string;
  project: CamProjectFile;
}

export interface SaveProjectResult {
  canceled: boolean;
  error?: string;
  filePath?: string;
}

export interface ExportGcodePayload {
  suggestedName: string;
  gcode: string;
}

export interface ExportGcodeResult {
  canceled: boolean;
  error?: string;
  filePath?: string;
}

export interface SaveOctoprintSettingsPayload {
  settings: OctoprintSettings;
}

export interface OctoprintSettingsResult {
  ok: boolean;
  error?: string;
  settings?: OctoprintSettings;
}

export interface UploadToOctoprintPayload {
  gcode: string;
  fileName: string;
  runAfterUpload: boolean;
}

export interface UploadToOctoprintResult {
  ok: boolean;
  error?: string;
  fileName?: string;
  runAfterUpload?: boolean;
  response?: unknown;
}

export interface ElectronBridge {
  openProject?: () => Promise<OpenProjectResult>;
  saveProject?: (payload: SaveProjectPayload) => Promise<SaveProjectResult>;
  exportGcode?: (payload: ExportGcodePayload) => Promise<ExportGcodeResult>;
  getOctoprintSettings?: () => Promise<OctoprintSettingsResult>;
  saveOctoprintSettings?: (payload: SaveOctoprintSettingsPayload) => Promise<OctoprintSettingsResult>;
  uploadToOctoprint?: (payload: UploadToOctoprintPayload) => Promise<UploadToOctoprintResult>;
  onMenuNew?: (callback: () => void) => () => void;
  onMenuOpen?: (callback: () => void) => () => void;
  onMenuSave?: (callback: () => void) => () => void;
  onMenuExportGcode?: (callback: () => void) => () => void;
  onMenuOctoprintSettings?: (callback: () => void) => () => void;
  onMenuZoomIn?: (callback: () => void) => () => void;
  onMenuZoomOut?: (callback: () => void) => () => void;
  onMenuZoomReset?: (callback: () => void) => () => void;
}
