import logger from "../config/logger.js";
import dns from "dns";
import net from "net";

const smtpHost = "smtp.hostinger.com";
const smtpPort = 587;

let connected = false; // flag to track connection

// ----------------------
// 1️⃣ DNS Lookup Test
// ----------------------
dns.lookup(smtpHost, (err, address) => {
  if (err) logger.error("DNS lookup failed:", err);
  else logger.info("DNS lookup successful! IP: " + address);
});

// ----------------------
// 2️⃣ TCP Connection Test
// ----------------------
const socket = net.createConnection(smtpPort, smtpHost);

socket.setTimeout(5000); // 5 seconds timeout

socket.on("connect", () => {
  connected = true;
  logger.info(`TCP connection successful to ${smtpHost}:${smtpPort}`);
  socket.end();
});

socket.on("timeout", () => {
  if (!connected) {
    logger.error(`TCP connection timed out to ${smtpHost}:${smtpPort}`);
  }
  socket.destroy();
});

socket.on("error", (err) => {
  if (!connected) {
    logger.error(`TCP connection error to ${smtpHost}:${smtpPort}: ${err.message}`);
  }
});
