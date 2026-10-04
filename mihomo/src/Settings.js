/** 运行参数、嗅探、TUN 与 Geo 数据。 */
function kosuzuBool(value) {
  return value === true || value === 1 || value === "1" ||
    (typeof value === "string" && value.toLowerCase() === "true");
}

function createKosuzuOptions() {
  const args = typeof $arguments === "object" && $arguments ? $arguments : {};
  const threshold = Number(args.threshold);
  return {
    threshold: args.threshold != null && Number.isFinite(threshold)
      ? Math.max(1, Math.floor(threshold)) : 1,
    quic: kosuzuBool(args.quic),
    tun: kosuzuBool(args.tun),
    full: kosuzuBool(args.full),
    ipv6: kosuzuBool(args.ipv6),
    keepalive: kosuzuBool(args.keepalive),
  };
}

function createKosuzuRuntime(options, hasTailscale) {
  const geoBase = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release";
  return {
    ...(options.full ? {
      "mixed-port": 7890,
      "redir-port": 7892,
      "tproxy-port": 7893,
      "routing-mark": 7894,
      "allow-lan": true,
      "bind-address": "*",
      ipv6: options.ipv6,
      mode: "rule",
      "unified-delay": true,
      "tcp-concurrent": true,
      "find-process-mode": "off",
      "log-level": "info",
      "geodata-loader": "standard",
      "external-controller": ":9999",
      "disable-keep-alive": !options.keepalive,
    } : {}),
    profile: { "store-selected": true },
    sniffer: {
      sniff: {
        TLS: { ports: [443, 8443] },
        HTTP: { ports: [80, 8080, 8880] },
        QUIC: { ports: [443, 8443] },
      },
      "override-destination": false,
      enable: true,
      "force-dns-mapping": true,
      "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"],
    },
    tun: {
      enable: options.tun,
      stack: "gvisor",
      device: "mihomo",
      "route-exclude-address": hasTailscale
        ? ["192.168.0.0/16"]
        : ["100.64.0.0/10", "fd7a:115c:a1e0::/48", "192.168.0.0/16"],
      "dns-hijack": ["any:53"],
      mtu: 1500,
    },
    "geodata-mode": true,
    "geox-url": {
      geoip: `${geoBase}/geoip.dat`,
      geosite: `${geoBase}/geosite.dat`,
      mmdb: `${geoBase}/country.mmdb`,
      asn: `${geoBase}/GeoLite2-ASN.mmdb`,
    },
  };
}
