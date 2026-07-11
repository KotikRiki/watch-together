let _socket: any = null;
let _roomCode: string | null = null;

export function setLogSocket(socket: any, roomCode: string | null) {
  _socket = socket;
  _roomCode = roomCode;
}

export function clog(tag: string, msg: string) {
  if (_socket && _roomCode) {
    _socket.emit("client-log", _roomCode, tag, msg);
  }
}
