import type { ElectronBridge } from './electron';

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export {};
