export {};

interface BrowserLastError {
  message?: string;
}

interface BrowserRuntime {
  lastError?: BrowserLastError;
  sendNativeMessage: (application: string, message: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void,
    ) => void;
  };
  onInstalled: {
    addListener: (listener: () => void) => void;
  };
}

interface BrowserTab {
  id?: number;
}

interface BrowserTabs {
  query: (query: { active: boolean; currentWindow: boolean }) => Promise<BrowserTab[]>;
  sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
}

declare global {
  const browser: {
    runtime: BrowserRuntime;
    tabs: BrowserTabs;
  };
}
