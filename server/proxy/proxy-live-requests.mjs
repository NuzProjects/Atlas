export function installLiveRequests(root, targetUrl, resourceAddress, socketAddress) {
  if (root.WebSocket) {
    const NativeWebSocket = root.WebSocket;
    root.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const destination = new URL(String(url), targetUrl);
        if (destination.protocol === 'http:') destination.protocol = 'ws:';
        if (destination.protocol === 'https:') destination.protocol = 'wss:';
        if (!['ws:', 'wss:'].includes(destination.protocol) || destination.hash)
          throw new root.DOMException('Invalid WebSocket URL', 'SyntaxError');
        super(socketAddress(destination.href), protocols);
      }
    };
  }
  if (root.EventSource) {
    const NativeEventSource = root.EventSource;
    root.EventSource = class extends NativeEventSource {
      constructor(url, options) {
        super(resourceAddress(new URL(String(url), targetUrl).href), options);
      }
    };
  }
}
