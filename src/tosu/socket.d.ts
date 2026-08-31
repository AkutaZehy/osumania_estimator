export default class WebSocketManager {
  constructor(host?: string);
  sockets: { [key: string]: WebSocket };
  createConnection(url: string, callback: (data: any) => void, filters?: any[]): void;
  api_v1(callback: (data: any) => void, filters?: any[]): void;
  api_v2(callback: (data: any) => void, filters?: any[]): void;
  api_v2_precise(callback: (data: any) => void, filters?: any[]): void;
  commands(callback: (data: { command: string; message: any }) => void): void;
  sendCommand(name: string, command: string | object, amountOfRetries?: number): void;
  close(url: string): void;
}
