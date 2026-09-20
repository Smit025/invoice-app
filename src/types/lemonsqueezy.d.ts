export {};

declare global {
  interface LemonJsEvent {
    event: string;
    data?: unknown;
  }

  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Setup: (options: { eventHandler: (event: LemonJsEvent) => void }) => void;
      Refresh: () => void;
      Url: {
        Open: (url: string) => void;
        Close: () => void;
      };
      Affiliate: {
        GetID: () => string;
        Build: (url: string) => string;
      };
    };
  }
}
