"use strict";
const APP_VERSION = "2026-04-27 14:58";

let device = null;
let gattServer = null;
let service = null;
let writeChar = null;
let notifyChar = null;
let notifying = false;

const el = {
  namePrefix: document.getElementById("namePrefix"),
  serviceUuid: document.getElementById("serviceUuid"),
  writeUuid: document.getElementById("writeUuid"),
  notifyUuid: document.getElementById("notifyUuid"),
  header0: document.getElementById("header0"),
  header1: document.getElementById("header1"),
  cmd: document.getElementById("cmd"),
  payloadHex: document.getElementById("payloadHex"),
  textPayload: document.getElementById("textPayload"),
  logBox: document.getElementById("logBox"),
  status: document.getElementById("status"),
  btnCheck: document.getElementById("btnCheck"),
  btnConnect: document.getElementById("btnConnect"),
  btnDisconnect: document.getElementById("btnDisconnect"),
  btnSendFrame: document.getElementById("btnSendFrame"),
  btnSendText: document.getElementById("btnSendText"),
  btnClearLog: document.getElementById("btnClearLog"),
  quickBtns: document.querySelectorAll(".quick")
};

function now() {
  return new Date().toLocaleTimeString();
}

function setStatus(msg, type) {
  el.status.textContent = msg;
  el.status.className = "status" + (type ? " " + type : "");
}

function log(msg) {
  el.logBox.value += "[" + now() + "] " + msg + "\n";
  el.logBox.scrollTop = el.logBox.scrollHeight;
}

function normalizeUuid(v) {
  return (v || "").trim().toLowerCase();
}

function byteToHex(b) {
  return (b & 0xff).toString(16).padStart(2, "0").toUpperCase();
}

function bytesToHex(data) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    out.push(byteToHex(data[i]));
  }
  return out.join(" ");
}

function hexToBytes(text) {
  const cleaned = (text || "").trim();
  if (!cleaned) {
    return new Uint8Array(0);
  }

  const parts = cleaned.split(/[\s,]+/);
  const out = [];
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(p)) {
      throw new Error("Hex không hợp lệ: " + p);
    }
    out.push(parseInt(p, 16));
  }
  return new Uint8Array(out);
}

function getByteFromInput(id, label) {
  const raw = document.getElementById(id).value.trim();
  if (!/^[0-9a-fA-F]{1,2}$/.test(raw)) {
    throw new Error(label + " phải là 1 byte hex.");
  }
  return parseInt(raw, 16) & 0xff;
}

function buildFrame(header0, header1, cmd, payload) {
  const len = payload.length & 0xff;
  const frame = new Uint8Array(5 + len);
  frame[0] = header0;
  frame[1] = header1;
  frame[2] = cmd;
  frame[3] = len;
  frame.set(payload, 4);
  frame[4 + len] = 0x16;
  return frame;
}

function parseFrame(data) {
  if (!data || data.length < 5) {
    return { ok: false, reason: "không đủ độ dài" };
  }

  const len = data[3];
  if (4 + len >= data.length) {
    return { ok: false, reason: "len không khớp" };
  }

  const payload = data.slice(4, 4 + len);
  const tail = data[4 + len];
  return {
    ok: true,
    header0: data[0],
    header1: data[1],
    cmd: data[2],
    len,
    payload,
    tail
  };
}

function ensureConnected() {
  if (!device || !gattServer || !gattServer.connected || !writeChar) {
    throw new Error("Chưa kết nối BLE.");
  }
}

function onDisconnected() {
  log("Thiết bị đã ngắt kết nối.");
  setStatus("Đã ngắt kết nối", "bad");
  device = null;
  gattServer = null;
  service = null;
  writeChar = null;
  notifyChar = null;
  notifying = false;
}

async function checkSupport() {
  if (!("bluetooth" in navigator)) {
    setStatus("Trình duyệt không hỗ trợ Web Bluetooth", "bad");
    log("navigator.bluetooth không tồn tại.");
    return;
  }

  const available = await navigator.bluetooth.getAvailability();
  if (available) {
    setStatus("BLE sẵn sàng", "ok");
  } else {
    setStatus("BLE chưa sẵn sàng", "bad");
  }
  log("Web BLE OK, adapter available=" + String(available));
}

async function connectDevice() {
  if (!("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth không được hỗ trợ.");
  }

  const namePrefix = el.namePrefix.value.trim();
  const serviceUuid = normalizeUuid(el.serviceUuid.value);
  const writeUuid = normalizeUuid(el.writeUuid.value);
  const notifyUuid = normalizeUuid(el.notifyUuid.value);
  if (!serviceUuid || !writeUuid || !notifyUuid) {
    throw new Error("Thiếu UUID.");
  }

  const options = { acceptAllDevices: true, optionalServices: [serviceUuid] };
  if (namePrefix) {
    log("Dang quet tat ca thiet bi. Goi y: chon ten bat dau bang \"" + namePrefix + "\".");
  }

  log("Mở hộp chọn thiết bị...");
  device = await navigator.bluetooth.requestDevice(options);
  device.addEventListener("gattserverdisconnected", onDisconnected);
  log("Đã chọn: " + (device.name || "<không tên>"));

  gattServer = await device.gatt.connect();
  service = await gattServer.getPrimaryService(serviceUuid);
  writeChar = await service.getCharacteristic(writeUuid);
  if (notifyUuid === writeUuid) {
    notifyChar = writeChar;
  } else {
    try {
      notifyChar = await service.getCharacteristic(notifyUuid);
    } catch (err) {
      notifyChar = null;
      log("Khong lay duoc notify characteristic, se tiep tuc voi write-only.");
    }
  }

  if (notifyChar && notifyChar.properties && notifyChar.properties.notify && notifyChar.startNotifications) {
    await notifyChar.startNotifications();
    notifyChar.addEventListener("characteristicvaluechanged", onNotify);
    notifying = true;
  } else {
    notifying = false;
    log("Thiet bi khong ho tro notify hoac notify UUID khong ton tai.");
  }

  setStatus("Đã kết nối: " + (device.name || "<không tên>"), "ok");
  log("Connected. notify=" + String(notifying));
}

async function disconnectDevice() {
  if (device && device.gatt && device.gatt.connected) {
    device.gatt.disconnect();
  } else {
    log("Không có kết nối để ngắt.");
  }
}

async function writeBytes(data) {
  ensureConnected();
  const props = (writeChar && writeChar.properties) ? writeChar.properties : {};
  if (props.writeWithoutResponse && typeof writeChar.writeValueWithoutResponse === "function") {
    await writeChar.writeValueWithoutResponse(data);
    return;
  }
  if (typeof writeChar.writeValue === "function") {
    await writeChar.writeValue(data);
    return;
  }
  if (typeof writeChar.writeValueWithResponse === "function") {
    await writeChar.writeValueWithResponse(data);
    return;
  }
  throw new Error("Characteristic khong ho tro write tren trinh duyet hien tai.");
}

function onNotify(event) {
  const view = event.target.value;
  const data = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  log("RX HEX: " + bytesToHex(data));

  const frame = parseFrame(data);
  if (!frame.ok) {
    log("RX parse: " + frame.reason);
    return;
  }

  log(
    "RX frame: H=" +
      byteToHex(frame.header0) + " " + byteToHex(frame.header1) +
      " CMD=" + byteToHex(frame.cmd) +
      " LEN=" + frame.len +
      " PAYLOAD=" + bytesToHex(frame.payload) +
      " TAIL=" + byteToHex(frame.tail)
  );
}

async function sendFrameFromInputs() {
  const header0 = getByteFromInput("header0", "Header0");
  const header1 = getByteFromInput("header1", "Header1");
  const cmd = getByteFromInput("cmd", "CMD");
  const payload = hexToBytes(el.payloadHex.value);
  const frame = buildFrame(header0, header1, cmd, payload);
  await writeBytes(frame);
  log("TX frame: " + bytesToHex(frame));
}

async function sendText() {
  const txt = el.textPayload.value || "";
  const data = new TextEncoder().encode(txt);
  await writeBytes(data);
  log("TX text len=" + data.length + " \"" + txt + "\"");
}

async function sendQuick(btn) {
  const cmdHex = btn.dataset.cmd || "00";
  const payloadHex = btn.dataset.payload || "";
  const cmd = parseInt(cmdHex, 16) & 0xff;
  const payload = hexToBytes(payloadHex);
  const frame = buildFrame(
    getByteFromInput("header0", "Header0"),
    getByteFromInput("header1", "Header1"),
    cmd,
    payload
  );
  await writeBytes(frame);
  log("TX quick CMD=" + cmdHex + ": " + bytesToHex(frame));
}

async function run(task) {
  try {
    await task();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    setStatus("Lỗi: " + msg, "bad");
    log("ERROR: " + msg);
  }
}

el.btnCheck.addEventListener("click", () => run(checkSupport));
el.btnConnect.addEventListener("click", () => run(connectDevice));
el.btnDisconnect.addEventListener("click", () => run(disconnectDevice));
el.btnSendFrame.addEventListener("click", () => run(sendFrameFromInputs));
el.btnSendText.addEventListener("click", () => run(sendText));
el.btnClearLog.addEventListener("click", () => {
  el.logBox.value = "";
});
el.quickBtns.forEach((btn) => {
  btn.addEventListener("click", () => run(() => sendQuick(btn)));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      log("Không đăng ký được service worker (không ảnh hưởng BLE).");
    });
  });
}

log("MVAPP BLE Tool san sang. Version " + APP_VERSION);
